/**
 * End-to-End Integration & Acceptance Tests for Milestone 1
 * Verifies all 13 First Milestone Acceptance Criteria against a real running API + Web Server instance.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createApiServer, type AppInstance } from '../apps/api/src/app.ts';
import { getPortalHtml } from '../apps/web/src/server.ts';

describe('Milestone 1 Full-Stack Acceptance & Integration Suite', () => {
  let appInstance: AppInstance;
  const testDbPath = path.resolve(process.cwd(), '.data', `test-db-${Date.now()}.json`);

  let employeeTawsifToken = '';
  let employeeNadiaToken = '';
  let itAdminKamalToken = '';
  let ctoFarhanaToken = '';

  let autoResolvedTicketId = '';
  let unresolvedTicketId = '';

  before(async () => {
    appInstance = createApiServer(testDbPath);
  });

  after(async () => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function apiRequest(
    method: string,
    endpoint: string,
    token?: string,
    body?: Record<string, unknown>
  ): Promise<{ status: number; data: Record<string, any> }> {
    const res = await appInstance.inject({
      method,
      url: endpoint,
      token,
      body,
    });
    return { status: res.status, data: res.data };
  }

  it('1. Verifies system health, readiness, and web portal rendering', async () => {
    const health = await apiRequest('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'MOCK MODE');
    assert.equal(health.data.components.database.status, 'CONNECTED');
    assert.equal(health.data.components.redisQueue.status, 'MOCK MODE');

    const html = getPortalHtml('http://localhost:4000');
    assert.ok(html.includes('AIIT'));
    assert.ok(html.includes('CTO Escalation Dashboard'));
  });

  it('2. Authenticates development OIDC identities across roles and SBUs', async () => {
    const tawsifLogin = await apiRequest('POST', '/api/auth/login', undefined, {
      email: 'tawsif.zawad@upstra.com',
    });
    assert.equal(tawsifLogin.status, 200);
    employeeTawsifToken = tawsifLogin.data.token;
    assert.equal(tawsifLogin.data.user.roleName, 'EMPLOYEE');
    assert.equal(tawsifLogin.data.user.sbuCode, 'SBU-TECH');

    const nadiaLogin = await apiRequest('POST', '/api/auth/login', undefined, {
      email: 'nadia.islam@upstra.local',
    });
    assert.equal(nadiaLogin.status, 200);
    employeeNadiaToken = nadiaLogin.data.token;
    assert.equal(nadiaLogin.data.user.sbuCode, 'SBU-FIN');

    const kamalLogin = await apiRequest('POST', '/api/auth/login', undefined, {
      email: 'kamal.hossain@upstra.local',
    });
    assert.equal(kamalLogin.status, 200);
    itAdminKamalToken = kamalLogin.data.token;
    assert.equal(kamalLogin.data.user.roleName, 'IT_ADMIN');

    const farhanaLogin = await apiRequest('POST', '/api/auth/login', undefined, {
      email: 'farhana.ahmed@upstra.local',
    });
    assert.equal(farhanaLogin.status, 200);
    ctoFarhanaToken = farhanaLogin.data.token;
    assert.equal(farhanaLogin.data.user.roleName, 'CTO');
  });

  it('3. Employee submits an eligible low-risk Outlook ticket; Mock AI classifies, suggests resolution, and records AIActionLog', async () => {
    const createRes = await apiRequest('POST', '/api/tickets', employeeTawsifToken, {
      serviceCategoryId: 'cat-outlook-config',
      title: 'Need help configuring Outlook IMAP STARTTLS profile on macOS',
      description: 'How do I configure Outlook incoming port 993 and outgoing STARTTLS on my SBU-TECH laptop?',
      severity: 'LOW',
      customFormPayload: { osPlatform: 'macOS', outlookVersion: '16.91' },
    });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.data.ticket.status, 'RESOLVED_PENDING_CONFIRMATION');
    assert.equal(createRes.data.aiDecision.classification, 'LOW_RISK_OUTLOOK_CONFIGURATION');
    assert.equal(createRes.data.aiDecision.policyDecision, 'ALLOWED_LOW_RISK');
    autoResolvedTicketId = createRes.data.ticket.id;

    // Verify employee can view their own ticket, AIActionLog, and state transition history
    const detail = await apiRequest('GET', `/api/tickets/${autoResolvedTicketId}`, employeeTawsifToken);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.aiLogs.length, 1);
    assert.equal(detail.data.aiLogs[0].classification, 'LOW_RISK_OUTLOOK_CONFIGURATION');
    assert.ok(detail.data.events.length >= 4); // NEW -> TRIAGED -> AI_HANDLING -> RESOLVED_PENDING_CONFIRMATION
  });

  it('4. Enforces strict SBU & resource RBAC: unauthorized employee cannot view another user restricted ticket', async () => {
    const unauthorizedView = await apiRequest('GET', `/api/tickets/${autoResolvedTicketId}`, employeeNadiaToken);
    assert.equal(unauthorizedView.status, 403);
    assert.equal(unauthorizedView.data.error.code, 'FORBIDDEN_RESOURCE');
  });

  it('5. Routes unresolved or approval-gated tickets to IT Administrator queue', async () => {
    const createAdTicket = await apiRequest('POST', '/api/tickets', employeeTawsifToken, {
      serviceCategoryId: 'cat-ad-account',
      title: 'Request Active Directory permission for SBU-TECH deployment group',
      description: 'Please add my AD account to CN=SBU-TECH-Release-Engineers for deployment verification.',
      severity: 'MEDIUM',
      customFormPayload: {
        targetAdGroup: 'CN=SBU-TECH-Release-Engineers',
        businessJustification: 'Release pipeline ownership',
      },
    });

    assert.equal(createAdTicket.status, 201);
    assert.equal(createAdTicket.data.ticket.status, 'ASSIGNED_TO_IT');
    assert.equal(createAdTicket.data.aiDecision.policyDecision, 'REQUIRES_HUMAN_APPROVAL');
    unresolvedTicketId = createAdTicket.data.ticket.id;
  });

  it('6. IT Administrator manages ticket, transitions to IN_PROGRESS, and escalates to CTO', async () => {
    const inProgRes = await apiRequest(
      'POST',
      `/api/tickets/${unresolvedTicketId}/transition`,
      itAdminKamalToken,
      { status: 'IN_PROGRESS', notes: 'Reviewing SBU-TECH Active Directory group policy.' }
    );
    assert.equal(inProgRes.status, 200);
    assert.equal(inProgRes.data.ticket.status, 'IN_PROGRESS');

    // Employee is forbidden from escalating to CTO
    const empEscalateAttempt = await apiRequest(
      'POST',
      `/api/tickets/${unresolvedTicketId}/escalate-cto`,
      employeeTawsifToken,
      { reason: 'Trying to bypass IT' }
    );
    assert.equal(empEscalateAttempt.status, 403);

    // IT Admin escalates to CTO
    const escalateRes = await apiRequest(
      'POST',
      `/api/tickets/${unresolvedTicketId}/escalate-cto`,
      itAdminKamalToken,
      { reason: 'Production AD privilege elevation requires CTO policy review and sign-off.' }
    );
    assert.equal(escalateRes.status, 200);
    assert.equal(escalateRes.data.ticket.status, 'ESCALATED_TO_CTO');
    assert.equal(escalateRes.data.ticket.severity, 'CRITICAL');
  });

  it('7. CTO reviews escalated tickets, decides approvals, and resolves escalated case', async () => {
    const ctoQueue = await apiRequest('GET', '/api/tickets?status=ESCALATED_TO_CTO', ctoFarhanaToken);
    assert.equal(ctoQueue.status, 200);
    assert.ok(ctoQueue.data.items.some((t: any) => t.id === unresolvedTicketId));

    // CTO resolves escalated ticket
    const ctoResolve = await apiRequest(
      'POST',
      `/api/tickets/${unresolvedTicketId}/transition`,
      ctoFarhanaToken,
      { status: 'RESOLVED_PENDING_CONFIRMATION', notes: 'CTO approved temporary dry-run policy exception.' }
    );
    assert.equal(ctoResolve.status, 200);
    assert.equal(ctoResolve.data.ticket.status, 'RESOLVED_PENDING_CONFIRMATION');

    // Employee confirms and closes ticket
    const empClose = await apiRequest(
      'POST',
      `/api/tickets/${unresolvedTicketId}/transition`,
      employeeTawsifToken,
      { status: 'CLOSED', notes: 'Confirmed working. Closing ticket.' }
    );
    assert.equal(empClose.status, 200);
    assert.equal(empClose.data.ticket.status, 'CLOSED');
  });

  it('8. Verifies Audit Events and Development Email Notification Queue processing', async () => {
    const notifications = await apiRequest('GET', '/api/notifications', itAdminKamalToken);
    assert.equal(notifications.status, 200);
    assert.ok(notifications.data.items.length > 0);
    assert.ok(notifications.data.deliveredTransportCount > 0);
    assert.ok(notifications.data.items.some((n: any) => n.status === 'SENT'));

    const auditLogs = await apiRequest('GET', '/api/audit-logs', ctoFarhanaToken);
    assert.equal(auditLogs.status, 200);
    const actions = auditLogs.data.items.map((a: any) => a.action);
    assert.ok(actions.includes('TICKET_CREATED'));
    assert.ok(actions.includes('UNAUTHORIZED_TICKET_ACCESS_BLOCKED'));
    assert.ok(actions.includes('TICKET_ESCALATED_TO_CTO'));
    assert.ok(actions.includes('TICKET_STATUS_TRANSITION'));
  });

  it('9. Verifies integration unavailability fails safely without losing tickets', async () => {
    // Simulate simultaneous AI outage, Redis queue outage, and SMTP outage
    appInstance.aiOrchestrator.setSimulateUnavailable(true);
    appInstance.queueProcessor.setSimulateRedisOutage(true);
    appInstance.emailTransport.setSimulateFailure(true);

    try {
      const degradedRes = await apiRequest('POST', '/api/tickets', employeeTawsifToken, {
        serviceCategoryId: 'cat-internet-conn',
        title: 'VPN gateway timeout during simulated integration outage',
        description: 'Testing that ticket creation succeeds even when AI, Redis, and SMTP are unavailable.',
        severity: 'MEDIUM',
      });

      assert.equal(degradedRes.status, 201);
      assert.equal(degradedRes.data.ticket.status, 'ASSIGNED_TO_IT');
      assert.equal(degradedRes.data.aiDecision.classification, 'AI_SERVICE_UNAVAILABLE_FALLBACK');

      // Verify ticket is safely persisted and retrievable
      const fetchSaved = await apiRequest('GET', `/api/tickets/${degradedRes.data.ticket.id}`, employeeTawsifToken);
      assert.equal(fetchSaved.status, 200);
      assert.equal(fetchSaved.data.ticket.title, 'VPN gateway timeout during simulated integration outage');
    } finally {
      appInstance.aiOrchestrator.setSimulateUnavailable(false);
      appInstance.queueProcessor.setSimulateRedisOutage(false);
      appInstance.emailTransport.setSimulateFailure(false);
    }
  });
});
