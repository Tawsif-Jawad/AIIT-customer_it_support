/**
 * Enterprise IT Support Platform - Modular Backend Application & REST API
 * Enforces Keycloak/OIDC JWT auth, RBAC, SBU scoping, Ticket State Machine,
 * Deterministic Mock AI Orchestration, Approval Workflows, and Audit Logging.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import {
  type Approval,
  type RoleName,
  type Ticket,
  type TicketSeverity,
  type TicketStatus,
  type User,
  ValidationError,
  canAccessTicket,
  canModifyTicketStatus,
  redactSensitiveData,
  validateCreateTicketInput,
} from '../../../packages/shared/src/index.ts';
import {
  DeterministicMockAIOrchestrator,
  DevelopmentEmailTransport,
  MockActiveDirectoryAdapter,
  UnconfiguredMailboxProvisioningAdapter,
} from '../../../packages/connectors/src/index.ts';
import { EnterpriseDataStore } from './store.ts';
import { issueOIDCToken, verifyOIDCToken, isDevelopmentAuthEnabled } from './auth.ts';
import { NotificationQueueProcessor } from './queue.ts';

export interface AppInstance {
  server: http.Server;
  handleRequest: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
  inject: (options: {
    method: string;
    url: string;
    token?: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  }) => Promise<{ status: number; headers: Record<string, string>; data: Record<string, any> }>;
  store: EnterpriseDataStore;
  aiOrchestrator: DeterministicMockAIOrchestrator;
  adAdapter: MockActiveDirectoryAdapter;
  emailTransport: DevelopmentEmailTransport;
  mailboxProvisioner: UnconfiguredMailboxProvisioningAdapter;
  queueProcessor: NotificationQueueProcessor;
}

function redactValue(value: unknown): any {
  if (typeof value === 'string') return redactSensitiveData(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /password|passwd|secret|token|api[_-]?key/i.test(key) ? '[REDACTED_SECRET]' : redactValue(item)]));
  return value;
}

export function createApiServer(customStorePath?: string): AppInstance {
  if (process.env.MAIL_PROVIDER && process.env.MAIL_PROVIDER !== 'mock') throw new Error('JSON_MODE_REQUIRES_MOCK_MAIL: External delivery requires a transactional outbox.');
  const store = new EnterpriseDataStore(customStorePath);
  const aiOrchestrator = new DeterministicMockAIOrchestrator();
  const adAdapter = new MockActiveDirectoryAdapter();
  const emailTransport = new DevelopmentEmailTransport({
    mode: (process.env.MAIL_PROVIDER as 'mock' | 'mailpit') || 'mock',
    smtpHost: process.env.SMTP_HOST || 'localhost',
    smtpPort: Number(process.env.SMTP_PORT || 1025),
    fromAddress: process.env.MAIL_FROM_ADDRESS || 'noreply-itsupport@local.dev.invalid',
  });
  const mailboxProvisioner = new UnconfiguredMailboxProvisioningAdapter();
  const queueProcessor = new NotificationQueueProcessor(store, emailTransport);

  // Simple per-IP rate limiting map
  const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

  function logStructured(level: 'INFO' | 'WARN' | 'ERROR', event: string, meta: Record<string, unknown> = {}) {
    // Ensure tokens/passwords never leak in logs
    const safeMeta = redactValue(meta);
    if (process.env.NODE_ENV !== 'test') {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level,
          service: 'it-support-api',
          event,
          ...safeMeta,
        })
      );
    }
  }

  function recordAudit(params: {
    actor: User | null;
    action: string;
    resource: string;
    resourceId?: string | null;
    ipAddress?: string;
    details?: Record<string, unknown>;
  }) {
    const state = store.getState();
    state.auditLogs.unshift({
      id: crypto.randomUUID(),
      actorId: params.actor?.id || null,
      actorEmail: params.actor?.email || null,
      actorRole: params.actor?.roleName || null,
      sbuId: params.actor?.sbuId || null,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId || null,
      ipAddress: params.ipAddress || '127.0.0.1',
      details: redactValue(params.details || {}),
      createdAt: new Date().toISOString(),
    });
    store.persist();
  }

  function sendJson(res: http.ServerResponse, statusCode: number, data: unknown) {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': 'no-store',
      ...(process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*' ? {'Access-Control-Allow-Origin': process.env.CORS_ORIGIN, 'Vary': 'Origin'} : {}),
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    });
    res.end(JSON.stringify(data));
  }

  function sendError(res: http.ServerResponse, statusCode: number, code: string, message: string, details?: unknown) {
    sendJson(res, statusCode, {
      error: {
        code,
        message,
        details: details || null,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async function consumeBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      req.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > 1024 * 1024) {
          reject(new ValidationError(['Request payload exceeds 1MB limit']));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (chunks.length === 0) {
          resolve({});
          return;
        }
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { reject(new ValidationError(['JSON body must be an object'])); return; }
          resolve(parsed);
        } catch {
          reject(new ValidationError(['Malformed JSON body']));
        }
      });
      req.on('error', (err) => reject(err));
      req.on('aborted', () => reject(new ValidationError(['Request aborted'])));
    });
  }

  const bodies = new WeakMap<http.IncomingMessage, Promise<Record<string, unknown>>>();
  function readBody(req: http.IncomingMessage) { return bodies.get(req) || consumeBody(req); }

  function extractAuthenticatedUser(req: http.IncomingMessage): User | null {
    let token: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)itsupport_session=([^;]+)/);
      if (match) { try { token = decodeURIComponent(match[1]); } catch { return null; } }
    }
    if (!token) return null;

    const claims = verifyOIDCToken(token);
    if (!claims) return null;

    const state = store.getState();
    const sessionId = crypto.createHash('sha256').update(token).digest('hex');
    if (!state.authSessions?.some(s => s.id === sessionId && s.userId === claims.sub && s.expiresAt > Date.now())) return null;
    const user = state.users.find((u) => u.id === claims.sub && u.isActive && u.roleName !== 'SYSTEM_SERVICE');
    return user || null;
  }

  const runRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const method = req.method || 'GET';
    const rawUrl = req.url || '/';
    const parsedUrl = new URL(rawUrl, `http://${req.headers?.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const clientIp = req.socket?.remoteAddress || '127.0.0.1';

    // Browser cookie writes require a verified same-origin request. Bearer-only
    // CLI clients need no Origin; external browser origins must be allowlisted.
    const origin = req.headers.origin;
    const sameOrigin = `${('encrypted' in (req.socket || {}) && (req.socket as { encrypted?: boolean }).encrypted) ? 'https' : 'http'}://${req.headers.host}`;
    const allowedOrigin = origin === sameOrigin || (!!process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*' && origin === process.env.CORS_ORIGIN);
    if ((origin && !allowedOrigin) || (req.headers.cookie?.includes('itsupport_session=') && !['GET','HEAD','OPTIONS'].includes(method) && !allowedOrigin)) {
      sendError(res, 403, 'ORIGIN_DENIED', 'A verified same-origin request is required.'); return;
    }

    if (method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }

    // Rate limiting check (250 requests per minute per IP)
    const nowMs = Date.now();
    const rateRecord = rateLimitMap.get(clientIp);
    if (!rateRecord || nowMs - rateRecord.windowStart > 60_000) {
      rateLimitMap.set(clientIp, { count: 1, windowStart: nowMs });
    } else {
      rateRecord.count++;
      if (rateRecord.count > 250) {
        sendError(res, 429, 'RATE_LIMIT_EXCEEDED', 'Too many requests; please retry shortly.');
        return;
      }
    }

    try {
      // ======================================================================
      // 1. HEALTH, READINESS & OPENAPI SPECIFICATION
      // ======================================================================
      if (method === 'GET' && pathname === '/api/health') {
        const dbHealthy = store.isHealthy();
        const queueHealth = queueProcessor.getQueueHealth();
        const adHealth = await adAdapter.getHealth();
        const mailHealth = await emailTransport.getHealth();

        const status = dbHealthy ? 200 : 503;
        sendJson(res, status, {
          status: dbHealthy ? 'MOCK MODE' : 'DEGRADED',
          service: 'it-support-api',
          version: '1.0.0-milestone1',
          components: {
            database: dbHealthy ? { status: 'CONNECTED', mode: 'local-json-development-store' } : { status: 'UNAVAILABLE' },
            redisQueue: queueHealth,
            keycloakOidc: {
              status: 'UNKNOWN',
              note: 'Live Keycloak connectivity and federation are not verified; development tokens are locally issued.',
              issuer: process.env.KEYCLOAK_ISSUER_URL || 'http://localhost:8080/realms/upstra-enterprise',
              mode: process.env.AUTH_MODE || 'dev_oidc',
            },
            activeDirectory: adHealth,
            emailSystem: mailHealth,
            aiOrchestrator: {
              status: 'MOCK MODE',
              provider: aiOrchestrator.providerName,
              model: aiOrchestrator.modelName,
              note: 'Deterministic policy-governed mock provider (not a live LLM)',
            },
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/openapi.json') {
        sendJson(res, 200, {
          openapi: '3.1.0',
          info: {
            title: 'AIIT API',
            version: '1.0.0',
            description: 'Modular REST API for AI-powered IT Support, SBU Ticketing, Approvals, Assets, and CTO Escalations',
          },
          paths: {
            '/api/health': { get: { summary: 'System health and integration readiness' } },
            '/api/auth/identities': { get: { summary: 'List development OIDC test identities' } },
            '/api/auth/login': { post: { summary: 'Authenticate via Keycloak OIDC / development identity' } },
            '/api/auth/me': { get: { summary: 'Current authenticated user profile and permissions' } },
            '/api/catalog': { get: { summary: 'List IT service catalog categories and custom schemas' } },
            '/api/tickets': {
              get: { summary: 'List tickets scoped by role and SBU with filtering and pagination' },
              post: { summary: 'Submit a new ticket and run deterministic AI triage & safety policy engine' },
            },
            '/api/tickets/{id}': { get: { summary: 'Get ticket details, event history, AI logs, and comments' } },
            '/api/tickets/{id}/transition': { post: { summary: 'Transition ticket status with state-machine and RBAC enforcement' } },
            '/api/tickets/{id}/escalate-cto': { post: { summary: 'IT Admin or policy escalation to CTO queue' } },
            '/api/tickets/{id}/comments': { post: { summary: 'Add comment to an authorized ticket' } },
            '/api/approvals': { get: { summary: 'List pending/decided human approvals' } },
            '/api/approvals/{id}/decide': { post: { summary: 'Approve or reject a sensitive operation (IT_ADMIN / CTO)' } },
            '/api/assets': { get: { summary: 'List IT equipment inventory scoped by role/employee' } },
            '/api/assets/{id}/acknowledge': { post: { summary: 'Employee equipment handover/takeover digital acknowledgment' } },
            '/api/kb': { get: { summary: 'Search approved knowledge base articles' } },
            '/api/analytics/summary': { get: { summary: 'Role-scoped dashboard metrics for Employee, IT Admin, and CTO' } },
            '/api/audit-logs': { get: { summary: 'View immutable security and administrative audit logs (IT_ADMIN / CTO)' } },
          },
        });
        return;
      }

      // ======================================================================
      // 2. AUTHENTICATION & DEVELOPMENT OIDC IDENTITY ENDPOINTS
      // ======================================================================
      if (method === 'GET' && pathname === '/api/auth/identities') {
        if (!isDevelopmentAuthEnabled()) {
          sendError(res, 503, 'IDENTITY_PROVIDER_NOT_CONFIGURED', 'Development sign-in is disabled. Live OIDC integration must be configured before deployment.');
          return;
        }
        const state = store.getState();
        sendJson(res, 200, {
          authMode: process.env.AUTH_MODE || 'dev_oidc',
          keycloakRealm: 'upstra-enterprise',
          identities: state.users.map((u) => ({
            id: u.id,
            email: u.email,
            displayName: u.displayName,
            roleName: u.roleName,
            sbuCode: u.sbuCode,
          })),
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/auth/login') {
        if (!isDevelopmentAuthEnabled()) {
          sendError(res, 503, 'IDENTITY_PROVIDER_NOT_CONFIGURED', 'Development sign-in is disabled. Live OIDC integration must be configured before deployment.');
          return;
        }
        const body = await readBody(req);
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!email) {
          sendError(res, 400, 'VALIDATION_ERROR', 'Email address is required to sign in.');
          return;
        }
        const state = store.getState();
        const user = state.users.find((u) => u.email.toLowerCase() === email && u.isActive && u.roleName !== 'SYSTEM_SERVICE');
        if (!user) {
          recordAudit({
            actor: null,
            action: 'AUTH_LOGIN_FAILED',
            resource: 'Auth',
            ipAddress: clientIp,
            details: { attemptedEmail: email },
          });
          sendError(res, 401, 'INVALID_IDENTITY', 'No active user found for this corporate identity.');
          return;
        }

        const token = issueOIDCToken(user);
        state.authSessions = (state.authSessions || []).filter(s => s.expiresAt > Date.now());
        state.authSessions.push({id: crypto.createHash('sha256').update(token).digest('hex'), userId: user.id, expiresAt: Date.now() + 28800_000});
        recordAudit({
          actor: user,
          action: 'AUTH_LOGIN_SUCCESS',
          resource: 'Auth',
          resourceId: user.id,
          ipAddress: clientIp,
          details: { oidcSubject: user.oidcSubject, role: user.roleName, sbuCode: user.sbuCode },
        });

        res.setHeader(
          'Set-Cookie',
          `itsupport_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
        );
        sendJson(res, 200, {
          token,
          user,
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/auth/logout') {
        const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : decodeURIComponent(req.headers.cookie?.match(/(?:^|;\s*)itsupport_session=([^;]+)/)?.[1] || '');
        const state = store.getState();
        const id = crypto.createHash('sha256').update(token).digest('hex');
        state.authSessions = (state.authSessions || []).filter(s => s.id !== id);
        store.persist();
        res.setHeader('Set-Cookie', `itsupport_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
        sendJson(res, 200, { loggedOut: true });
        return;
      }

      // Require authenticated user for all subsequent routes
      const currentUser = extractAuthenticatedUser(req);
      if (!currentUser) {
        sendError(res, 401, 'UNAUTHORIZED', 'Authentication required. Provide a valid Bearer OIDC token or session.');
        return;
      }

      if (method === 'GET' && pathname === '/api/auth/me') {
        const state = store.getState();
        const roleObj = state.roles.find((r) => r.id === currentUser.roleId);
        const sbuObj = state.sbus.find((s) => s.id === currentUser.sbuId);
        sendJson(res, 200, {
          user: currentUser,
          sbu: sbuObj || null,
          permissions: roleObj?.permissions || [],
        });
        return;
      }

      // ======================================================================
      // 3. SERVICE CATALOG, SBUs & KNOWLEDGE BASE
      // ======================================================================
      if (method === 'GET' && pathname === '/api/catalog') {
        const state = store.getState();
        sendJson(res, 200, {
          categories: state.serviceCategories,
          sbus: state.sbus,
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/kb') {
        const state = store.getState();
        const q = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
        const articles = state.knowledgeArticles.filter((a) => {
          if (!a.isApproved) return false;
          if (!q) return true;
          return (
            a.title.toLowerCase().includes(q) ||
            a.content.toLowerCase().includes(q) ||
            a.tags.some((t) => t.toLowerCase().includes(q))
          );
        });
        sendJson(res, 200, { items: articles });
        return;
      }

      // ======================================================================
      // 4. TICKET CREATION, LISTING, FILTERING, STATE TRANSITIONS & ESCALATION
      // ======================================================================
      if (method === 'GET' && pathname === '/api/tickets') {
        const state = store.getState();
        const statusFilter = parsedUrl.searchParams.get('status') as TicketStatus | null;
        const sbuFilter = parsedUrl.searchParams.get('sbuId');
        const severityFilter = parsedUrl.searchParams.get('severity') as TicketSeverity | null;
        const search = (parsedUrl.searchParams.get('search') || '').trim().toLowerCase();
        const page = Math.max(1, Number(parsedUrl.searchParams.get('page') || 1));
        const pageSize = Math.min(100, Math.max(1, Number(parsedUrl.searchParams.get('pageSize') || 25)));

        const accessible = state.tickets.filter((t) => canAccessTicket(currentUser, t));
        const filtered = accessible.filter((t) => {
          if (statusFilter && t.status !== statusFilter) return false;
          if (sbuFilter && t.sbuId !== sbuFilter) return false;
          if (severityFilter && t.severity !== severityFilter) return false;
          if (search) {
            const hay = `${t.ticketNumber} ${t.title} ${t.description}`.toLowerCase();
            if (!hay.includes(search)) return false;
          }
          return true;
        });

        const total = filtered.length;
        const start = (page - 1) * pageSize;
        const items = filtered.slice(start, start + pageSize).map((t) => {
          const requester = state.users.find((u) => u.id === t.requesterId);
          const sbu = state.sbus.find((s) => s.id === t.sbuId);
          const category = state.serviceCategories.find((c) => c.id === t.serviceCategoryId);
          return {
            ...t,
            requesterName: requester?.displayName || 'Unknown',
            requesterEmail: requester?.email || '',
            sbuCode: sbu?.code || '',
            categoryName: category?.name || '',
          };
        });

        sendJson(res, 200, {
          items,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize) || 1,
          },
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/tickets') {
        const rawBody = await readBody(req);
        const validInput = validateCreateTicketInput(rawBody);
        const state = store.getState();

        const category = state.serviceCategories.find(
          (c) => c.id === validInput.serviceCategoryId || c.slug === validInput.serviceCategoryId
        );
        if (!category) {
          sendError(res, 400, 'INVALID_CATEGORY', 'Selected IT Service Category does not exist.');
          return;
        }

        const now = new Date();
        const slaDue = new Date(now.getTime() + category.slaResolutionMinutes * 60_000).toISOString();
        const seqNum = 1000 + state.tickets.length + 1;
        const prefix = category.slug.includes('incident') ? 'INC' : 'REQ';
        const ticketNumber = `${prefix}-2026-${seqNum}`;

        // Create initial ticket in NEW status
        const ticket: Ticket = {
          id: `ticket-${crypto.randomUUID()}`,
          ticketNumber,
          title: validInput.title,
          description: validInput.description,
          status: 'NEW',
          severity: validInput.severity || category.defaultSeverity,
          sbuId: currentUser.sbuId,
          requesterId: currentUser.id,
          assigneeId: null,
          serviceCategoryId: category.id,
          customFormPayload: validInput.customFormPayload || {},
          aiSummary: null,
          aiSuggestedFix: null,
          aiConfidence: null,
          escalationReason: null,
          slaDueAt: slaDue,
          resolvedAt: null,
          closedAt: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };

        state.tickets.unshift(ticket);

        // Event 1: Created (NEW)
        state.ticketEvents.push({
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          actorId: currentUser.id,
          actorName: currentUser.displayName,
          eventType: 'TICKET_CREATED',
          fromStatus: null,
          toStatus: 'NEW',
          metadata: { ticketNumber: ticket.ticketNumber, category: category.slug },
          createdAt: now.toISOString(),
        });

        // Event 2: Triaged (NEW -> TRIAGED -> AI_HANDLING)
        ticket.status = 'TRIAGED';
        state.ticketEvents.push({
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          actorId: null,
          actorName: 'Automated Workflow Engine',
          eventType: 'TICKET_TRIAGED',
          fromStatus: 'NEW',
          toStatus: 'TRIAGED',
          metadata: { slaDueAt: slaDue },
          createdAt: now.toISOString(),
        });

        ticket.status = 'AI_HANDLING';
        state.ticketEvents.push({
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          actorId: null,
          actorName: 'Deterministic Mock AI Orchestrator',
          eventType: 'AI_HANDLING_STARTED',
          fromStatus: 'TRIAGED',
          toStatus: 'AI_HANDLING',
          metadata: { provider: aiOrchestrator.providerName },
          createdAt: now.toISOString(),
        });

        // Evaluate with Deterministic Mock AI & Policy Engine
        const aiDecision = aiOrchestrator.evaluateTicket({
          title: ticket.title,
          description: ticket.description,
          categorySlug: category.slug,
          sbuCode: currentUser.sbuCode,
          knowledgeBase: state.knowledgeArticles,
        });

        // Record AIActionLog
        const aiLog = {
          id: `ailog-${crypto.randomUUID()}`,
          ticketId: ticket.id,
          provider: aiDecision.provider,
          modelName: aiDecision.modelName,
          redactedPrompt: aiDecision.redactedPrompt,
          classification: aiDecision.classification,
          recommendedSeverity: aiDecision.recommendedSeverity,
          confidence: aiDecision.confidence,
          proposedTool: aiDecision.proposedTool,
          policyDecision: aiDecision.policyDecision,
          dryRun: aiDecision.dryRun,
          toolOutput: aiDecision.toolOutput,
          escalatedToIT: aiDecision.escalateToIT,
          createdAt: new Date().toISOString(),
        };
        state.aiActionLogs.unshift(aiLog);

        // A requester's chosen priority may raise severity, but cannot lower a
        // critical/high severity determined by the policy-governed classifier.
        const severityRank: Record<TicketSeverity, number> = {
          LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3,
        };
        if (severityRank[aiDecision.recommendedSeverity] > severityRank[ticket.severity]) {
          ticket.severity = aiDecision.recommendedSeverity;
        }
        ticket.aiSummary = `Classification: ${aiDecision.classification} (${Math.round(aiDecision.confidence * 100)}% confidence) | Policy: ${aiDecision.policyDecision}`;
        ticket.aiSuggestedFix = aiDecision.suggestedResponse;
        ticket.aiConfidence = aiDecision.confidence;

        const itAdmin = state.users.find((u) => u.roleName === 'IT_ADMIN');

        // High/critical requests always require human review, even when text resembles a low-risk FAQ.
        if (aiDecision.canAutoResolve && category.aiEligible && severityRank[ticket.severity] < severityRank.HIGH) {
          // Transition AI_HANDLING -> RESOLVED_PENDING_CONFIRMATION
          ticket.status = 'RESOLVED_PENDING_CONFIRMATION';
          ticket.resolvedAt = new Date().toISOString();
          state.ticketEvents.push({
            id: crypto.randomUUID(),
            ticketId: ticket.id,
            actorId: null,
            actorName: 'Deterministic Mock AI Orchestrator',
            eventType: 'AI_PROPOSED_RESOLUTION',
            fromStatus: 'AI_HANDLING',
            toStatus: 'RESOLVED_PENDING_CONFIRMATION',
            metadata: {
              classification: aiDecision.classification,
              confidence: aiDecision.confidence,
              proposedTool: aiDecision.proposedTool,
            },
            createdAt: new Date().toISOString(),
          });
        } else {
          // Route to IT Administrator Queue (AI_HANDLING -> ASSIGNED_TO_IT)
          ticket.status = 'ASSIGNED_TO_IT';
          ticket.assigneeId = itAdmin?.id || null;
          ticket.escalationReason = aiDecision.escalationReason || 'Routed to IT Administrator queue.';
          state.ticketEvents.push({
            id: crypto.randomUUID(),
            ticketId: ticket.id,
            actorId: null,
            actorName: 'Deterministic Mock AI Orchestrator',
            eventType: 'ASSIGNED_TO_IT_QUEUE',
            fromStatus: 'AI_HANDLING',
            toStatus: 'ASSIGNED_TO_IT',
            metadata: {
              reason: ticket.escalationReason,
              policyDecision: aiDecision.policyDecision,
              assignedTo: itAdmin?.email || 'IT Queue',
            },
            createdAt: new Date().toISOString(),
          });

          // Create an approval record if category or AI policy requires human approval
          if (category.requiresApprovalRole || aiDecision.policyDecision === 'REQUIRES_HUMAN_APPROVAL') {
            const approval: Approval = {
              id: `approval-${crypto.randomUUID()}`,
              ticketId: ticket.id,
              actionType: category.slug.toUpperCase().replace(/-/g, '_'),
              requiredRole: category.requiresApprovalRole || 'IT_ADMIN',
              status: 'PENDING',
              requestedById: currentUser.id,
              approverId: null,
              justification: `Approval required for ${category.name}: ${ticket.title}`,
              decisionNotes: null,
              decidedAt: null,
              createdAt: new Date().toISOString(),
            };
            state.approvals.unshift(approval);
          }
        }

        store.persist();

        // Record Audit Event
        recordAudit({
          actor: currentUser,
          action: 'TICKET_CREATED',
          resource: 'Ticket',
          resourceId: ticket.id,
          ipAddress: clientIp,
          details: {
            ticketNumber: ticket.ticketNumber,
            resultingStatus: ticket.status,
            aiClassification: aiDecision.classification,
          },
        });

        // Queue notification safely (fails safely if transport/queue is degraded)
        await queueProcessor
          .enqueueNotification({
            ticketId: ticket.id,
            recipientId: currentUser.id,
            recipientEmail: currentUser.email,
            subject: `[${ticket.ticketNumber}] Ticket Received - ${ticket.title}`,
            body: `Hello ${currentUser.displayName},\n\nYour ticket (${ticket.ticketNumber}) is currently in status: ${ticket.status}.\n\n${ticket.aiSuggestedFix || ''}`,
          })
          .catch((err) => {
            logStructured('WARN', 'NOTIFICATION_ENQUEUE_DEGRADED', { error: String(err) });
          });

        sendJson(res, 201, {
          ticket,
          aiDecision,
        });
        return;
      }

      // Match /api/tickets/:id and sub-resources
      const ticketMatch = pathname.match(/^\/api\/tickets\/([^/]+)(?:\/([^/]+))?$/);
      if (ticketMatch) {
        const ticketId = decodeURIComponent(ticketMatch[1]);
        const subAction = ticketMatch[2] || null;
        const state = store.getState();
        const ticket = state.tickets.find((t) => t.id === ticketId || t.ticketNumber === ticketId);

        if (!ticket) {
          sendError(res, 404, 'TICKET_NOT_FOUND', `Ticket ${ticketId} was not found.`);
          return;
        }

        // Enforce strict RBAC & SBU resource-level access check
        if (!canAccessTicket(currentUser, ticket)) {
          recordAudit({
            actor: currentUser,
            action: 'UNAUTHORIZED_TICKET_ACCESS_BLOCKED',
            resource: 'Ticket',
            resourceId: ticket.id,
            ipAddress: clientIp,
            details: { ticketNumber: ticket.ticketNumber, ticketOwnerId: ticket.requesterId },
          });
          sendError(
            res,
            403,
            'FORBIDDEN_RESOURCE',
            'You are not authorized to access another user or SBU restricted ticket.'
          );
          return;
        }

        if (method === 'GET' && !subAction) {
          const events = state.ticketEvents.filter((e) => e.ticketId === ticket.id);
          const comments = state.ticketComments
            .filter((c) => c.ticketId === ticket.id)
            .filter((c) => !c.isInternal || ['IT_ADMIN', 'CTO'].includes(currentUser.roleName));
          const approvals = state.approvals.filter((a) => a.ticketId === ticket.id);
          const aiLogs = state.aiActionLogs.filter((l) => l.ticketId === ticket.id);
          const requester = state.users.find((u) => u.id === ticket.requesterId);
          const sbu = state.sbus.find((s) => s.id === ticket.sbuId);
          const category = state.serviceCategories.find((c) => c.id === ticket.serviceCategoryId);

          sendJson(res, 200, {
            ticket: {
              ...ticket,
              requesterName: requester?.displayName || 'Unknown',
              requesterEmail: requester?.email || '',
              sbuCode: sbu?.code || '',
              categoryName: category?.name || '',
            },
            events,
            comments,
            approvals,
            aiLogs,
          });
          return;
        }

        // POST /api/tickets/:id/transition
        if (method === 'POST' && subAction === 'transition') {
          const body = await readBody(req);
          const targetStatus = body.status as TicketStatus;
          const notes = typeof body.notes === 'string' ? redactSensitiveData(body.notes.trim()) : '';

          if (!targetStatus) {
            sendError(res, 400, 'VALIDATION_ERROR', 'Target status is required.');
            return;
          }

          const check = canModifyTicketStatus(currentUser, ticket, targetStatus);
          if (!check.allowed) {
            recordAudit({
              actor: currentUser,
              action: 'INVALID_TICKET_TRANSITION_BLOCKED',
              resource: 'Ticket',
              resourceId: ticket.id,
              ipAddress: clientIp,
              details: { from: ticket.status, to: targetStatus, reason: check.reason },
            });
            sendError(res, 403, 'TRANSITION_NOT_ALLOWED', check.reason || 'Status transition not permitted.');
            return;
          }

          const previousStatus = ticket.status;
          ticket.status = targetStatus;
          ticket.updatedAt = new Date().toISOString();

          if (targetStatus === 'RESOLVED_PENDING_CONFIRMATION') {
            ticket.resolvedAt = ticket.updatedAt;
          } else if (targetStatus === 'CLOSED') {
            ticket.closedAt = ticket.updatedAt;
          } else if (targetStatus === 'REOPENED') {
            // When employee rejects AI resolution / reopens, route to IT queue automatically if requested
            ticket.resolvedAt = null;
            ticket.closedAt = null;
          }

          state.ticketEvents.push({
            id: crypto.randomUUID(),
            ticketId: ticket.id,
            actorId: currentUser.id,
            actorName: currentUser.displayName,
            eventType: `STATUS_CHANGED_TO_${targetStatus}`,
            fromStatus: previousStatus,
            toStatus: targetStatus,
            metadata: { notes },
            createdAt: ticket.updatedAt,
          });

          // If employee reopens from RESOLVED_PENDING_CONFIRMATION, immediately assign to IT
          if (previousStatus === 'RESOLVED_PENDING_CONFIRMATION' && targetStatus === 'REOPENED') {
            const itAdmin = state.users.find((u) => u.roleName === 'IT_ADMIN');
            ticket.status = 'ASSIGNED_TO_IT';
            ticket.assigneeId = itAdmin?.id || null;
            ticket.escalationReason = notes || 'Employee declined AI resolution; requested human IT support.';
            state.ticketEvents.push({
              id: crypto.randomUUID(),
              ticketId: ticket.id,
              actorId: null,
              actorName: 'Workflow Router',
              eventType: 'REOPENED_TICKET_ASSIGNED_TO_IT',
              fromStatus: 'REOPENED',
              toStatus: 'ASSIGNED_TO_IT',
              metadata: { assignedTo: itAdmin?.email || 'IT Queue', reason: ticket.escalationReason },
              createdAt: new Date().toISOString(),
            });
          }

          store.persist();

          recordAudit({
            actor: currentUser,
            action: 'TICKET_STATUS_TRANSITION',
            resource: 'Ticket',
            resourceId: ticket.id,
            ipAddress: clientIp,
            details: { ticketNumber: ticket.ticketNumber, fromStatus: previousStatus, toStatus: ticket.status, notes },
          });

          const requester = state.users.find((u) => u.id === ticket.requesterId);
          if (requester) {
            await queueProcessor
              .enqueueNotification({
                ticketId: ticket.id,
                recipientId: requester.id,
                recipientEmail: requester.email,
                subject: `[${ticket.ticketNumber}] Status Updated to ${ticket.status}`,
                body: `Ticket ${ticket.ticketNumber} transitioned from ${previousStatus} to ${ticket.status} by ${currentUser.displayName}.\nNotes: ${notes || 'None'}`,
              })
              .catch(() => {});
          }

          sendJson(res, 200, { ticket });
          return;
        }

        // POST /api/tickets/:id/escalate-cto
        if (method === 'POST' && subAction === 'escalate-cto') {
          if (!['IT_ADMIN', 'CTO'].includes(currentUser.roleName)) {
            recordAudit({
              actor: currentUser,
              action: 'UNAUTHORIZED_CTO_ESCALATION_ATTEMPT',
              resource: 'Ticket',
              resourceId: ticket.id,
              ipAddress: clientIp,
            });
            sendError(res, 403, 'FORBIDDEN', 'Only IT Administrators or the CTO may escalate tickets to the CTO queue.');
            return;
          }

          const body = await readBody(req);
          const reason = typeof body.reason === 'string' ? redactSensitiveData(body.reason.trim()) : '';
          if (reason.length < 5) {
            sendError(res, 400, 'VALIDATION_ERROR', 'Escalation reason (min 5 chars) is mandatory.');
            return;
          }

          const check = canModifyTicketStatus(currentUser, ticket, 'ESCALATED_TO_CTO');
          if (!check.allowed) {
            sendError(res, 400, 'INVALID_TRANSITION', check.reason || 'Cannot escalate from current status.');
            return;
          }

          const prevStatus = ticket.status;
          ticket.status = 'ESCALATED_TO_CTO';
          ticket.severity = 'CRITICAL';
          ticket.escalationReason = reason;
          ticket.updatedAt = new Date().toISOString();

          state.ticketEvents.push({
            id: crypto.randomUUID(),
            ticketId: ticket.id,
            actorId: currentUser.id,
            actorName: currentUser.displayName,
            eventType: 'ESCALATED_TO_CTO',
            fromStatus: prevStatus,
            toStatus: 'ESCALATED_TO_CTO',
            metadata: { reason, escalatedByRole: currentUser.roleName },
            createdAt: ticket.updatedAt,
          });

          store.persist();

          recordAudit({
            actor: currentUser,
            action: 'TICKET_ESCALATED_TO_CTO',
            resource: 'Ticket',
            resourceId: ticket.id,
            ipAddress: clientIp,
            details: { ticketNumber: ticket.ticketNumber, fromStatus: prevStatus, reason },
          });

          const ctoUser = state.users.find((u) => u.roleName === 'CTO');
          if (ctoUser) {
            await queueProcessor
              .enqueueNotification({
                ticketId: ticket.id,
                recipientId: ctoUser.id,
                recipientEmail: ctoUser.email,
                subject: `[CTO ESCALATION] ${ticket.ticketNumber}: ${ticket.title}`,
                body: `Ticket ${ticket.ticketNumber} has been escalated to the CTO Queue by ${currentUser.displayName}.\nReason: ${reason}`,
              })
              .catch(() => {});
          }

          sendJson(res, 200, { ticket });
          return;
        }

        // POST /api/tickets/:id/comments
        if (method === 'POST' && subAction === 'comments') {
          const body = await readBody(req);
          const commentText = typeof body.body === 'string' ? body.body.trim() : '';
          const isInternal = Boolean(body.isInternal) && ['IT_ADMIN', 'CTO'].includes(currentUser.roleName);

          if (commentText.length < 2 || commentText.length > 2000) {
            sendError(res, 400, 'VALIDATION_ERROR', 'Comment body must be between 2 and 2000 characters.');
            return;
          }

          const comment = {
            id: `comment-${crypto.randomUUID()}`,
            ticketId: ticket.id,
            authorId: currentUser.id,
            authorName: currentUser.displayName,
            authorRole: currentUser.roleName,
            body: redactSensitiveData(commentText),
            isInternal,
            attachments: [],
            createdAt: new Date().toISOString(),
          };

          state.ticketComments.push(comment);
          state.ticketEvents.push({
            id: crypto.randomUUID(),
            ticketId: ticket.id,
            actorId: currentUser.id,
            actorName: currentUser.displayName,
            eventType: isInternal ? 'INTERNAL_NOTE_ADDED' : 'COMMENT_ADDED',
            fromStatus: ticket.status,
            toStatus: ticket.status,
            metadata: { commentId: comment.id },
            createdAt: comment.createdAt,
          });
          store.persist();

          sendJson(res, 201, { comment });
          return;
        }
      }

      // ======================================================================
      // 5. HUMAN APPROVAL WORKFLOWS (IT_ADMIN & CTO)
      // ======================================================================
      if (method === 'GET' && pathname === '/api/approvals') {
        if (!['IT_ADMIN', 'CTO'].includes(currentUser.roleName)) {
          sendError(res, 403, 'FORBIDDEN', 'Only IT Administrators and the CTO can view approval queues.');
          return;
        }
        const state = store.getState();
        const items = state.approvals.map((a) => {
          const t = state.tickets.find((tk) => tk.id === a.ticketId);
          return {
            ...a,
            ticketNumber: t?.ticketNumber || '',
            ticketTitle: t?.title || '',
          };
        });
        sendJson(res, 200, { items });
        return;
      }

      const approvalMatch = pathname.match(/^\/api\/approvals\/([^/]+)\/decide$/);
      if (method === 'POST' && approvalMatch) {
        const approvalId = decodeURIComponent(approvalMatch[1]);
        const state = store.getState();
        const approval = state.approvals.find((a) => a.id === approvalId);

        if (!approval) {
          sendError(res, 404, 'NOT_FOUND', 'Approval record not found.');
          return;
        }

        if (approval.requiredRole === 'CTO' && currentUser.roleName !== 'CTO') {
          sendError(res, 403, 'FORBIDDEN', 'This critical operation requires CTO approval.');
          return;
        }
        if (!['IT_ADMIN', 'CTO'].includes(currentUser.roleName)) {
          sendError(res, 403, 'FORBIDDEN', 'Insufficient privileges to decide approvals.');
          return;
        }

        const body = await readBody(req);
        const decision = body.decision as 'APPROVED' | 'REJECTED';
        const decisionNotes = typeof body.decisionNotes === 'string' ? redactSensitiveData(body.decisionNotes.trim()) : '';
        if (approval.status !== 'PENDING') {
          sendError(res, 409, 'APPROVAL_ALREADY_DECIDED', 'Approval decisions are immutable.'); return;
        }
        if (!decisionNotes) {
          sendError(res, 400, 'VALIDATION_ERROR', 'Decision rationale is required.'); return;
        }

        if (!['APPROVED', 'REJECTED'].includes(decision)) {
          sendError(res, 400, 'VALIDATION_ERROR', 'decision must be APPROVED or REJECTED');
          return;
        }

        approval.status = decision;
        approval.approverId = currentUser.id;
        approval.decisionNotes = decisionNotes || `Decided by ${currentUser.displayName}`;
        approval.decidedAt = new Date().toISOString();

        const ticket = state.tickets.find((t) => t.id === approval.ticketId);
        if (ticket) {
          state.ticketEvents.push({
            id: crypto.randomUUID(),
            ticketId: ticket.id,
            actorId: currentUser.id,
            actorName: currentUser.displayName,
            eventType: `APPROVAL_${decision}`,
            fromStatus: ticket.status,
            toStatus: ticket.status,
            metadata: { approvalId: approval.id, actionType: approval.actionType, decisionNotes },
            createdAt: approval.decidedAt,
          });
        }

        store.persist();

        recordAudit({
          actor: currentUser,
          action: `APPROVAL_${decision}`,
          resource: 'Approval',
          resourceId: approval.id,
          ipAddress: clientIp,
          details: { ticketId: approval.ticketId, actionType: approval.actionType, decisionNotes },
        });

        sendJson(res, 200, { approval });
        return;
      }

      // ======================================================================
      // 6. IT ASSET INVENTORY & HANDOVER/TAKEOVER ACKNOWLEDGMENT
      // ======================================================================
      if (method === 'GET' && pathname === '/api/assets') {
        const state = store.getState();
        const items =
          currentUser.roleName === 'IT_ADMIN' || currentUser.roleName === 'CTO'
            ? state.assets
            : state.assets.filter((a) => a.assignedUserId === currentUser.id && a.sbuId === currentUser.sbuId);
        sendJson(res, 200, { items });
        return;
      }

      const assetAckMatch = pathname.match(/^\/api\/assets\/([^/]+)\/acknowledge$/);
      if (method === 'POST' && assetAckMatch) {
        const assetId = decodeURIComponent(assetAckMatch[1]);
        const state = store.getState();
        const asset = state.assets.find((a) => a.id === assetId);
        if (!asset) {
          sendError(res, 404, 'ASSET_NOT_FOUND', 'Asset not found.');
          return;
        }
        if ((asset.assignedUserId !== currentUser.id || asset.sbuId !== currentUser.sbuId) && !['IT_ADMIN', 'CTO'].includes(currentUser.roleName)) {
          sendError(res, 403, 'FORBIDDEN', 'Only the assigned employee or IT Admin may acknowledge this asset.');
          return;
        }

        asset.handoverAckStatus = 'ACKNOWLEDGED';
        asset.status = 'ASSIGNED';
        asset.updatedAt = new Date().toISOString();
        asset.history.push({
          date: asset.updatedAt,
          action: 'EMPLOYEE_ACKNOWLEDGED_HANDOVER',
          actorEmail: currentUser.email,
          notes: `Digitally acknowledged custody by ${currentUser.displayName}`,
        });
        store.persist();

        recordAudit({
          actor: currentUser,
          action: 'ASSET_HANDOVER_ACKNOWLEDGED',
          resource: 'Asset',
          resourceId: asset.id,
          ipAddress: clientIp,
          details: { assetTag: asset.assetTag, serialNumber: asset.serialNumber },
        });

        sendJson(res, 200, { asset });
        return;
      }

      // ======================================================================
      // 7. NOTIFICATIONS, ANALYTICS DASHBOARD & AUDIT LOGS
      // ======================================================================
      if (method === 'GET' && pathname === '/api/notifications') {
        const state = store.getState();
        const items =
          currentUser.roleName === 'IT_ADMIN' || currentUser.roleName === 'CTO'
            ? state.notifications.slice(0, 50)
            : state.notifications.filter((n) => n.recipientId === currentUser.id);
        sendJson(res, 200, {
          items,
          deliveredTransportCount: emailTransport.getDeliveredMessages().length,
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/analytics/summary') {
        const state = store.getState();
        const visibleTickets = state.tickets.filter((t) => canAccessTicket(currentUser, t));
        const byStatus: Record<string, number> = {};
        const bySbu: Record<string, number> = {};
        for (const t of visibleTickets) {
          byStatus[t.status] = (byStatus[t.status] || 0) + 1;
          const sbu = state.sbus.find((s) => s.id === t.sbuId)?.code || 'UNKNOWN';
          bySbu[sbu] = (bySbu[sbu] || 0) + 1;
        }

        sendJson(res, 200, {
          totalAccessibleTickets: visibleTickets.length,
          aiResolvedPendingConfirmation: visibleTickets.filter((t) => t.status === 'RESOLVED_PENDING_CONFIRMATION').length,
          assignedToIT: visibleTickets.filter((t) => t.status === 'ASSIGNED_TO_IT' || t.status === 'IN_PROGRESS').length,
          escalatedToCTO: visibleTickets.filter((t) => t.status === 'ESCALATED_TO_CTO').length,
          pendingApprovals: state.approvals.filter((a) => a.status === 'PENDING' && visibleTickets.some(t => t.id === a.ticketId)).length,
          byStatus,
          bySbu,
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/audit-logs') {
        if (!['IT_ADMIN', 'CTO'].includes(currentUser.roleName)) {
          sendError(res, 403, 'FORBIDDEN', 'Only IT Administrators and the CTO may inspect security audit logs.');
          return;
        }
        const state = store.getState();
        sendJson(res, 200, { items: state.auditLogs.slice(0, 100) });
        return;
      }

      // ======================================================================
      // 8. ACTIVE DIRECTORY READ-ONLY LOOKUP & CONNECTOR STATUS
      // ======================================================================
      if (method === 'GET' && pathname === '/api/connectors/ad/lookup') {
        if (!['IT_ADMIN', 'CTO'].includes(currentUser.roleName)) {
          sendError(res, 403, 'FORBIDDEN', 'Only IT Administrators and the CTO may query directory records.');
          return;
        }
        const email = parsedUrl.searchParams.get('email') || '';
        const record = await adAdapter.lookupUserByEmail(email);
        const groups = record ? await adAdapter.lookupGroupsForUser(email) : [];
        sendJson(res, 200, { provider: adAdapter.providerName, record, groups });
        return;
      }

      sendError(res, 404, 'ROUTE_NOT_FOUND', `No endpoint matches ${method} ${pathname}`);
    } catch (err) {
      if (err instanceof ValidationError) {
        sendError(res, 400, 'VALIDATION_ERROR', err.message, err.details);
        return;
      }
      logStructured('ERROR', 'UNHANDLED_API_ERROR', { error: String(err), path: pathname });
      sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred while processing the request.');
    }
  };

  // Attach body listeners before waiting for the local serial queue.
  let tail: Promise<void> = Promise.resolve();
  const handleRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const body = consumeBody(req);
    body.catch(() => {});
    bodies.set(req, body);
    const previous = tail;
    let done!: () => void;
    tail = new Promise<void>(resolve => { done = resolve; });
    await previous;
    let code = 200;
    const headers: Record<string, string> = {};
    let output = '';
    const buffered = {
      setHeader(k: string, v: string) { headers[k] = String(v); },
      writeHead(c: number, h: Record<string, string> = {}) { code = c; Object.assign(headers, h); },
      end(chunk = '') { output += chunk; },
    } as unknown as http.ServerResponse;
    try {
      await store.transaction(async () => {
        try { await body; } catch (err) {
          sendError(buffered, String(err).includes('1MB') ? 413 : 400, 'VALIDATION_ERROR', 'Invalid or oversized JSON request.'); return false;
        }
        await runRequest(req, buffered);
        // Denials may contain a security audit event; only server failures roll back.
        return code < 500;
      });
      res.writeHead(code, headers); res.end(output);
    } catch (err) {
      sendError(res, /PERSISTENCE_BUSY|PERSISTENCE_CONFLICT/.test(String(err)) ? 409 : 503,
        'PERSISTENCE_FAILURE', 'Operation was not committed. Retry after recovery or contention clears.');
    } finally { bodies.delete(req); done(); }
  };

  const server = http.createServer(handleRequest);
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;

  const inject: AppInstance['inject'] = async ({ method, url, token, body, headers = {} }) => {
    const { EventEmitter } = await import('node:events');
    const reqEmitter = new EventEmitter() as unknown as http.IncomingMessage;
    reqEmitter.method = method;
    reqEmitter.url = url;
    reqEmitter.headers = {
      host: 'localhost:4000',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    };
    (reqEmitter as any).socket = { remoteAddress: '127.0.0.1' };

    let statusCode = 200;
    const respHeaders: Record<string, string> = {};
    let responseBody = '';

    const resMock = {
      setHeader(k: string, v: string) {
        respHeaders[k.toLowerCase()] = String(v);
      },
      writeHead(code: number, headers?: Record<string, string>) {
        statusCode = code;
        if (headers) {
          for (const [k, v] of Object.entries(headers)) {
            respHeaders[k.toLowerCase()] = String(v);
          }
        }
      },
      end(chunk?: string) {
        if (chunk) responseBody += chunk;
      },
    } as unknown as http.ServerResponse;

    const handlerPromise = handleRequest(reqEmitter, resMock);
    queueMicrotask(() => {
      if (body !== undefined) {
        reqEmitter.emit('data', Buffer.from(JSON.stringify(body), 'utf-8'));
      }
      reqEmitter.emit('end');
    });
    await handlerPromise;

    const parsedData = responseBody ? JSON.parse(responseBody) : {};
    return { status: statusCode, headers: respHeaders, data: parsedData };
  };

  return {
    server,
    handleRequest,
    inject,
    store,
    aiOrchestrator,
    adAdapter,
    emailTransport,
    mailboxProvisioner,
    queueProcessor,
  };
}
