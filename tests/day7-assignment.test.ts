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
}>) {
  const admin = await signIn(api, 'it@example.test');
  const employee = await signIn(api, 'second-employee@example.test');
  const customer = await signIn(api, 'customer@example.test');
  const cto = await signIn(api, 'cto@example.test');
  const command = { assigneeId: second, expectedAssigneeId: original, reason: 'Day 7 synthetic reassignment' };
  for (const token of [employee, customer, cto]) {
    const denied = await api.inject({ method: 'POST', url, token, body: command });
    assert.equal(denied.status, 403);
  }
  for (const payload of [
    { ...command, assigneeId: 'missing' },
    { ...command, assigneeId: 'user-emp-tawsif' },
    { ...command, assigneeId: 'user-cto-farhana' },
  ]) {
    assert.equal((await api.inject({ method: 'POST', url, token: admin, body: payload })).status, 400);
  }
  for (const payload of [
    { assigneeId: second, reason: command.reason },
    { ...command, expectedAssigneeId: null },
    { ...command, reason: 'short' },
  ]) {
    const response = await api.inject({ method: 'POST', url, token: admin, body: payload });
    assert.ok([400, 409].includes(response.status));
  }
  assert.equal((await inspect()).ticket.assigneeId, original);

  const success = await api.inject({ method: 'POST', url, token: admin, body: command });
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
  const noChange = await api.inject({ method: 'POST', url, token: admin, body: {
    ...command, expectedAssigneeId: second,
  } });
  assert.equal(noChange.status, 200);
  assert.equal(noChange.data.changed, false);
  const finalState = await inspect();
  assert.equal(finalState.events.filter(row => row.eventType === 'TICKET_REASSIGNED').length, 1);
  assert.equal(finalState.notifications.filter(row => row.recipientId === second && row.ticketId === ticketId).length, 1);

  const escalated = await api.inject({ method: 'POST', url: '/api/tickets/ticket-seed-1003/assign',
    token: admin, body: { ...command, expectedAssigneeId: original } });
  assert.equal(escalated.status, 409);
}

test('Day 7 JSON assignment: role, active assignee, audit, intent and stale-write checks', async () => {
  Object.assign(process.env, dev);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aiit-day7-json-'));
  try {
    const state = runtimeFixture();
    const secondAdmin = { ...state.users.find(user => user.id === original)!,
      id: second, email: 'day7-second-it@example.test', displayName: 'Day 7 Second IT',
      oidcSubject: '' };
    state.users.push(secondAdmin);
    const file = path.join(directory, 'database.json');
    fs.writeFileSync(file, JSON.stringify(state));
    const app = createApiServer(file);
    const adminToken = await signIn(app, 'it@example.test');
    const preserved = structuredClone(app.store.getState());
    const enqueue = app.queueProcessor.enqueueNotification.bind(app.queueProcessor);
    app.queueProcessor.enqueueNotification = async () => { throw new Error('synthetic outbox failure'); };
    const failed = await app.inject({ method: 'POST', url, token: adminToken,
      body: { assigneeId: second, expectedAssigneeId: original, reason: 'Synthetic atomicity failure' } });
    assert.equal(failed.status, 500);
    assert.deepEqual(app.store.getState(), preserved, 'JSON notification failure rolls back all writes');
    app.queueProcessor.enqueueNotification = enqueue;
    await verifyAssignment(app, async () => {
      const state = app.store.getState();
      return { ticket: state.tickets.find(row => row.id === ticketId)!,
        events: state.ticketEvents.filter(row => row.ticketId === ticketId),
        audits: state.auditLogs.filter(row => row.resourceId === ticketId),
        notifications: state.notifications };
    });
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
    const fixture = runtimeFixture();
    fixture.users.push({ ...fixture.users.find(row => row.id === original)!,
      id: second, email: 'day7-second-it@example.test', displayName: 'Day 7 Second IT', oidcSubject: '' });
    await importJsonSnapshot(client, fixture);
    const app = await createPostgresApiServer(client);
    const adminToken = await signIn(app, 'it@example.test');
    const before = await Promise.all([
      client.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
      client.ticketEvent.count({ where: { ticketId } }),
      client.auditLog.count({ where: { resourceId: ticketId } }),
      client.notificationJob.count({ where: { notification: { ticketId } } }),
    ]);
    const enqueue = app.queueProcessor.enqueueNotification.bind(app.queueProcessor);
    app.queueProcessor.enqueueNotification = async () => { throw new Error('synthetic outbox failure'); };
    const failed = await app.inject({ method: 'POST', url, token: adminToken,
      body: { assigneeId: second, expectedAssigneeId: original, reason: 'Synthetic atomicity failure' } });
    assert.equal(failed.status, 500);
    assert.deepEqual(await Promise.all([
      client.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
      client.ticketEvent.count({ where: { ticketId } }),
      client.auditLog.count({ where: { resourceId: ticketId } }),
      client.notificationJob.count({ where: { notification: { ticketId } } }),
    ]), before, 'PostgreSQL outbox failure rolls back ownership, event, audit and job');
    app.queueProcessor.enqueueNotification = enqueue;
    await verifyAssignment(app, async () => ({
      ticket: await client.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
      events: (await client.ticketEvent.findMany({ where: { ticketId } })).map(e => ({
        eventType: e.eventType, metadata: e.metadata as Record<string, unknown>,
      })),
      audits: await client.auditLog.findMany({ where: { resourceId: ticketId } }),
      notifications: await client.notification.findMany({ where: { ticketId } }),
    }));
    assert.equal(await client.notificationJob.count({ where: { notification: { ticketId, recipientId: second } } }), 1);
  });
