/**
 * Enterprise IT Support Platform - Modular Backend Application & REST API
 * Enforces Keycloak/OIDC JWT auth, RBAC, SBU scoping, Ticket State Machine,
 * Deterministic Mock AI Orchestration, Approval Workflows, and Audit Logging.
 */

import http from 'node:http';
import { authenticatedForwarders, configuredOrigin, directOrigin } from '../../../packages/shared/src/ingress.ts';
import { LocalAbuseCounter, abusePolicy, checkAbuse, type AbuseCounter } from './abuse-control.ts';
import crypto from 'node:crypto';
import {
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
  validateEscalationReason,
  selectEscalationRecipient,
  MAX_TICKET_SEQUENCE,
} from '../../../packages/shared/src/index.ts';
import {
  DeterministicMockAIOrchestrator,
  DevelopmentEmailTransport,
  MockActiveDirectoryAdapter,
  UnconfiguredMailboxProvisioningAdapter,
} from '../../../packages/connectors/src/index.ts';
import { sha256Params, approvalParamsForAction } from './functional-extension.ts';
import { planTicketCreation, ticketNumberFor, escalationNotification } from './ticket-workflow.ts';
import { isAssignableStatus, validateAssignmentInput } from './assignment.ts';
import { EnterpriseDataStore, type RequestStore } from './store.ts';
import { issueOIDCToken, verifyOIDCToken, isDevelopmentAuthEnabled } from './auth.ts';
import { NotificationQueueProcessor } from './queue.ts';
import {EnterpriseAuthAdapter,JsonAuthenticationRepository,readEnterpriseSettings,cookieValue,sessionDigest,csrfForSession,secureEqual} from './enterprise-auth.ts';

import { SessionPersistenceError, type AuthenticationRepository, type LoginFlowStore } from './enterprise-auth.ts';

export interface AppInstance<Store extends RequestStore = EnterpriseDataStore> {
  server: http.Server;
  handleRequest: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
  inject: (options: {
    method: string;
    url: string;
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
  }) => Promise<{ status: number; headers: Record<string, string>; data: Record<string, any> }>;
  store: Store;
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
  return createServer(() => new EnterpriseDataStore(customStorePath));
}

