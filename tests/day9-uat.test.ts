import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectPostgres, createPostgresApiServer } from '../apps/api/src/postgres-runtime.ts';
import { importJsonSnapshot } from '../scripts/json-import.ts';
import { disposablePostgres, postgresBinaries, runtimeFixture } from './support/disposable-postgres.ts';

const skip = process.env.DB_REQUIRED !== 'true' && !postgresBinaries() ? 'Disposable PostgreSQL unavailable' : false;

test('synthetic role acceptance completes requester to CTO to requester with scoped visibility', { skip, timeout: 60000 }, async t => {
  const cluster = await disposablePostgres();
  t.after(() => cluster.close());
  const dev = { NODE_ENV: 'test', AUTH_MODE: 'dev_oidc', MAIL_PROVIDER: 'mock' };
  Object.assign(process.env, dev);
  const client = await connectPostgres({ ...dev, STORAGE_MODE: 'postgres', DATABASE_URL: cluster.url });
  t.after(() => client.$disconnect());
  const fixture = runtimeFixture();
  const [employee, , customer, admin, cto] = fixture.users;
  const replacement = { ...admin, id: 'day9-uat-it', email: 'day9-uat-it@example.test', oidcSubject: 'day9-uat-it' };
  const service = { ...employee, id: 'day9-uat-service', email: 'day9-uat-service@example.test',
    roleId: 'role-system', roleName: 'SYSTEM_SERVICE' as const, oidcSubject: 'day9-uat-service' };
  fixture.users.push(replacement, service);
  await importJsonSnapshot(client, fixture);
  const api = await createPostgresApiServer(client);
  const login = (email: string) => api.inject({ method: 'POST', url: '/api/auth/login', body: { email } });
  const session = async (email: string) => {
    const result = await login(email);
    assert.equal(result.status, 200);
    return result.data.token as string;
  };
  const owner = await session(employee.email);
  const clientUser = await session(customer.email);
  const it = await session(admin.email);
  const nextIt = await session(replacement.email);
  const chief = await session(cto.email);
  assert.equal((await login(service.email)).status, 401);

  const create = (token: string) => api.inject({
    method: 'POST', url: '/api/tickets', token, body: {
      title: 'Synthetic Outlook profile setup', description: 'Need help with synthetic Outlook configuration',
      serviceCategoryId: 'cat-outlook-config', customFormPayload: { osPlatform: 'macOS' },
    },
  });
  const customerTicket = await create(clientUser);
  assert.equal(customerTicket.status, 201);
  const created = await create(owner);
  assert.equal(created.status, 201);
  assert.equal(created.data.ticket.status, 'RESOLVED_PENDING_CONFIRMATION');
  const url = '/api/tickets/' + created.data.ticket.id;
  const get = (token: string, target = url) => api.inject({ method: 'GET', url: target, token });
  const change = (token: string, status: string) => api.inject({
    method: 'POST', url: url + '/transition', token, body: { status, notes: 'Synthetic role acceptance' },
  });
  assert.equal((await get(clientUser)).status, 403);
  assert.equal((await get(owner, '/api/tickets/' + customerTicket.data.ticket.id)).status, 403);
  assert.equal((await get(owner, '/api/audit-logs')).status, 403);
  const literal = await get(it, '/api/tickets?search=' + encodeURIComponent("' OR 1=1 --"));
  assert.equal(literal.status, 200);
  assert.equal(literal.data.pagination.total, 0);

  const reopened = await change(owner, 'REOPENED');
  assert.equal(reopened.status, 200);
  assert.equal(reopened.data.ticket.status, 'ASSIGNED_TO_IT');
  assert.equal((await change(owner, 'IN_PROGRESS')).status, 403);
  const detail = await get(it);
  const target = detail.data.ticket.assigneeId === replacement.id ? admin.id : replacement.id;
  const assigneeSession = target === admin.id ? it : nextIt;
  const assigned = await api.inject({ method: 'POST', url: url + '/assign', token: it, body: {
    assigneeId: target, expectedAssigneeId: detail.data.ticket.assigneeId,
    expectedRevision: detail.data.assignment.revision, reason: 'Synthetic authorized handoff',
  } });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.data.changed, true);
  assert.equal((await change(assigneeSession, 'IN_PROGRESS')).status, 200);
  assert.equal((await change(assigneeSession, 'ESCALATED_TO_CTO')).status, 200);
  assert.equal((await change(assigneeSession, 'RESOLVED_PENDING_CONFIRMATION')).status, 403);
  assert.equal((await change(chief, 'RESOLVED_PENDING_CONFIRMATION')).status, 200);
  assert.equal((await change(owner, 'CLOSED')).status, 200);
  const closed = await get(owner);
  assert.equal(closed.data.ticket.status, 'CLOSED');
  assert.equal(closed.data.assignment, undefined);
  const assignment = closed.data.events.find((event: { eventType: string }) => event.eventType === 'TICKET_REASSIGNED');
  assert.deepEqual(assignment.metadata, {});
  assert.equal(closed.data.ticket.assigneeId, target);
});
