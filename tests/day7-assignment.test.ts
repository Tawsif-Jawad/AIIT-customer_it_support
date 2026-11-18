import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApiServer } from '../apps/api/src/app.ts';
import { createPostgresApiServer, connectPostgres } from '../apps/api/src/postgres-runtime.ts';
import { disposablePostgres, postgresBinaries, runtimeFixture } from './support/disposable-postgres.ts';
import { importJsonSnapshot } from '../scripts/json-import.ts';

const dev = { NODE_ENV: 'test', AUTH_MODE: 'dev_oidc', MAIL_PROVIDER: 'mock' };
type Api = Pick<ReturnType<typeof createApiServer>, 'inject'>;
const ticketId = 'ticket-seed-1002';
const url = '/api/tickets/' + ticketId + '/assign';
const original = 'user-it-kamal';
const second = 'user-it-day7-second';
const disabled = 'user-it-day7-disabled';
const requester = 'second-employee@example.test';
const detailUrl = '/api/tickets/' + ticketId;

function assignmentFixture() {
  const fixture = runtimeFixture();
  const admin = fixture.users.find(user => user.id === original)!;
  const assignedTicket = fixture.tickets.find(ticket => ticket.id === ticketId)!;
  const otherSbu = fixture.sbus.find(sbu => sbu.id !== assignedTicket.sbuId)!;
  fixture.users.push(
    { ...admin, id: second, email: 'day7-second-it@example.test', displayName: 'Day 7 Second IT',
      oidcSubject: second, sbuId: otherSbu.id, sbuCode: otherSbu.code },
    { ...admin, id: disabled, email: 'day7-disabled-it@example.test', displayName: 'Disabled IT',
      oidcSubject: disabled, isActive: false },
  );
  fixture.tickets.find(ticket => ticket.id === 'ticket-seed-1001')!.status = 'ASSIGNED_TO_IT';
  return fixture;
}

async function assignmentCommand(api: Api, token: string) {
  const result = await api.inject({ method: 'GET', url: detailUrl, token });
  assert.equal(result.status, 200);
  return {
    assigneeId: second,
    expectedAssigneeId: result.data.ticket.assigneeId as string | null,
    expectedRevision: result.data.assignment.revision as number,
    reason: 'Day 7 handoff password="SYNTHETIC redaction probe" Bearer SYNTHETIC_TOKEN {"apiKey":"SYNTHETIC JSON probe"}',
  };
}

async function signIn(api: Api, email: string) {
  const result = await api.inject({ method: 'POST', url: '/api/auth/login', body: { email } });
  assert.equal(result.status, 200);
  return result.data.token as string;
}