export function createServer<Store extends RequestStore>(
  createStore: () => Store,
  durableAuth?: AuthenticationRepository,
  abuse: AbuseCounter = new LocalAbuseCounter(),
  loginFlows?: LoginFlowStore,
): AppInstance<Store> {
  if (process.env.MAIL_PROVIDER && process.env.MAIL_PROVIDER !== 'mock') throw new Error(durableAuth ? 'POSTGRES_REQUIRES_MOCK_MAIL' : 'JSON_MODE_REQUIRES_MOCK_MAIL');
  const ingress = authenticatedForwarders(process.env.API_TRUSTED_PROXY_IPS, process.env.API_PROXY_TOKEN);
  const publicOrigin = configuredOrigin(process.env.API_PUBLIC_ORIGIN);
  if (ingress.enabled && !publicOrigin) throw new Error('TRUSTED_PROXY_REQUIRES_PUBLIC_ORIGIN');
  const policy = abusePolicy();
  const store = createStore();
  const postgres = !!durableAuth;
  const authRepository = durableAuth ?? new JsonAuthenticationRepository(store);
  // Configuration is captured per server; a failure never enables dev fallback.
  let enterpriseAuth: EnterpriseAuthAdapter | undefined;
  if(process.env.AUTH_MODE==='oidc') {
    try {enterpriseAuth=new EnterpriseAuthAdapter(readEnterpriseSettings(), loginFlows);} catch { /* public config reports unconfigured */ }
  }

  const aiOrchestrator = new DeterministicMockAIOrchestrator();
  const adAdapter = new MockActiveDirectoryAdapter();
  const emailTransport = new DevelopmentEmailTransport({
    mode: (process.env.MAIL_PROVIDER as 'mock' | 'mailpit') || 'mock',
    smtpHost: '127.0.0.1',
    smtpPort: 1025,
    fromAddress: 'noreply@example.test',
  });
  const mailboxProvisioner = new UnconfiguredMailboxProvisioningAdapter();
  const queueProcessor = new NotificationQueueProcessor(store, emailTransport, !!postgres);


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

  function extractSessionToken(req: http.IncomingMessage): string | null {
    let token: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)itsupport_session=([^;]+)/);
      if (match) { try { token = decodeURIComponent(match[1]); } catch { return null; } }
    }
    return token;
  }

  async function extractAuthenticatedUser(req: http.IncomingMessage): Promise<User | null> {
    const token = extractSessionToken(req);
    if (!token) return null;

    if(process.env.AUTH_MODE==='oidc') return enterpriseAuth ? await enterpriseAuth.authenticate(cookieValue(req.headers.cookie,'itsupport_session'),authRepository) : null;

    const claims = verifyOIDCToken(token);
    if (!claims) return null;

    const state = store.getState();
    const sessionId = crypto.createHash('sha256').update(token).digest('hex');
    if (!state.authSessions?.some(s => s.id === sessionId && s.userId === claims.sub && s.expiresAt > Date.now())) return null;
    const user = state.users.find((u) => u.id === claims.sub && u.isActive && u.roleName !== 'SYSTEM_SERVICE');
    return user || null;
  }

  async function escalateTicket(res: http.ServerResponse, actor: User, ticket: Ticket, reasonValue: unknown, clientIp: string) {
    const state = store.getState();
          if (!['IT_ADMIN', 'CTO'].includes(actor.roleName)) {
            recordAudit({
              actor: actor,
              action: 'UNAUTHORIZED_CTO_ESCALATION_ATTEMPT',
              resource: 'Ticket',
              resourceId: ticket.id,
              ipAddress: clientIp,
            });
            sendError(res, 403, 'FORBIDDEN', 'Only IT Administrators or the CTO may escalate tickets to the CTO queue.');
            return;
          }

          const reason = validateEscalationReason(reasonValue);

          const check = canModifyTicketStatus(actor, ticket, 'ESCALATED_TO_CTO');
          if (!check.allowed) {
            sendError(res, 400, 'INVALID_TRANSITION', check.reason || 'Cannot escalate from current status.');
            return;
          }

          const ctoUser = selectEscalationRecipient(state.users);
          if (!ctoUser) {
            sendError(res, 409, 'CTO_ROUTING_UNAVAILABLE', 'Escalation requires exactly one active CTO recipient.');
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
            actorId: actor.id,
            actorName: actor.displayName,
            eventType: 'ESCALATED_TO_CTO',
            fromStatus: prevStatus,
            toStatus: 'ESCALATED_TO_CTO',
            metadata: { reason, escalatedByRole: actor.roleName },
            createdAt: ticket.updatedAt,
          });

          store.persist();

          recordAudit({
            actor: actor,
            action: 'TICKET_ESCALATED_TO_CTO',
            resource: 'Ticket',
            resourceId: ticket.id,
            ipAddress: clientIp,
            details: { ticketNumber: ticket.ticketNumber, fromStatus: prevStatus, reason },
          });

          await queueProcessor.enqueueNotification(escalationNotification(ticket, actor, ctoUser, reason));

          sendJson(res, 200, { ticket });
  }

  type VerifiedLogin = Awaited<ReturnType<EnterpriseAuthAdapter['exchange']>>;
  const runRequest = async (req: http.IncomingMessage, res: http.ServerResponse, clientIp: string, login?: VerifiedLogin) => {
    const method = req.method || 'GET';
    const rawUrl = req.url || '/';
    const parsedUrl = new URL(rawUrl, 'http://localhost');
    const pathname = parsedUrl.pathname;

    // Browser cookie writes require a verified same-origin request. Bearer-only
    // CLI clients need no Origin; external browser origins must be allowlisted.
    const origin = req.headers.origin;
    const sameOrigin = publicOrigin ?? directOrigin(req.headers.host, !!(req.socket as { encrypted?: boolean }).encrypted);
    const allowedOrigin = process.env.AUTH_MODE==='oidc' ? origin===enterpriseAuth?.publicUrl : origin === sameOrigin || (!!process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*' && origin === process.env.CORS_ORIGIN);
    if ((origin && !allowedOrigin) || (req.headers.cookie?.includes('itsupport_session=') && !['GET','HEAD','OPTIONS'].includes(method) && !allowedOrigin)) {
      sendError(res, 403, 'ORIGIN_DENIED', 'A verified same-origin request is required.'); return;
    }

    if(process.env.AUTH_MODE==='oidc' && !['GET','HEAD','OPTIONS'].includes(method)) {
      if(!enterpriseAuth || origin!==enterpriseAuth.publicUrl) {
        sendError(res,403,'ORIGIN_DENIED','A verified same-origin request is required.');return;
      }
      const sessionToken=cookieValue(req.headers.cookie,'itsupport_session');
      if(sessionToken && await enterpriseAuth.authenticate(sessionToken,authRepository)) {
        const supplied=req.headers['x-csrf-token'];
        if(typeof supplied!=='string'||!secureEqual(supplied,csrfForSession(sessionToken))) {
          sendError(res,403,'CSRF_DENIED','Session CSRF validation failed.');return;
        }
      }
    }

    if (method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }

    try {
      // ======================================================================
      // 1. HEALTH, READINESS & OPENAPI SPECIFICATION
      // ======================================================================
      if (method === 'GET' && pathname === '/api/health') {
        const dbHealthy = await store.isHealthy();
        const queueHealth = queueProcessor.getQueueHealth();
        const adHealth = await adAdapter.getHealth();
        const mailHealth = await emailTransport.getHealth();

        const status = dbHealthy ? 200 : 503;
        sendJson(res, status, {
          status: dbHealthy ? 'MOCK MODE' : 'DEGRADED',
          service: 'it-support-api',
          version: '1.0.0-milestone1',
          components: {
            database: dbHealthy ? { status: 'CONNECTED', mode: postgres ? 'postgres' : 'local-json-development-store' } : { status: 'UNAVAILABLE' },
            redisQueue: queueHealth,
            keycloakOidc: {
              status: 'UNKNOWN',
              note: enterpriseAuth ? 'OIDC adapter configured. Provider reachability is checked during sign-in; real Keycloak/AD integration is not certified.' : 'Live Keycloak connectivity and federation are not verified; development tokens require explicit local mode.',
              issuer: enterpriseAuth?.issuer ?? null,
              mode: process.env.AUTH_MODE || 'unconfigured',
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
            '/api/tickets/{id}/assign': {
              post: {
                summary: 'Assign an eligible ticket to an active IT administrator',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: { required: true, content: { 'application/json': { schema: {
                  type: 'object',
                  required: ['assigneeId', 'expectedAssigneeId', 'expectedRevision', 'reason'],
                  properties: {
                    assigneeId: { type: 'string', minLength: 1, maxLength: 128 },
                    expectedAssigneeId: { type: ['string', 'null'], minLength: 1, maxLength: 128 },
                    expectedRevision: { type: 'integer', minimum: 0 },
                    reason: { type: 'string', minLength: 10, maxLength: 500 },
                  },
                } } } },
                responses: {
                  200: { description: 'Assignment committed or current owner confirmed' },
                  400: { description: 'Invalid input or ineligible assignee' },
                  401: { description: 'Authentication required' },
                  403: { description: 'Assignment denied' },
                  409: { description: 'Ticket state, assignment revision or transaction conflict' },
                  503: { description: 'Persistence unavailable' },
                },
              },
            },
            '/api/tickets/{id}/transition': { post: { summary: 'Transition ticket status with state-machine and RBAC enforcement' } },
            '/api/tickets/{id}/escalate-cto': { post: { summary: 'IT Admin or policy escalation to CTO queue' } },
            '/api/tickets/{id}/comments': { post: { summary: 'Add comment to an authorized ticket' } },
            '/api/approvals': { get: { summary: 'List pending/decided human approvals' } },
            '/api/approvals/{id}/decide': { post: { summary: 'Approve or reject a sensitive operation (IT_ADMIN / CTO)' } },
            '/api/assets': {
              get: { summary: 'List IT equipment inventory scoped by role/employee' },
              post: { summary: 'Register synthetic equipment inventory with IT authorization' },
            },
            '/api/assets/{id}/acknowledge': { post: { summary: 'Employee equipment handover/takeover digital acknowledgment' } },
            '/api/assets/{id}/lifecycle': { post: { summary: 'Register and manage assign, handover, takeover, return, maintenance, reassignment or retirement' } },
            '/api/kb': { get: { summary: 'Search approved knowledge base articles' } },
            '/api/analytics/summary': { get: { summary: 'Role-scoped dashboard metrics for Employee, IT Admin, and CTO' } },
            '/api/sla/policies': { get: { summary: 'List configurable synthetic SLA policies' }, patch: { summary: 'Update severity SLA deadlines' } },
            '/api/sla/status': { get: { summary: 'Authorized ticket SLA status and breach visibility' } },
            '/api/sla/review': { post: { summary: 'Run duplicate-safe overdue detection and escalation review' } },
            '/api/reports/summary': { get: { summary: 'Authorized reporting summary for IT and CTO dashboards' } },
            '/api/tickets/{id}/attachments': { get: { summary: 'List authorized ticket attachments' }, post: { summary: 'Upload a synthetic base64 ticket attachment' } },
            '/api/notifications/{id}/read': { post: { summary: 'Mark a notification read as its recipient' } },
            '/api/audit-logs': { get: { summary: 'View immutable security and administrative audit logs (IT_ADMIN / CTO)' } },
          },
        });
        return;
      }

      // ======================================================================
      // 2. AUTHENTICATION & DEVELOPMENT OIDC IDENTITY ENDPOINTS
      // ======================================================================
      if(method==='GET'&&pathname==='/api/auth/config') {
        sendJson(res,200,{mode:isDevelopmentAuthEnabled()?'development':process.env.AUTH_MODE==='oidc'?'enterprise':'unconfigured',ready:isDevelopmentAuthEnabled()||!!enterpriseAuth,loginUrl:enterpriseAuth?'/api/auth/oidc/login':null});return;
      }
      if(method==='GET'&&pathname==='/api/auth/oidc/login') {
        if(!enterpriseAuth||process.env.AUTH_MODE!=='oidc'){sendError(res,503,'OIDC_NOT_CONFIGURED','Enterprise authentication is not configured.');return;}
        try {
          const result=await enterpriseAuth.begin(cookieValue(req.headers.cookie,'itsupport_session'));
          res.setHeader('Set-Cookie',enterpriseAuth.flowCookie(result.flow));
          res.writeHead(302,{'Location':result.url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();
        }catch {sendError(res,503,'OIDC_UNAVAILABLE','Enterprise identity provider is unavailable or invalid.');}
        return;
      }
      if(method==='GET'&&pathname==='/api/auth/oidc/callback') {
        if(!enterpriseAuth||process.env.AUTH_MODE!=='oidc'){sendError(res,503,'OIDC_NOT_CONFIGURED','Enterprise authentication is not configured.');return;}
        let result;
        try {
          if (!login) throw new Error('OIDC_FLOW_INVALID');
          result = await enterpriseAuth.establish(login, authRepository);
        } catch (error) {
          if (error instanceof SessionPersistenceError) throw error;
          res.setHeader('Set-Cookie', enterpriseAuth.flowCookie('', 0));
          sendError(res, 400, 'OIDC_AUTHENTICATION_FAILED', 'Enterprise sign-in failed. Restart sign-in.');
          return;
        }
        // Audit and persistence failures must roll back the established session,
        // not become a client error that could commit a partial success.
        recordAudit({actor:result.user,action:'AUTH_ENTERPRISE_LOGIN_SUCCESS',resource:'Auth',resourceId:result.user.id,ipAddress:clientIp});
        res.setHeader('Set-Cookie',[enterpriseAuth.sessionCookie(result.token),enterpriseAuth.flowCookie('',0)]);
        res.writeHead(303,{'Location':'/app','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();
        return;
      }

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
        if(process.env.AUTH_MODE==='oidc') {
          const token=cookieValue(req.headers.cookie,'itsupport_session');
          if(!enterpriseAuth||!token||!await enterpriseAuth.authenticate(token,authRepository)){sendError(res,401,'UNAUTHORIZED','Authentication required.');return;}
          await authRepository.revoke(sessionDigest(token));res.setHeader('Set-Cookie',enterpriseAuth.sessionCookie('',0));sendJson(res,200,{loggedOut:true});return;
        }

        const token = extractSessionToken(req) || '';
        const state = store.getState();
        const id = crypto.createHash('sha256').update(token).digest('hex');
        state.authSessions = (state.authSessions || []).filter(s => s.id !== id);
        store.persist();
        res.setHeader('Set-Cookie', `itsupport_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
        sendJson(res, 200, { loggedOut: true });
        return;
      }

      // Require authenticated user for all subsequent routes
      const currentUser = await extractAuthenticatedUser(req);
      if (!currentUser) {
        sendError(res, 401, 'UNAUTHORIZED', 'Authentication required. Provide a valid Bearer OIDC token or session.');
        return;
      }

      if (method === 'GET' && pathname === '/api/auth/me') {
        const state = store.getState();
        const roleObj = state.roles.find((r) => r.id === currentUser.roleId);
        const sbuObj = state.sbus.find((s) => s.id === currentUser.sbuId);
        sendJson(res, 200, {
          ...(process.env.AUTH_MODE==='oidc'?{csrfToken:csrfForSession(cookieValue(req.headers.cookie,'itsupport_session')!)}:{}),
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

      if (method === 'GET' && pathname === '/api/sla/policies') {
        const state = store.getState();
        const policies = (['LOW','MEDIUM','HIGH','CRITICAL'] as TicketSeverity[]).map((severity) => {
          const categories = state.serviceCategories.filter((category) => category.defaultSeverity === severity);
          const responseMinutes = categories.length ? Math.min(...categories.map((category) => category.slaResponseMinutes)) : ({ LOW: 480, MEDIUM: 240, HIGH: 120, CRITICAL: 30 } as Record<TicketSeverity, number>)[severity];
          const resolutionMinutes = categories.length ? Math.min(...categories.map((category) => category.slaResolutionMinutes)) : ({ LOW: 2880, MEDIUM: 1440, HIGH: 480, CRITICAL: 120 } as Record<TicketSeverity, number>)[severity];
          return { severity, responseMinutes, resolutionMinutes, escalationRole: severity === 'CRITICAL' ? 'CTO' : 'IT_ADMIN', isActive: true };
        });
        sendJson(res, 200, { items: policies });
        return;
      }

      const slaPolicyMatch = pathname.match(/^\/api\/sla\/policies\/(LOW|MEDIUM|HIGH|CRITICAL)$/);
      if (method === 'PATCH' && slaPolicyMatch) {
        if (currentUser.roleName !== 'IT_ADMIN') {
          sendError(res, 403, 'FORBIDDEN', 'Only IT Administrators may update SLA policies.');
          return;
        }
        const severity = slaPolicyMatch[1] as TicketSeverity;
        const body = await readBody(req);
        const responseMinutes = Number(body.responseMinutes);
        const resolutionMinutes = Number(body.resolutionMinutes);
        if (!Number.isSafeInteger(responseMinutes) || !Number.isSafeInteger(resolutionMinutes) || responseMinutes < 1 || resolutionMinutes < responseMinutes) {
          sendError(res, 400, 'VALIDATION_ERROR', 'SLA minutes must be positive integers and resolution must follow response.');
          return;
        }
        const state = store.getState();
        const categories = state.serviceCategories.filter((category) => category.defaultSeverity === severity);
        if (!categories.length) {
          sendError(res, 404, 'SLA_POLICY_NOT_FOUND', 'No active synthetic policy category uses this severity.');
          return;
        }
        for (const category of categories) {
          category.slaResponseMinutes = responseMinutes;
          category.slaResolutionMinutes = resolutionMinutes;
        }
        store.persist();
        recordAudit({
          actor: currentUser,
          action: 'SLA_POLICY_UPDATED',
          resource: 'SlaPolicy',
          resourceId: severity,
          ipAddress: clientIp,
          details: { severity, responseMinutes, resolutionMinutes },
        });
        sendJson(res, 200, { severity, responseMinutes, resolutionMinutes });
        return;
      }

      if (method === 'GET' && pathname === '/api/sla/status') {
        const state = store.getState();
        const now = Date.now();
        const accessible = state.tickets.filter((ticket) => canAccessTicket(currentUser, ticket));
        const items = accessible.map((ticket) => {
          const responseDue = Date.parse(ticket.slaResponseDueAt || ticket.slaDueAt);
          const resolutionDue = Date.parse(ticket.slaResolutionDueAt || ticket.slaDueAt);
          const responseBreached = now > responseDue && !['CLOSED', 'RESOLVED_PENDING_CONFIRMATION'].includes(ticket.status);
          const resolutionBreached = now > resolutionDue && !['CLOSED', 'RESOLVED_PENDING_CONFIRMATION'].includes(ticket.status);
          return {
            ticketId: ticket.id,
            ticketNumber: ticket.ticketNumber,
            status: ticket.status,
            severity: ticket.severity,
            responseDueAt: new Date(responseDue).toISOString(),
            resolutionDueAt: new Date(resolutionDue).toISOString(),
            responseBreached,
            resolutionBreached,
            breached: Boolean(ticket.slaBreached) || responseBreached || resolutionBreached,
            escalatedAt: ticket.slaEscalatedAt || null,
          };
        });
        sendJson(res, 200, {
          items,
          summary: {
            total: items.length,
            responseBreaches: items.filter((item) => item.responseBreached).length,
            resolutionBreaches: items.filter((item) => item.resolutionBreached).length,
            escalated: items.filter((item) => item.escalatedAt).length,
          },
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/sla/review') {
        if (!['IT_ADMIN', 'CTO', 'SYSTEM_SERVICE'].includes(currentUser.roleName)) {
          sendError(res, 403, 'FORBIDDEN', 'Only authorized SLA services may run breach review.');
          return;
        }
        const state = store.getState();
        const now = new Date();
        let reviewed = 0;
        let escalated = 0;
        for (const ticket of state.tickets) {
          if (['CLOSED', 'RESOLVED_PENDING_CONFIRMATION'].includes(ticket.status) || ticket.slaEscalatedAt) continue;
          const resolutionDue = Date.parse(ticket.slaResolutionDueAt || ticket.slaDueAt);
          const responseDue = Date.parse(ticket.slaResponseDueAt || ticket.slaDueAt);
          if (now.getTime() <= responseDue && now.getTime() <= resolutionDue) continue;
          reviewed++;
          ticket.slaBreached = true;
          ticket.slaBreachedAt = ticket.slaBreachedAt || now.toISOString();
          ticket.slaEscalatedAt = now.toISOString();
          const resolutionBreach = now.getTime() > resolutionDue;
          if (resolutionBreach && ticket.status !== 'ESCALATED_TO_CTO') {
            ticket.status = 'ESCALATED_TO_CTO';
            escalated++;
          } else if (ticket.status === 'NEW' || ticket.status === 'TRIAGED') {
            ticket.status = 'ASSIGNED_TO_IT';
            escalated++;
          }
          ticket.updatedAt = now.toISOString();
          state.ticketEvents.push({
            id: crypto.randomUUID(),
            ticketId: ticket.id,
            actorId: currentUser.id,
            actorName: currentUser.displayName,
            eventType: resolutionBreach ? 'SLA_RESOLUTION_BREACH_ESCALATION' : 'SLA_RESPONSE_BREACH',
            fromStatus: null,
            toStatus: ticket.status,
            metadata: { duplicatePrevented: false, resolutionDueAt: new Date(resolutionDue).toISOString(), responseDueAt: new Date(responseDue).toISOString() },
            createdAt: now.toISOString(),
          });
          const recipient = state.users.find((user) => resolutionBreach
            ? user.roleName === 'CTO' && user.isActive
            : user.roleName === 'IT_ADMIN' && user.isActive);
          if (recipient) {
            await queueProcessor.enqueueNotification({
              ticketId: ticket.id,
              recipientId: recipient.id,
              recipientEmail: recipient.email,
              subject: `[${ticket.ticketNumber}] SLA breach`,
              body: `Ticket ${ticket.ticketNumber} breached ${resolutionBreach ? 'resolution' : 'response'} SLA and was escalated to ${recipient.roleName}.`,
            });
          }
        }
        store.persist();
        recordAudit({
          actor: currentUser,
          action: 'SLA_REVIEW_COMPLETED',
          resource: 'SlaPolicy',
          resourceId: 'synthetic',
          ipAddress: clientIp,
          details: { reviewed, escalated },
        });
        sendJson(res, 200, { reviewed, escalated });
        return;
      }

      if (method === 'GET' && pathname === '/api/kb') {
        const knowledge = store.approvedKnowledgeItems
          ? await store.approvedKnowledgeItems()
          : store.getState().knowledgeArticles;
        const q = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
        const articles = knowledge.filter((a) => {
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
        const assignedToMe = parsedUrl.searchParams.get('assignedToMe') === 'true';
        if (assignedToMe && currentUser.roleName !== 'IT_ADMIN') {
          sendError(res, 403, 'FORBIDDEN', 'Only IT Administrators may filter their assignment queue.');
          return;
        }
        const severityFilter = parsedUrl.searchParams.get('severity') as TicketSeverity | null;
        const categoryFilter = parsedUrl.searchParams.get('category');
        const search = (parsedUrl.searchParams.get('search') || '').trim().toLowerCase();
        const page = Math.max(1, Number(parsedUrl.searchParams.get('page') || 1));
        const pageSize = Math.min(100, Math.max(1, Number(parsedUrl.searchParams.get('pageSize') || 25)));

        if (!Number.isSafeInteger(Number(parsedUrl.searchParams.get('page') || 1)) || !Number.isSafeInteger(Number(parsedUrl.searchParams.get('pageSize') || 25))) {
          sendError(res, 400, 'VALIDATION_ERROR', 'Pagination must use finite integers.'); return;
        }

        if (store.ticketPage) {
          const { items, total } = await store.ticketPage(currentUser, {
            status: statusFilter, severity: severityFilter, sbuId: sbuFilter,
            category: categoryFilter, assigneeId: assignedToMe ? currentUser.id : undefined, search, page, pageSize,
          });
          sendJson(res, 200, { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 } });
          return;
        }
        const accessible = state.tickets.filter((t) => canAccessTicket(currentUser, t));
        const filtered = accessible.filter((t) => {
          if (statusFilter && t.status !== statusFilter) return false;
          if (sbuFilter && t.sbuId !== sbuFilter) return false;
          if (assignedToMe && t.assigneeId !== currentUser.id) return false;
          if (severityFilter && t.severity !== severityFilter) return false;
          if (categoryFilter && !state.serviceCategories.some(c => c.id === t.serviceCategoryId &&
            (c.id === categoryFilter || c.slug === categoryFilter))) return false;
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
        const existingHigh = state.tickets.reduce((high, ticket) => {
          const suffix = /-([0-9]+)$/.exec(ticket.ticketNumber);
          return suffix ? Math.max(high, Number(suffix[1])) : high;
        }, 1000);
        const sequence = Math.max(state.ticketNumberHighWatermark ?? 1000, existingHigh) + 1;
        if (sequence > MAX_TICKET_SEQUENCE) {
          sendError(res, 409, 'TICKET_NUMBER_EXHAUSTED', 'A ticket number could not be allocated.');
          return;
        }
        const workflow = planTicketCreation(
          validInput, category, currentUser, state.users.filter(u => u.roleName === 'IT_ADMIN' && u.isActive)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0],
          state.knowledgeArticles, aiOrchestrator, ticketNumberFor(category.slug, sequence, now), now,
        );
        const { ticket, events, approvals, aiLog, aiDecision, auditDetails, notification } = workflow;
        state.ticketNumberHighWatermark = sequence;
        state.tickets.unshift(ticket);
        state.ticketEvents.push(...events);
        state.approvals.unshift(...approvals);
        state.aiActionLogs.unshift(aiLog);
        recordAudit({
          actor: currentUser,
          action: 'TICKET_CREATED',
          resource: 'Ticket',
          resourceId: ticket.id,
          ipAddress: clientIp,
          details: auditDetails,
        });
        await queueProcessor.enqueueNotification(notification);

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
          const canSeeInternal = ['IT_ADMIN', 'CTO'].includes(currentUser.roleName);
          const canAssign = currentUser.roleName === 'IT_ADMIN' && isAssignableStatus(ticket.status);
          const assignee = canSeeInternal ? state.users.find(user => user.id === ticket.assigneeId) : undefined;
          const comments = state.ticketComments
            .filter((c) => c.ticketId === ticket.id)
            .filter((c) => !c.isInternal || canSeeInternal);
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
            events: canSeeInternal ? events : events.map(event =>
              event.eventType === 'TICKET_REASSIGNED' ? { ...event, metadata: {} } : event),
            ...(canSeeInternal ? {
              assigneeName: assignee?.displayName ?? null,
              assigneeIsActive: assignee?.isActive ?? null,
            } : {}),
            ...(canAssign ? {
              assignment: {
                revision: events.length,
                candidates: state.users
                  .filter(user => user.isActive && user.roleName === 'IT_ADMIN')
                  .map(user => ({ id: user.id, displayName: user.displayName }))
                  .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id)),
              },
            } : {}),
            comments,
            approvals,
            aiLogs,
          });
          return;
        }

        // POST /api/tickets/:id/assign — IT-only compare-and-set ownership update
        if (method === 'POST' && subAction === 'assign') {
          if (currentUser.roleName !== 'IT_ADMIN') {
            sendError(res, 403, 'FORBIDDEN', 'Only IT Administrators may assign an IT ticket.');
            return;
          }
          const body = await readBody(req);
          const input = validateAssignmentInput(body);
          if (!isAssignableStatus(ticket.status)) {
            sendError(res, 409, 'ASSIGNMENT_STATE_CONFLICT', 'Ticket is not in an assignable IT work state.');
            return;
          }
          // History is append-only in both stores, including automatic routing.
          const revision = state.ticketEvents.filter(event => event.ticketId === ticket.id).length;
          if (ticket.assigneeId !== input.expectedAssigneeId || revision !== input.expectedRevision) {
            sendError(res, 409, 'ASSIGNMENT_CONFLICT', 'Ticket changed. Refresh before assigning.');
            return;
          }
          const target = state.users.find(user => user.id === input.assigneeId);
          if (!target || !target.isActive || target.roleName !== 'IT_ADMIN') {
            sendError(res, 400, 'INVALID_ASSIGNEE', 'Selected assignee is not an active IT Administrator.');
            return;
          }
          if (ticket.assigneeId === target.id) {
            sendJson(res, 200, { ticket, changed: false });
            return;
          }
          const previousAssigneeId = ticket.assigneeId;
          ticket.assigneeId = target.id;
          ticket.updatedAt = new Date().toISOString();
          state.ticketEvents.push({
            id: crypto.randomUUID(),
            ticketId: ticket.id,
            actorId: currentUser.id,
            actorName: currentUser.displayName,
            eventType: 'TICKET_REASSIGNED',
            fromStatus: ticket.status,
            toStatus: ticket.status,
            metadata: { previousAssigneeId, assigneeId: target.id, reason: input.reason },
            createdAt: ticket.updatedAt,
          });
          recordAudit({
            actor: currentUser,
            action: 'TICKET_REASSIGNED',
            resource: 'Ticket',
            resourceId: ticket.id,
            ipAddress: clientIp,
            details: { previousAssigneeId, assigneeId: target.id, reason: input.reason },
          });
          await queueProcessor.enqueueNotification({
            ticketId: ticket.id,
            recipientId: target.id,
            recipientEmail: target.email,
            subject: '[' + ticket.ticketNumber + '] IT Assignment',
            body: 'Ticket ' + ticket.ticketNumber + ' has been assigned to you.',
          });
          sendJson(res, 200, { ticket, changed: true });
          return;
        }

        // POST /api/tickets/:id/transition
        if (method === 'POST' && subAction === 'transition') {
          const body = await readBody(req);
          const targetStatus = body.status as TicketStatus;
          if (targetStatus === 'ESCALATED_TO_CTO') {
            await escalateTicket(res, currentUser, ticket, body.reason ?? body.notes, clientIp);
            return;
          }
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
            const itAdmin = state.users.find((u) => u.roleName === 'IT_ADMIN' && u.isActive);
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
            const enqueue = queueProcessor.enqueueNotification({
              ticketId: ticket.id,
              recipientId: requester.id,
              recipientEmail: requester.email,
              subject: `[${ticket.ticketNumber}] Status Updated to ${ticket.status}`,
              body: `Ticket ${ticket.ticketNumber} transitioned from ${previousStatus} to ${ticket.status} by ${currentUser.displayName}.\nNotes: ${notes || 'None'}`,
            });
            if (postgres) await enqueue;
            else await enqueue.catch(() => {});
          }

          sendJson(res, 200, { ticket });
          return;
        }

        // POST /api/tickets/:id/escalate-cto
        if (method === 'POST' && subAction === 'escalate-cto') {
          const body = await readBody(req);
          await escalateTicket(res, currentUser, ticket, body.reason, clientIp);
          return;
        }

        if (method === 'GET' && subAction === 'attachments') {
          if (!canAccessTicket(currentUser, ticket)) {
            sendError(res, 403, 'FORBIDDEN', 'Ticket attachment access denied.');
            return;
          }
          const state = store.getState();
          const items = (state.ticketAttachments || []).filter((attachment) => attachment.ticketId === ticket.id);
          sendJson(res, 200, { items });
          return;
        }

        if (method === 'POST' && subAction === 'attachments') {
          if (!canAccessTicket(currentUser, ticket) && !['IT_ADMIN', 'CTO'].includes(currentUser.roleName)) {
            sendError(res, 403, 'FORBIDDEN', 'Ticket attachment upload denied.');
            return;
          }
          const body = await readBody(req);
          const fileName = typeof body.fileName === 'string' ? body.fileName.trim().slice(0, 255) : '';
          const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim().slice(0, 128) : 'application/octet-stream';
          const contentBase64 = typeof body.contentBase64 === 'string' ? body.contentBase64 : '';
          if (!fileName || !contentBase64) {
            sendError(res, 400, 'VALIDATION_ERROR', 'fileName and contentBase64 are required.');
            return;
          }
          let bytes: Buffer;
          try {
            bytes = Buffer.from(contentBase64, 'base64');
          } catch {
            sendError(res, 400, 'VALIDATION_ERROR', 'contentBase64 is invalid.');
            return;
          }
          if (bytes.length < 1 || bytes.length > 1024 * 1024) {
            sendError(res, 400, 'VALIDATION_ERROR', 'Attachments must contain 1 byte to 1 MiB.');
            return;
          }
          const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
          const now = new Date().toISOString();
          const state = store.getState();
          const existing = (state.ticketAttachments || []).find((attachment) =>
            attachment.ticketId === ticket.id && attachment.sha256 === sha256 && attachment.fileName === fileName);
          if (existing) {
            sendJson(res, 200, { attachment: existing, idempotent: true });
            return;
          }
          const attachment = {
            id: `attachment-${crypto.randomUUID()}`,
            ticketId: ticket.id,
            uploaderId: currentUser.id,
            fileName,
            mimeType,
            sizeBytes: bytes.length,
            contentBase64: bytes.toString('base64'),
            sha256,
            createdAt: now,
          };
          state.ticketAttachments = state.ticketAttachments || [];
          state.ticketAttachments.push(attachment);
          store.persist();
          recordAudit({
            actor: currentUser,
            action: 'TICKET_ATTACHMENT_UPLOADED',
            resource: 'TicketAttachment',
            resourceId: attachment.id,
            ipAddress: clientIp,
            details: { ticketId: ticket.id, fileName, mimeType, sizeBytes: bytes.length, sha256 },
          });
          sendJson(res, 201, { attachment });
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
        if (store.approvalItems) {
          sendJson(res, 200, { items: await store.approvalItems() });
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
        if (!['IT_ADMIN', 'CTO'].includes(currentUser.roleName)) {
          sendError(res, 403, 'FORBIDDEN', 'Insufficient privileges to decide approvals.');
          return;
        }
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

        const body = await readBody(req);
        const decision = body.decision as 'APPROVED' | 'REJECTED';
        const decisionNotes = typeof body.decisionNotes === 'string' ? redactSensitiveData(body.decisionNotes.trim()) : '';
        if (approval.status !== 'PENDING') {
          sendError(res, 409, 'APPROVAL_ALREADY_DECIDED', 'Approval decisions are immutable.'); return;
        }
        if (approval.consumedAt) {
          sendError(res, 409, 'APPROVAL_ALREADY_CONSUMED', 'Approval has already been consumed.'); return;
        }
        if (approval.expiresAt && Date.parse(approval.expiresAt) <= Date.now()) {
          sendError(res, 410, 'APPROVAL_EXPIRED', 'Approval has expired.'); return;
        }
        const boundParams = approval.actionParams &&
          typeof approval.actionParams === 'object' && !Array.isArray(approval.actionParams)
          ? approval.actionParams as Record<string, unknown>
          : null;
        const suppliedParams = body.actionParams && typeof body.actionParams === 'object' && !Array.isArray(body.actionParams)
          ? body.actionParams as Record<string, unknown>
          : boundParams;
        if (!suppliedParams) {
          sendError(res, 400, 'VALIDATION_ERROR', 'Exact action parameters are required.'); return;
        }
        if (approval.actionParamsHash && sha256Params(suppliedParams) !== approval.actionParamsHash) {
          sendError(res, 409, 'APPROVAL_PARAMETER_MISMATCH', 'Action parameters do not match the approved binding.'); return;
        }
        if (typeof body.expectedVersion === 'number' && approval.expectedVersion !== undefined && body.expectedVersion !== approval.expectedVersion) {
          sendError(res, 409, 'APPROVAL_VERSION_CONFLICT', 'Approval parameters changed after the request was opened.'); return;
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
        approval.consumedAt = approval.decidedAt;
        approval.expectedVersion = (approval.expectedVersion || 0) + 1;

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
        if (store.assetItems) {
          sendJson(res, 200, { items: await store.assetItems(currentUser) });
          return;
        }
        const state = store.getState();
        const items =
          currentUser.roleName === 'IT_ADMIN' || currentUser.roleName === 'CTO'
            ? state.assets
            : state.assets.filter((a) => a.assignedUserId === currentUser.id && a.sbuId === currentUser.sbuId);
        sendJson(res, 200, { items });
        return;
      }

      if (method === 'POST' && pathname === '/api/assets') {
        if (currentUser.roleName !== 'IT_ADMIN') {
          sendError(res, 403, 'FORBIDDEN', 'Only IT Administrators may register assets.');
          return;
        }
        const body = await readBody(req);
        const assetTag = typeof body.assetTag === 'string' ? body.assetTag.trim() : '';
        const serialNumber = typeof body.serialNumber === 'string' ? body.serialNumber.trim() : '';
        const category = typeof body.category === 'string' ? body.category.trim() : '';
        const modelName = typeof body.modelName === 'string' ? body.modelName.trim() : '';
        const sbuId = typeof body.sbuId === 'string' ? body.sbuId : currentUser.sbuId;
        if (!assetTag || !serialNumber || !category || !modelName) {
          sendError(res, 400, 'VALIDATION_ERROR', 'assetTag, serialNumber, category and modelName are required.');
          return;
        }
        const state = store.getState();
        if (!state.sbus.some((sbu) => sbu.id === sbuId)) {
          sendError(res, 400, 'INVALID_SBU', 'Asset SBU does not exist.');
          return;
        }
        if (state.assets.some((asset) => asset.assetTag === assetTag || asset.serialNumber === serialNumber)) {
          sendError(res, 409, 'ASSET_ALREADY_EXISTS', 'Asset tag or serial number already exists.');
          return;
        }
        const now = new Date().toISOString();
        const asset = {
          id: `asset-${crypto.randomUUID()}`,
          assetTag,
          serialNumber,
          category,
          modelName,
          status: 'AVAILABLE' as const,
          sbuId,
          assignedUserId: null,
          handoverAckStatus: 'ACKNOWLEDGED' as const,
          handoverNotes: null,
          history: [{ date: now, action: 'REGISTERED', actorEmail: currentUser.email, notes: typeof body.notes === 'string' ? redactSensitiveData(body.notes.trim()) : 'Synthetic asset registered' }],
          location: typeof body.location === 'string' ? body.location.trim() : null,
          condition: (['GOOD', 'DAMAGED', 'NEEDS_REPAIR'].includes(String(body.condition)) ? body.condition : 'GOOD') as 'GOOD' | 'DAMAGED' | 'NEEDS_REPAIR',
          lifecycleNotes: null,
          lastMaintenanceAt: null,
          retiredAt: null,
          createdAt: now,
          updatedAt: now,
        };
        state.assets.push(asset);
        store.persist();
        recordAudit({
          actor: currentUser,
          action: 'ASSET_REGISTERED',
          resource: 'Asset',
          resourceId: asset.id,
          ipAddress: clientIp,
          details: { assetTag, serialNumber, sbuId, category, modelName },
        });
        sendJson(res, 201, { asset });
        return;
      }

      const assetLifecycleMatch = pathname.match(/^\/api\/assets\/([^/]+)\/lifecycle$/);
      if (method === 'POST' && assetLifecycleMatch) {
        if (currentUser.roleName !== 'IT_ADMIN') {
          sendError(res, 403, 'FORBIDDEN', 'Only IT Administrators may change asset lifecycle.');
          return;
        }
        const assetId = decodeURIComponent(assetLifecycleMatch[1]);
        const state = store.getState();
        const asset = state.assets.find((item) => item.id === assetId);
        if (!asset) {
          sendError(res, 404, 'ASSET_NOT_FOUND', 'Asset not found.');
          return;
        }
        const body = await readBody(req);
        const action = typeof body.action === 'string' ? body.action : '';
        const notes = typeof body.notes === 'string' ? redactSensitiveData(body.notes.trim()) : '';
        const now = new Date().toISOString();

        if (action === 'assign' || action === 'reassign') {
          const assigneeId = typeof body.assigneeId === 'string' ? body.assigneeId : '';
          const assignee = state.users.find((user) => user.id === assigneeId);
          if (!assignee || assignee.roleName !== 'EMPLOYEE' || !assignee.isActive || assignee.sbuId !== asset.sbuId) {
            sendError(res, 400, 'INVALID_ASSIGNEE', 'Asset assignment requires an active employee in the asset SBU.');
            return;
          }
          if (action === 'assign' && asset.assignedUserId) {
            sendError(res, 409, 'ASSET_ALREADY_ASSIGNED', 'Asset is already assigned.');
            return;
          }
          if (action === 'assign' && state.assets.some((item) => item.id !== asset.id && item.assignedUserId === assigneeId &&
            ['ASSIGNED', 'HANDOVER_PENDING_ACK', 'TAKEOVER_PENDING_ACK'].includes(item.status))) {
            sendError(res, 409, 'EMPLOYEE_ASSET_CONFLICT', 'Employee already has an active asset assignment.');
            return;
          }
          asset.assignedUserId = assigneeId;
          asset.status = 'HANDOVER_PENDING_ACK';
          asset.handoverAckStatus = 'PENDING_EMPLOYEE_ACK';
          asset.handoverNotes = notes || `${action} to ${assignee.displayName}`;
          asset.updatedAt = now;
          asset.history.push({ date: now, action: action === 'reassign' ? 'REASSIGNED' : 'ASSIGNED', actorEmail: currentUser.email, notes: asset.handoverNotes });
        } else if (action === 'handover') {
          if (asset.status !== 'ASSIGNED' && asset.status !== 'HANDOVER_PENDING_ACK') {
            sendError(res, 409, 'ASSET_STATE_CONFLICT', 'Asset cannot enter handover in its current state.');
            return;
          }
          asset.status = 'HANDOVER_PENDING_ACK';
          asset.handoverAckStatus = 'PENDING_EMPLOYEE_ACK';
          asset.handoverNotes = notes || 'Handover pending employee acknowledgement';
          asset.updatedAt = now;
          asset.history.push({ date: now, action: 'HANDOVER_STARTED', actorEmail: currentUser.email, notes: asset.handoverNotes });
        } else if (action === 'takeover') {
          if (!asset.assignedUserId || !['ASSIGNED', 'HANDOVER_PENDING_ACK'].includes(asset.status)) {
            sendError(res, 409, 'ASSET_STATE_CONFLICT', 'Only an assigned asset can enter takeover.');
            return;
          }
          asset.status = 'TAKEOVER_PENDING_ACK';
          asset.handoverAckStatus = 'PENDING_EMPLOYEE_ACK';
          asset.handoverNotes = notes || 'Takeover pending employee acknowledgement';
          asset.updatedAt = now;
          asset.history.push({ date: now, action: 'TAKEOVER_STARTED', actorEmail: currentUser.email, notes: asset.handoverNotes });
        } else if (action === 'return') {
          if (!['ASSIGNED', 'HANDOVER_PENDING_ACK', 'TAKEOVER_PENDING_ACK'].includes(asset.status)) {
            sendError(res, 409, 'ASSET_STATE_CONFLICT', 'Asset is not in an active custody state.');
            return;
          }
          const condition = ['GOOD', 'DAMAGED', 'NEEDS_REPAIR'].includes(String(body.condition)) ? body.condition : 'GOOD';
          asset.assignedUserId = null;
          asset.status = 'AVAILABLE';
          asset.handoverAckStatus = 'ACKNOWLEDGED';
          asset.condition = condition as 'GOOD' | 'DAMAGED' | 'NEEDS_REPAIR';
          asset.handoverNotes = notes || 'Returned to inventory';
          asset.updatedAt = now;
          asset.history.push({ date: now, action: 'RETURNED', actorEmail: currentUser.email, notes: `${asset.handoverNotes}; condition=${condition}` });
        } else if (action === 'maintenance') {
          asset.status = 'MAINTENANCE';
          asset.lastMaintenanceAt = now;
          asset.lifecycleNotes = notes || 'Maintenance recorded';
          asset.updatedAt = now;
          asset.history.push({ date: now, action: 'MAINTENANCE', actorEmail: currentUser.email, notes: asset.lifecycleNotes });
        } else if (action === 'retire') {
          asset.status = 'RETIRED';
          asset.assignedUserId = null;
          asset.retiredAt = now;
          asset.lifecycleNotes = notes || 'Asset retired';
          asset.updatedAt = now;
          asset.history.push({ date: now, action: 'RETIRED', actorEmail: currentUser.email, notes: asset.lifecycleNotes });
        } else {
          sendError(res, 400, 'VALIDATION_ERROR', 'Unsupported asset lifecycle action.');
          return;
        }
        if (typeof body.location === 'string') asset.location = body.location.trim();
        store.persist();
        recordAudit({
          actor: currentUser,
          action: `ASSET_${action.toUpperCase()}`,
          resource: 'Asset',
          resourceId: asset.id,
          ipAddress: clientIp,
          details: { assetTag: asset.assetTag, serialNumber: asset.serialNumber, action, assigneeId: asset.assignedUserId, notes },
        });
        sendJson(res, 200, { asset });
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

        if (asset.assignedUserId && asset.status === 'ASSIGNED' && asset.handoverAckStatus === 'ACKNOWLEDGED') {
          sendJson(res, 200, {asset}); return; // idempotent retry; preserve history
        }
        if (!asset.assignedUserId || !['HANDOVER_PENDING_ACK', 'TAKEOVER_PENDING_ACK'].includes(asset.status) || asset.handoverAckStatus !== 'PENDING_EMPLOYEE_ACK') {
          sendError(res, 409, 'ASSET_STATE_CONFLICT', 'Only an assigned pending handover or takeover may be acknowledged.'); return;
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
        if (store.notificationFeed) {
          sendJson(res, 200, await store.notificationFeed(currentUser));
          return;
        }
        const state = store.getState();
        const items =
          currentUser.roleName === 'IT_ADMIN' || currentUser.roleName === 'CTO'
            ? state.notifications.slice(0, 50)
            : state.notifications.filter((n) => n.recipientId === currentUser.id);
        sendJson(res, 200, {
          items,
          deliveredTransportCount: emailTransport.getDeliveredMessages().filter(message => ['IT_ADMIN', 'CTO'].includes(currentUser.roleName) || message.to.toLowerCase() === currentUser.email.toLowerCase()).length,
        });
        return;
      }

      const notificationRead = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
      if (method === 'POST' && notificationRead) {
        const id = decodeURIComponent(notificationRead[1]);
        const notification = store.getState().notifications.find(row => row.id === id && row.recipientId === currentUser.id);
        if (!notification) {
          sendError(res, 404, 'NOTIFICATION_NOT_FOUND', 'Notification not found.');
          return;
        }
        notification.readAt ??= new Date().toISOString();
        store.persist();
        sendJson(res, 200, { notification });
        return;
      }

      if (method === 'GET' && pathname === '/api/analytics/summary') {
        if (store.ticketAnalytics) {
          sendJson(res, 200, await store.ticketAnalytics(currentUser));
          return;
        }

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

      if (method === 'GET' && pathname === '/api/reports/summary') {
        if (!['IT_ADMIN', 'CTO'].includes(currentUser.roleName)) {
          sendError(res, 403, 'FORBIDDEN', 'Reporting is restricted to IT Administrators and the CTO.');
          return;
        }
        const state = store.getState();
        const now = Date.now();
        const tickets = state.tickets.filter((ticket) => currentUser.roleName === 'CTO' || ticket.sbuId === currentUser.sbuId);
        const ticketIds = new Set(tickets.map((ticket) => ticket.id));
        const slaBreaches = tickets.filter((ticket) => {
          const resolutionDue = Date.parse(ticket.slaResolutionDueAt || ticket.slaDueAt);
          return ticket.slaBreached || (now > resolutionDue && !['CLOSED', 'RESOLVED_PENDING_CONFIRMATION'].includes(ticket.status));
        }).length;
        const assets = state.assets.filter((asset) => currentUser.roleName === 'CTO' || asset.sbuId === currentUser.sbuId);
        sendJson(res, 200, {
          ticketTotal: tickets.length,
          openTickets: tickets.filter((ticket) => ticket.status !== 'CLOSED').length,
          escalatedTickets: tickets.filter((ticket) => ticket.status === 'ESCALATED_TO_CTO').length,
          slaBreaches,
          pendingApprovals: state.approvals.filter((approval) => approval.status === 'PENDING' && ticketIds.has(approval.ticketId)).length,
          assetTotal: assets.length,
          assignedAssets: assets.filter((asset) => asset.assignedUserId).length,
          maintenanceAssets: assets.filter((asset) => asset.status === 'MAINTENANCE').length,
          retiredAssets: assets.filter((asset) => asset.status === 'RETIRED').length,
          attachmentCount: (state.ticketAttachments || []).filter((attachment) => ticketIds.has(attachment.ticketId)).length,
          generatedAt: new Date().toISOString(),
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
      if (err instanceof SessionPersistenceError) {
        sendError(res, 503, 'PERSISTENCE_FAILURE', 'Session could not be established. Restart sign-in.');
        return;
      }
      if (err instanceof ValidationError) {
        sendError(res, 400, 'VALIDATION_ERROR', err.message, err.details);
        return;
      }
      logStructured('ERROR', 'UNHANDLED_API_ERROR', { requestId: requestIds.get(req) });
      sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred while processing the request.');
    }
  };

  // Attach body listeners before waiting for the local serial queue.
  const requestIds = new WeakMap<http.IncomingMessage, string>();
  let loginOperations = 0;
  let callbackOperations = 0;
  let exclusiveProbe = false;
  let tail: Promise<void> = Promise.resolve();
  const handleAdmittedRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const requestId = crypto.randomUUID();
    requestIds.set(req, requestId);
    res.setHeader('X-Request-Id', requestId);
    const method = req.method || 'GET';
    const rawTarget = req.url || '/';
    if (!rawTarget.startsWith('/') || rawTarget.startsWith('//') || rawTarget.includes('\\')) {
      sendError(res, 400, 'INVALID_REQUEST_TARGET', 'Invalid request target.');
      return;
    }
    const pathname = new URL(rawTarget, 'http://localhost').pathname;
    if (method === 'GET' && pathname === '/api/live') {
      sendJson(res, 200, { status: 'ALIVE', storageMode: postgres ? 'postgres' : 'json', environment: process.env.NODE_ENV || 'unset' });
      return;
    }
    const body = consumeBody(req);
    body.catch(() => {});
    let clientIp: string;
    try { clientIp = ingress.resolve(req.socket?.remoteAddress, req.headers); }
    catch {
      sendError(res, 400, 'INVALID_INGRESS', 'Invalid client address or forwarding chain.');
      return;
    }
    if (method !== 'OPTIONS' && !(method === 'GET' && pathname === '/api/ready')) {
      let retry: number;
      try { retry = await checkAbuse(abuse, policy, clientIp, pathname); }
      catch {
        logStructured('WARN', 'ABUSE_STORE_UNAVAILABLE', { requestId });
        sendError(res, 503, 'PERSISTENCE_FAILURE', 'Request protection is temporarily unavailable.');
        return;
      }
      if (retry) {
        res.setHeader('Retry-After', String(retry));
        sendError(res, 429, 'RATE_LIMIT_EXCEEDED', 'Too many requests; please retry shortly.');
        return;
      }
    }
    let login: VerifiedLogin | undefined;
    const beginOidc = method === 'GET' && pathname === '/api/auth/oidc/login';
    const exchangeOidc = method === 'GET' && pathname === '/api/auth/oidc/callback' && (!req.headers.origin || req.headers.origin === enterpriseAuth?.publicUrl)
      ? enterpriseAuth : undefined;
    if (beginOidc || exchangeOidc) {
      if ((beginOidc ? loginOperations : callbackOperations) >= 4) {
        res.setHeader('Retry-After', '2');
        sendError(res, 429, 'OIDC_BUSY', 'Sign-in is busy. Please retry shortly.');
        return;
      }
      if (beginOidc) loginOperations++;
      else callbackOperations++;
      try {
        if (beginOidc) {
          await runRequest(req, res, clientIp);
          return;
        }
        if (exchangeOidc) {
          login = await exchangeOidc.exchange(new URL(rawTarget, exchangeOidc.publicUrl).href,
            cookieValue(req.headers.cookie, 'aiit_oidc_flow'));
        }
      } catch { /* The callback emits a generic failure without provider data. */ }
      finally {
        if (beginOidc) loginOperations--;
        else callbackOperations--;
      }
    }
    bodies.set(req, body);
    let done: (() => void) | undefined;
    if (!postgres) {
      const previous = tail;
      tail = new Promise<void>(resolve => { done = resolve; });
      await previous;
    }
    let code = 200;
    const headers: Record<string, string | string[]> = {};
    let output = '';
    const buffered = {
      setHeader(k: string, v: string | string[]) { headers[k] = v; },
      writeHead(c: number, h: Record<string, string> = {}) { code = c; Object.assign(headers, h); },
      end(chunk = '') { output += chunk; },
    } as unknown as http.ServerResponse;
    try {
      if (method === 'GET' && pathname === '/api/ready') {
        let ready: boolean;
        try {
          ready = await store.isHealthy(() => {
            // Pause admission only if the failed probe is the sole active request.
            exclusiveProbe = postgres && inFlight === 1;
            return exclusiveProbe;
          });
        } finally { exclusiveProbe = false; }
        sendJson(res, ready ? 200 : 503, { status: ready ? 'READY' : 'UNAVAILABLE', storageMode: postgres ? 'postgres' : 'json' });
        return;
      }
      try { await body; } catch (err) {
        sendError(res, String(err).includes('1MB') ? 413 : 400, 'VALIDATION_ERROR', 'Invalid or oversized JSON request.');
        return;
      }
      const operation = async () => {
        await runRequest(req, buffered, clientIp, login);
        // Denials may contain a security audit event; only server failures roll back.
        return code < 500;
      };
      if (postgres && method === 'GET' && ['/api/health', '/api/openapi.json', '/api/auth/config', '/api/auth/oidc/login'].includes(pathname)) await operation();
      else {
        const token = postgres && isDevelopmentAuthEnabled() ? extractSessionToken(req) : null;
        await store.transaction(operation, { pathname, method, developmentSessionDigest: token ? sessionDigest(token) : undefined });
      }
      res.writeHead(code, headers); res.end(output);
    } catch (err) {
      const conflict = /PERSISTENCE_BUSY|PERSISTENCE_CONFLICT/.test(String(err));
      logStructured('WARN', conflict ? 'PERSISTENCE_CONFLICT' : 'PERSISTENCE_FAILURE', { requestId, storageMode: postgres ? 'postgres' : 'json' });
      sendError(res, conflict ? 409 : 503,
        'PERSISTENCE_FAILURE', 'Operation was not committed. Retry after recovery or contention clears.');
    } finally { bodies.delete(req); done?.(); }
  };

  let inFlight = 0;
  const handleRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.method === 'GET' && req.url === '/api/live') return handleAdmittedRequest(req, res);
    if (exclusiveProbe || inFlight >= policy.inFlight) {
      req.resume?.();
      res.setHeader('Retry-After', '1');
      sendError(res, 429, 'API_BUSY', 'The API is busy. Please retry shortly.');
      return;
    }
    inFlight++;
    try { await handleAdmittedRequest(req, res); }
    finally { inFlight--; }
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
