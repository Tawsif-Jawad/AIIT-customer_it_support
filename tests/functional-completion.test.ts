import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createApiServer, type AppInstance } from '../apps/api/src/app.ts';

describe('Day 1-9 functional completion', () => {
  let app: AppInstance;
  let employeeToken: string;
  let nadiaToken: string;
  let itToken: string;
  const dbPath = path.resolve(process.cwd(), '.data', `functional-completion-${Date.now()}.json`);

  before(() => {
    app = createApiServer(dbPath);
  });

  after(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  async function login(email: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      body: { email },
    });
    assert.equal(response.status, 200);
    return response.data.token as string;
  }

  it('authenticates synthetic roles', async () => {
    employeeToken = await login('employee@example.test');
    nadiaToken = await login('second-employee@example.test');
    itToken = await login('it@example.test');
    assert.ok(employeeToken);
    assert.ok(itToken);
  });

  it('reviews overdue SLA tickets once and exposes breach status', async () => {
    const state = app.store.getState();
    const ticket = state.tickets.find((item) => !['CLOSED', 'RESOLVED_PENDING_CONFIRMATION'].includes(item.status));
    assert.ok(ticket);
    ticket.slaResponseDueAt = new Date(Date.now() - 120_000).toISOString();
    ticket.slaResolutionDueAt = new Date(Date.now() - 60_000).toISOString();
    ticket.slaBreached = false;
    ticket.slaEscalatedAt = null;
    app.store.persist();

    const first = await app.inject({ method: 'POST', url: '/api/sla/review', token: itToken, body: {} });
    assert.equal(first.status, 200);
    assert.equal(first.data.reviewed >= 1, true, JSON.stringify(first.data));
    const status = await app.inject({ method: 'GET', url: '/api/sla/status', token: itToken });
    assert.equal(status.status, 200);
    assert.equal(status.data.summary.resolutionBreaches >= 1, true);

    const second = await app.inject({ method: 'POST', url: '/api/sla/review', token: itToken, body: {} });
    assert.equal(second.status, 200);
    assert.equal(second.data.reviewed, 0);
  });

  it('registers, assigns and retires assets without double assignment', async () => {
    const state = app.store.getState();
    state.users.push({
      id: 'user-emp-functional',
      email: 'functional-employee@example.test',
      displayName: 'Synthetic Functional Employee',
      oidcSubject: 'functional-employee-subject',
      sbuId: 'sbu-fin-002',
      sbuCode: 'SBU-FIN',
      roleId: 'role-employee',
      roleName: 'EMPLOYEE',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    app.store.persist();
    const registered = await app.inject({
      method: 'POST',
      url: '/api/assets',
      token: itToken,
      body: { assetTag: 'ASSET-FUNCTIONAL-001', serialNumber: 'SN-FUNCTIONAL-001', category: 'Laptop', modelName: 'Synthetic Laptop', sbuId: 'sbu-fin-002' },
    });
    assert.equal(registered.status, 201);
    const assetId = registered.data.asset.id as string;

    const assigned = await app.inject({
      method: 'POST',
      url: `/api/assets/${assetId}/lifecycle`,
      token: itToken,
      body: { action: 'assign', assigneeId: 'user-emp-functional', notes: 'Synthetic handover' },
    });
    assert.equal(assigned.status, 200);
    assert.equal(assigned.data.asset.status, 'HANDOVER_PENDING_ACK');

    const returnResult = await app.inject({
      method: 'POST',
      url: `/api/assets/${assetId}/lifecycle`,
      token: itToken,
      body: { action: 'return', condition: 'GOOD', notes: 'Returned intact' },
    });
    assert.equal(returnResult.status, 200);
    assert.equal(returnResult.data.asset.assignedUserId, null);

    const retired = await app.inject({
      method: 'POST',
      url: `/api/assets/${assetId}/lifecycle`,
      token: itToken,
      body: { action: 'retire', notes: 'End of life' },
    });
    assert.equal(retired.status, 200);
    assert.equal(retired.data.asset.status, 'RETIRED');
  });

  it('binds approval parameters, expires approvals and consumes decisions once', async () => {
    const state = app.store.getState();
    const pending = state.approvals.filter((item) => item.status === 'PENDING' && item.requiredRole === 'IT_ADMIN');
    assert.ok(pending.length >= 1);
    const expired = pending[0];
    expired.expiresAt = new Date(Date.now() - 60_000).toISOString();
    app.store.persist();
    const expiredResult = await app.inject({
      method: 'POST',
      url: `/api/approvals/${expired.id}/decide`,
      token: itToken,
      body: { decision: 'APPROVED', decisionNotes: 'Expired should fail', actionParams: expired.actionParams, expectedVersion: expired.expectedVersion || 0 },
    });
    assert.equal(expiredResult.status, 410, JSON.stringify(expiredResult.data));

    const ticketResult = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      token: employeeToken,
      body: {
        serviceCategoryId: 'ad-account-request',
        title: 'Synthetic approval binding test',
        description: 'Synthetic privileged approval test with no corporate operation.',
        severity: 'MEDIUM',
        customFormPayload: { targetAdGroup: 'CN=Synthetic-Test-Group', businessJustification: 'Disposable functional approval test' },
      },
    });
    assert.equal(ticketResult.status, 201);
    const approval = app.store.getState().approvals.find((item) => item.ticketId === ticketResult.data.ticket.id && item.status === 'PENDING');
    assert.ok(approval);
    assert.ok(approval.actionParamsHash);

    const mismatch = await app.inject({
      method: 'POST',
      url: `/api/approvals/${approval.id}/decide`,
      token: itToken,
      body: { decision: 'APPROVED', decisionNotes: 'Synthetic approval rationale', actionParams: { actionType: 'SUBSTITUTED' }, expectedVersion: 0 },
    });
    assert.equal(mismatch.status, 409);

    const accepted = await app.inject({
      method: 'POST',
      url: `/api/approvals/${approval.id}/decide`,
      token: itToken,
      body: { decision: 'APPROVED', decisionNotes: 'Synthetic approval rationale', actionParams: approval.actionParams, expectedVersion: approval.expectedVersion || 0 },
    });
    assert.equal(accepted.status, 200);
    assert.ok(accepted.data.approval.consumedAt);

    const replay = await app.inject({
      method: 'POST',
      url: `/api/approvals/${approval.id}/decide`,
      token: itToken,
      body: { decision: 'REJECTED', decisionNotes: 'Replay should fail', actionParams: approval.actionParams, expectedVersion: 1 },
    });
    assert.equal(replay.status, 409);

  });

  it('uploads, lists and hashes synthetic ticket attachments', async () => {
    const state = app.store.getState();
    const ticket = state.tickets.find((item) => item.requesterId === 'user-emp-tawsif');
    assert.ok(ticket);
    const content = Buffer.from('synthetic attachment').toString('base64');
    const uploaded = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/attachments`,
      token: employeeToken,
      body: { fileName: 'synthetic.txt', mimeType: 'text/plain', contentBase64: content },
    });
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.data.attachment.sha256.length, 64);

    const list = await app.inject({ method: 'GET', url: `/api/tickets/${ticket.id}/attachments`, token: employeeToken });
    assert.equal(list.status, 200);
    assert.equal(list.data.items.length >= 1, true);

    const replay = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/attachments`,
      token: employeeToken,
      body: { fileName: 'synthetic.txt', mimeType: 'text/plain', contentBase64: content },
    });
    assert.equal(replay.status, 200);
  });

  it('provides authorized operational reporting and SLA policy visibility', async () => {
    const report = await app.inject({ method: 'GET', url: '/api/reports/summary', token: itToken });
    assert.equal(report.status, 200);
    assert.equal(typeof report.data.ticketTotal, 'number');

    const policies = await app.inject({ method: 'GET', url: '/api/sla/policies', token: itToken });
    assert.equal(policies.status, 200);
    assert.equal(policies.data.items.length, 4);
  });
});