async function verifyAssignment(api: Api, inspect: () => Promise<{
  ticket: { assigneeId: string | null; status: string };
  events: { eventType: string; metadata: Record<string, unknown> }[];
  audits: { action: string }[];
  notifications: { recipientId: string; ticketId: string | null }[];
}>, peer: Api) {
  const admin = await signIn(api, 'it@example.test');
  const employee = await signIn(api, 'employee@example.test');
  const customer = await signIn(api, 'customer@example.test');
  const cto = await signIn(api, 'cto@example.test');
  const owner = await signIn(api, requester);
  const peerToken = await signIn(peer, 'it@example.test');
  const command = await assignmentCommand(api, admin);
  assert.equal(command.expectedAssigneeId, original);
  const detail = await api.inject({ method: 'GET', url: detailUrl, token: admin });
  assert.ok(detail.data.assignment.candidates.some((user: { id: string }) => user.id === second));
  assert.ok(!detail.data.assignment.candidates.some((user: { id: string }) => user.id === disabled));
  assert.ok(detail.data.assignment.candidates.every((user: object) => !('email' in user)));
  assert.equal((await api.inject({ method: 'POST', url, body: command })).status, 401);
  assert.equal((await api.inject({ method: 'GET', url: '/api/tickets?assignedToMe=true', token: owner })).status, 403);
  for (const token of [owner, employee, customer, cto]) {
    const denied = await api.inject({ method: 'POST', url, token, body: command });
    assert.equal(denied.status, 403);
  }
  for (const payload of [
    { ...command, assigneeId: 'missing' },
    { ...command, assigneeId: disabled },
    { ...command, assigneeId: 'user-emp-tawsif' },
    { ...command, assigneeId: 'user-cto-farhana' },
  ]) {
    assert.equal((await api.inject({ method: 'POST', url, token: admin, body: payload })).status, 400);
  }
  for (const payload of [
    null, [], 'string', { assigneeId: second, reason: command.reason },
    { ...command, expectedRevision: -1 }, { ...command, expectedRevision: '1' },
    { ...command, reason: 'short' }, { ...command, reason: 'contains a null\0 character' },
  ]) {
    assert.equal((await api.inject({ method: 'POST', url, token: admin, body: payload })).status, 400);
  }
  assert.equal((await api.inject({ method: 'POST', url, token: admin,
    body: { ...command, expectedAssigneeId: null } })).status, 409);
  assert.equal((await inspect()).ticket.assigneeId, original);

  const raced = await Promise.all([
    api.inject({ method: 'POST', url, token: admin, body: command }),
    peer.inject({ method: 'POST', url, token: peerToken, body: command }),
  ]);
  assert.deepEqual(raced.map(response => response.status).sort(), [200, 409]);
  const success = raced.find(response => response.status === 200)!;
  assert.equal(success.status, 200);
  assert.equal(success.data.changed, true);
  assert.equal(success.data.ticket.assigneeId, second);
  assert.equal(success.data.ticket.status, 'ASSIGNED_TO_IT');
  const after = await inspect();
  assert.equal(after.ticket.assigneeId, second);
  assert.equal(after.events.filter(row => row.eventType === 'TICKET_REASSIGNED').length, 1);
  assert.equal(after.audits.filter(row => row.action === 'TICKET_REASSIGNED').length, 1);
  assert.equal(after.notifications.filter(row => row.recipientId === second && row.ticketId === ticketId).length, 1);

  const stale = await api.inject({ method: 'POST', url, token: admin, body: command });
  assert.equal(stale.status, 409);
  const requesterDetail = await api.inject({ method: 'GET', url: detailUrl, token: owner });
  assert.equal(requesterDetail.status, 200);
  assert.equal(requesterDetail.data.assignment, undefined);
  assert.deepEqual(requesterDetail.data.events.find((event: { eventType: string }) =>
    event.eventType === 'TICKET_REASSIGNED').metadata, {});
  assert.doesNotMatch(JSON.stringify([after, success, raced, requesterDetail]), /SYNTHETIC|redaction probe/);
  assert.match(String(after.events.find(event => event.eventType === 'TICKET_REASSIGNED')!.metadata.reason), /REDACTED_SECRET/);
  const secondToken = await signIn(api, 'day7-second-it@example.test');
  const page = async (token: string) => (await api.inject({
    method: 'GET', url: '/api/tickets?assignedToMe=true', token,
  })).data;
  assert.ok((await page(secondToken)).items.some((ticket: { id: string }) => ticket.id === ticketId));
  assert.ok(!(await page(admin)).items.some((ticket: { id: string }) => ticket.id === ticketId));

  const current = await assignmentCommand(api, admin);
  const noChange = await api.inject({ method: 'POST', url, token: admin, body: current });
  assert.equal(noChange.status, 200);
  assert.equal(noChange.data.changed, false);
  const finalState = await inspect();
  assert.equal(finalState.events.filter(row => row.eventType === 'TICKET_REASSIGNED').length, 1);
  assert.equal(finalState.notifications.filter(row => row.recipientId === second && row.ticketId === ticketId).length, 1);

  const restore = await api.inject({ method: 'POST', url, token: admin, body: { ...current, assigneeId: original } });
  assert.equal(restore.status, 200);
  assert.equal(restore.data.ticket.assigneeId, original);
  const aba = await api.inject({ method: 'POST', url, token: admin, body: command });
  assert.equal(aba.status, 409);
  assert.equal(aba.data.error.code, 'ASSIGNMENT_CONFLICT');
  assert.equal((await inspect()).ticket.assigneeId, original);

  const escalated = await api.inject({ method: 'POST', url: '/api/tickets/ticket-seed-1003/assign',
    token: admin, body: { ...command, expectedAssigneeId: original } });
  assert.equal(escalated.status, 409);
  assert.equal(escalated.data.error.code, 'ASSIGNMENT_STATE_CONFLICT');

  const unownedUrl = '/api/tickets/ticket-seed-1001';
  const unowned = await api.inject({ method: 'GET', url: unownedUrl, token: admin });
  assert.equal(unowned.data.ticket.assigneeId, null);
  const assigned = await api.inject({ method: 'POST', url: unownedUrl + '/assign', token: admin,
    body: { ...command, expectedAssigneeId: null, expectedRevision: unowned.data.assignment.revision } });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.data.ticket.assigneeId, second);
}

test('Day 7 JSON assignment: role, active assignee, audit, intent and stale-write checks', async () => {
  Object.assign(process.env, dev);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aiit-day7-json-'));
  try {
    const state = assignmentFixture();
    const file = path.join(directory, 'database.json');
    fs.writeFileSync(file, JSON.stringify(state));
    const app = createApiServer(file);
    const adminToken = await signIn(app, 'it@example.test');
    const command = await assignmentCommand(app, adminToken);
    const preserved = structuredClone(app.store.getState());
    const enqueue = app.queueProcessor.enqueueNotification.bind(app.queueProcessor);
    app.queueProcessor.enqueueNotification = async () => { throw new Error('synthetic outbox failure'); };
    const failed = await app.inject({ method: 'POST', url, token: adminToken,
      body: command });
    assert.equal(failed.status, 500);
    assert.deepEqual(app.store.getState(), preserved, 'JSON notification failure rolls back all writes');
    app.queueProcessor.enqueueNotification = enqueue;
    await verifyAssignment(app, async () => {
      const state = JSON.parse(fs.readFileSync(file, 'utf8')) as ReturnType<typeof runtimeFixture>;
      return { ticket: state.tickets.find(row => row.id === ticketId)!,
        events: state.ticketEvents.filter(row => row.ticketId === ticketId),
        audits: state.auditLogs.filter(row => row.resourceId === ticketId),
        notifications: state.notifications };
    }, createApiServer(file));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Day 7 PostgreSQL assignment has durable state, audit and outbox parity',
  { timeout: 120000, skip: process.env.DB_REQUIRED === 'true' ? false :
    (!postgresBinaries() ? 'Disposable PostgreSQL unavailable' : false) },
  async t => {
    Object.assign(process.env, dev);
    const cluster = await disposablePostgres();
    const client = await connectPostgres({ ...dev, STORAGE_MODE: 'postgres', DATABASE_URL: cluster.url });
    t.after(async () => { await client.$disconnect(); cluster.close(); });
    await importJsonSnapshot(client, assignmentFixture());
    const app = await createPostgresApiServer(client);
    const adminToken = await signIn(app, 'it@example.test');
    const command = await assignmentCommand(app, adminToken);
    const before = await Promise.all([
      client.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
      client.ticketEvent.count({ where: { ticketId } }),
      client.auditLog.count({ where: { resourceId: ticketId } }),
      client.notificationJob.count({ where: { notification: { ticketId } } }),
    ]);
    await client.$executeRawUnsafe(
      'CREATE FUNCTION reject_assignment_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'synthetic job failure\'; END; $$',
    );
    await client.$executeRawUnsafe(
      'CREATE TRIGGER reject_assignment_job BEFORE INSERT ON "NotificationJob" FOR EACH ROW EXECUTE FUNCTION reject_assignment_job()',
    );
    const failed = await app.inject({ method: 'POST', url, token: adminToken, body: command });
    assert.equal(failed.status, 503);
    assert.doesNotMatch(JSON.stringify(failed.data), /synthetic job failure/);
    await client.$executeRawUnsafe('DROP TRIGGER reject_assignment_job ON "NotificationJob"');
    assert.deepEqual(await Promise.all([
      client.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
      client.ticketEvent.count({ where: { ticketId } }),
      client.auditLog.count({ where: { resourceId: ticketId } }),
      client.notificationJob.count({ where: { notification: { ticketId } } }),
    ]), before, 'PostgreSQL outbox failure rolls back ownership, event, audit and job');
    const peer = await createPostgresApiServer(client);
    await verifyAssignment(app, async () => ({
      ticket: await client.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
      events: (await client.ticketEvent.findMany({ where: { ticketId } })).map(e => ({
        eventType: e.eventType, metadata: e.metadata as Record<string, unknown>,
      })),
      audits: await client.auditLog.findMany({ where: { resourceId: ticketId } }),
      notifications: await client.notification.findMany({ where: { ticketId } }),
    }), peer);
    assert.equal(await client.notificationJob.count({ where: { notification: { ticketId, recipientId: second } } }), 1);
  });
