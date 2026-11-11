import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DevelopmentEmailTransport } from '../packages/connectors/src/index.ts';
import { createApiServer, type AppInstance } from '../apps/api/src/app.ts';
import type { RequestStore } from '../apps/api/src/store.ts';
import { connectPostgres, createPostgresApiServer, storageMode } from '../apps/api/src/postgres-runtime.ts';
import { PostgresOutbox } from '../apps/api/src/postgres-outbox.ts';
import { NotificationWorker } from '../apps/worker/src/notification-worker.ts';
import { importJsonSnapshot } from '../scripts/json-import.ts';
import { disposablePostgres, fixtureIdentities, postgresBinaries, runtimeFixture } from './support/disposable-postgres.ts';
import { oidcLogin, startOidcApplication } from './support/oidc-application.ts';

const dev = { NODE_ENV: 'test', AUTH_MODE: 'dev_oidc', MAIL_PROVIDER: 'mock' };
const config = { ...dev, STORAGE_MODE: 'postgres' };
const skipDatabase = process.env.DB_REQUIRED !== 'true' && !postgresBinaries()
  ? 'PostgreSQL initdb unavailable; use DB_REQUIRED=true to require this gate' : false;
const input = {
  title: 'Day 5 synthetic Outlook fixture',
  description: 'Configure Outlook TLS settings on an isolated device.',
  serviceCategoryId: 'cat-outlook-config',
  customFormPayload: { osPlatform: 'macOS' },
};
type API = Pick<AppInstance<RequestStore>, 'inject'>;

async function signIn(app: API, index: number) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', body: { email: fixtureIdentities[index].email } });
  assert.equal(response.status, 200);
  return response.data.token as string;
}

async function workflow(app: API) {
  const checks: Record<string, unknown> = {};
  async function check(key: string, method: string, url: string, status: number, token?: string, body?: Record<string, unknown>) {
    const response = await app.inject({ method, url, token, body });
    assert.equal(response.status, status, key);
    checks[key] = [status, Object.keys(response.data).sort(), response.data.error?.code ?? null];
    return response.data;
  }

  for (const route of ['live', 'ready', 'health', 'openapi.json', 'auth/config', 'auth/identities']) {
    await check(route, 'GET', '/api/' + route, 200);
  }
  await check('dev mode OIDC login', 'GET', '/api/auth/oidc/login', 503);
  await check('dev mode OIDC callback', 'GET', '/api/auth/oidc/callback', 503);
  await check('login invalid', 'POST', '/api/auth/login', 401, undefined, { email: 'missing@example.test' });
  const employee = await signIn(app, 0);
  const other = await signIn(app, 1);
  const customer = await signIn(app, 2);
  const it = await signIn(app, 3);
  const cto = await signIn(app, 4);

  const profile = await check('session profile', 'GET', '/api/auth/me', 200, employee);
  assert.equal(profile.user.roleName, 'EMPLOYEE');
  await check('unauthenticated', 'GET', '/api/tickets', 401);
  await check('catalog', 'GET', '/api/catalog', 200, employee);
  await check('KB search', 'GET', '/api/kb?search=Outlook', 200, employee);
  await check('invalid category fields', 'POST', '/api/tickets', 400, employee, { ...input, customFormPayload: {} });
  const { ticket, aiDecision } = await check('ticket creation', 'POST', '/api/tickets', 201, employee, input);
  assert.equal(ticket.status, 'RESOLVED_PENDING_CONFIRMATION');
  checks.triage = [ticket.status, ticket.severity, aiDecision.policyDecision, ticket.customFormPayload];
  const detail = '/api/tickets/' + ticket.id;
  const list = await check('filtered pagination', 'GET', '/api/tickets?search=Day%205&severity=LOW&pageSize=1', 200, employee);
  assert.equal(list.items[0].id, ticket.id);
  checks.pagination = list.pagination;
  await check('invalid pagination', 'GET', '/api/tickets?page=NaN', 400, employee);
  await check('cross-SBU deny', 'GET', detail, 403, other);
  await check('customer deny', 'GET', detail, 403, customer);
  await check('customer approvals deny', 'GET', '/api/approvals', 403, customer);
  await check('invalid comment', 'POST', detail + '/comments', 400, employee, { body: 'x' });
  await check('internal note', 'POST', detail + '/comments', 201, it, { body: 'Synthetic internal note', isInternal: true });
  const history = await check('ticket detail by number', 'GET', '/api/tickets/' + ticket.ticketNumber, 200, employee);
  assert.equal(history.comments.length, 0);
  checks.history = history.events.map((event: { eventType: string }) => event.eventType).sort();
  assert.equal(history.aiLogs.length, 1);
  await check('resolution confirmation', 'POST', detail + '/transition', 200, employee, { status: 'CLOSED' });
  const reopened = await check('reopen', 'POST', detail + '/transition', 200, employee, { status: 'REOPENED' });
  assert.equal(reopened.ticket.status, 'REOPENED');
  const routed = await check('create approval', 'POST', '/api/tickets', 201, employee, { ...input, serviceCategoryId: 'cat-ad-account', customFormPayload: { targetAdGroup: 'Synthetic', businessJustification: 'Synthetic approval' } });
  assert.equal(routed.ticket.assigneeId, runtimeFixture().users[3].id);
  const approvals = await check('approval list', 'GET', '/api/approvals', 200, it);
  const approval = approvals.items.find((row: { ticketId: string }) => row.ticketId === routed.ticket.id);
  assert.ok(approval);
  await check('approval decision', 'POST', '/api/approvals/' + approval.id + '/decide', 200, it, { decision: 'APPROVED', decisionNotes: 'Reviewed synthetic request' });
  await check('approval replay', 'POST', '/api/approvals/' + approval.id + '/decide', 409, it, { decision: 'REJECTED', decisionNotes: 'Replay' });
  await check('IT transition', 'POST', '/api/tickets/' + routed.ticket.id + '/transition', 200, it, { status: 'IN_PROGRESS' });
  await check('CTO escalation', 'POST', '/api/tickets/' + routed.ticket.id + '/escalate-cto', 200, it, { reason: 'Synthetic critical incident' });
  const notifications = await check('notifications', 'GET', '/api/notifications', 200, cto);
  const escalation = notifications.items.find((row: { recipientId: string; ticketId: string }) => row.ticketId === routed.ticket.id && row.recipientId === runtimeFixture().users[4].id);
  assert.ok(escalation);
  checks.escalation = [escalation.recipientEmail, escalation.channel];
  assert.equal(escalation.readAt, null);
  const readRoute = '/api/notifications/' + escalation.id + '/read';
  await check('notification recipient restriction', 'POST', readRoute, 404, it);
  const read = await check('mark notification read', 'POST', readRoute, 200, cto);
  const replayRead = await check('mark notification replay', 'POST', readRoute, 200, cto);
  assert.ok(read.notification.readAt);
  assert.equal(replayRead.notification.readAt, read.notification.readAt);
  const assets = await check('assets', 'GET', '/api/assets', 200, employee);
  const asset = assets.items.find((row: { status: string }) => row.status === 'HANDOVER_PENDING_ACK');
  assert.ok(asset);
  await check('custody scope', 'POST', '/api/assets/' + asset.id + '/acknowledge', 403, other, {});
  await check('custody acknowledgement', 'POST', '/api/assets/' + asset.id + '/acknowledge', 200, employee, {});
  await check('custody replay', 'POST', '/api/assets/' + asset.id + '/acknowledge', 200, employee, {});
  const analytics = await check('analytics', 'GET', '/api/analytics/summary', 200, employee);
  checks.analyticsCounts = analytics;
  const audits = await check('audit', 'GET', '/api/audit-logs', 200, cto);
  assert.ok(audits.items.some((row: { action: string }) => row.action === 'TICKET_ESCALATED_TO_CTO'));
  await check('audit deny', 'GET', '/api/audit-logs', 403, employee);
  await check('mock directory lookup', 'GET', '/api/connectors/ad/lookup?email=unknown@example.test', 200, it);
  await check('directory deny', 'GET', '/api/connectors/ad/lookup?email=unknown@example.test', 403, employee);
  await check('logout', 'POST', '/api/auth/logout', 200, employee);
  await check('revoked profile', 'GET', '/api/auth/me', 401, employee);
  return checks;
}

test('PostgreSQL explicit startup rejects missing, unavailable, production and unsupported mail configuration', async () => {
  assert.equal(storageMode({}), 'json');
  assert.equal(storageMode({ STORAGE_MODE: 'auto' }), 'json');
  assert.throws(() => storageMode({ STORAGE_MODE: 'postgres', NODE_ENV: 'production' }), /POSTGRES_REQUIRES_DEVELOPMENT_OR_TEST/);
  await assert.rejects(connectPostgres(config), /POSTGRES_DATABASE_URL_REQUIRED/);
  await assert.rejects(connectPostgres({ ...config, MAIL_PROVIDER: 'smtp' }), /MOCK_MAIL_REQUIRED/);
  const result = spawnSync(process.execPath, ['apps/api/src/main.ts'], {
    env: { ...process.env, ...config, DATABASE_URL: 'postgresql://aiit_test@127.0.0.1:1/aiit_test?connect_timeout=1' },
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /POSTGRES_UNAVAILABLE_OR_SCHEMA_NOT_READY/);
  assert.doesNotMatch(result.stderr, /postgresql:\/\//);
});

test('PostgreSQL HTTP runtime parity, rollback, concurrent numbering, worker and recovery', { timeout: 120000, skip: skipDatabase }, async t => {
  Object.assign(process.env, dev);
  const cluster = await disposablePostgres();
  const env = { ...config, DATABASE_URL: cluster.url };
  const client = await connectPostgres(env);
  t.after(async () => { await client.$disconnect(); cluster.close(); });
  const source = runtimeFixture();
  await importJsonSnapshot(client, source);
  const app = await createPostgresApiServer(client);

  await t.test('paired JSON and PostgreSQL HTTP journeys', async () => {
    const file = path.join(cluster.dir, 'parity.json');
    fs.writeFileSync(file, JSON.stringify(source));
    const expected = await workflow(createApiServer(file));
    const actual = await workflow(app);
    assert.deepEqual(actual, expected);
    t.diagnostic('DAY5_HTTP_PARITY ' + JSON.stringify(actual));
  });

  const employee = await signIn(app, 0);
  const admin = await signIn(app, 3);
  const restart = await createPostgresApiServer(client);
  assert.equal((await restart.inject({ method: 'GET', url: '/api/auth/me', token: employee })).status, 200);

  await t.test('API process restart restores and then enforces revocation of a development session', async () => {
    async function runProcess(run: (base: string) => Promise<void>) {
      const child = spawn(process.execPath, ['apps/api/src/main.ts'], {
        env: { ...process.env, ...env, API_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      const exit = once(child, 'exit');
      try {
        for (let i = 0; i < 100 && !output.includes('SERVER_LISTENING') && child.exitCode === null; i++) await delay(25);
        const event = output.split('\n').find(line => line.includes('SERVER_LISTENING'));
        assert.ok(event);
        const { port, storageMode } = JSON.parse(event);
        assert.equal(storageMode, 'postgres');
        await run('http://127.0.0.1:' + port);
      } finally {
        child.kill('SIGTERM');
        await exit;
      }
    }
    let token = '';
    await runProcess(async base => {
      const response = await fetch(base + '/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: fixtureIdentities[0].email }),
      });
      assert.equal(response.status, 200);
      token = (await response.json()).token;
    });
    const headers = { authorization: 'Bearer ' + token };
    await runProcess(async base => {
      assert.equal((await fetch(base + '/api/auth/me', { headers })).status, 200);
      assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers })).status, 200);
    });
    await runProcess(async base => {
      assert.equal((await fetch(base + '/api/auth/me', { headers })).status, 401);
    });
  });

  await t.test('zero or multiple eligible CTOs block without creating an intent', async () => {
    const ticket = await app.inject({ method: 'POST', url: '/api/tickets', token: employee, body: { ...input, severity: 'HIGH' } });
    assert.equal(ticket.status, 201);
    const id = ticket.data.ticket.id;
    const url = '/api/tickets/' + id + '/escalate-cto';
    const body = { reason: 'Synthetic escalation policy verification' };
    const cto = await client.user.findUniqueOrThrow({ where: { id: source.users[4].id } });
    const before = await client.notificationJob.count();
    await client.user.update({ where: { id: cto.id }, data: { isActive: false } });
    assert.equal((await app.inject({ method: 'POST', url, token: admin, body })).status, 409);
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', body: { email: cto.email } })).status, 401);
    await client.user.update({ where: { id: cto.id }, data: { isActive: true } });
    await client.user.create({ data: { ...cto, id: 'day5-extra-cto', email: 'extra-cto@example.test', oidcSubject: null } });
    assert.equal((await app.inject({ method: 'POST', url, token: admin, body })).status, 409);
    await client.user.update({ where: { id: 'day5-extra-cto' }, data: { isActive: false } });
    assert.equal(await client.notificationJob.count(), before);
    assert.equal((await client.ticket.findUniqueOrThrow({ where: { id } })).status, 'ASSIGNED_TO_IT');
  });

  await t.test('two API instances allocate unique numbers with retryable conflicts and bounded pagination', async () => {
    const independentClient = await connectPostgres(env);
    const independentApp = await createPostgresApiServer(independentClient);
    t.after(() => independentClient.$disconnect());
    const start = performance.now();
    let conflicts = 0;
    const responses = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
      for (let attempt = 0; attempt < 12; attempt++) {
        const response = await (index % 2 ? independentApp : app).inject({ method: 'POST', url: '/api/tickets', token: employee, body: input });
        if (response.status !== 409) return response;
        conflicts++;
      }
      throw new Error('Ticket retry budget exhausted');
    }));
    assert.ok(responses.every(response => response.status === 201));
    assert.equal(new Set(responses.map(response => response.data.ticket.ticketNumber)).size, 8);
    const elapsed = performance.now() - start;
    async function samples(url: string) {
      const times: number[] = [];
      for (let i = 0; i < 25; i++) {
        const at = performance.now();
        const response = await app.inject({ method: 'GET', url, token: employee });
        assert.equal(response.status, 200);
        if (url.startsWith('/api/tickets')) assert.equal(response.data.items.length, 3);
        times.push(performance.now() - at);
      }
      times.sort((a, b) => a - b);
      return { median: times[12], p95: times[23] };
    }
    const [pool] = await client.$queryRaw<{ connections: number }[]>`
      SELECT count(*)::int AS connections FROM pg_stat_activity WHERE datname = current_database()`;
    t.diagnostic('DAY5_PERFORMANCE ' + JSON.stringify({
      connectionsObserved: pool.connections,
      postgres: cluster.version, node: process.version, platform: process.platform, arch: process.arch,
      ticketCount: await client.ticket.count(), createEightMs: elapsed, conflicts,
      listMs: await samples('/api/tickets?pageSize=3'), sessionMs: await samples('/api/auth/me'),
    }));
  });

  await t.test('connection loss inside business write rolls back ticket, history, audit and outbox', async () => {
    const counts = () => Promise.all([client.ticket.count(), client.ticketEvent.count(), client.auditLog.count(), client.notificationJob.count()]);
    const before = await counts();
    await client.$executeRawUnsafe(`CREATE FUNCTION day5_break_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_terminate_backend(pg_backend_pid()); RETURN NEW; END $$`);
    await client.$executeRawUnsafe('CREATE TRIGGER day5_break_write BEFORE INSERT ON "NotificationJob" FOR EACH ROW EXECUTE FUNCTION day5_break_write()');
    try {
      const result = await app.inject({ method: 'POST', url: '/api/tickets', token: employee, body: input });
      assert.equal(result.status, 503);
      assert.equal(result.data.error.code, 'PERSISTENCE_FAILURE');
      assert.deepEqual(await counts(), before);
    } finally {
      await client.$executeRawUnsafe('DROP TRIGGER day5_break_write ON "NotificationJob"');
    }
    cluster.stop();
    assert.equal((await app.inject({ method: 'GET', url: '/api/live' })).status, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/ready' })).status, 503);
    cluster.start();
    let ready = 503;
    for (let attempt = 0; attempt < 20 && ready === 503; attempt++) {
      ready = (await app.inject({ method: 'GET', url: '/api/ready' })).status;
      if (ready === 503) await delay(50);
    }
    assert.equal(ready, 200);
  });

  await t.test('worker claims exclusively, recovers expired leases, retries and persists mock results', async () => {
    const outbox = new PostgresOutbox(client);
    const [first, second] = await Promise.all([outbox.claim(1000), outbox.claim(1000)]);
    assert.ok(first && second);
    assert.notEqual(first.id, second.id);
    await client.notificationJob.update({ where: { id: first.id }, data: { leaseUntil: new Date(0), availableAt: new Date(0) } });
    const recovered = await outbox.claim();
    assert.equal(recovered?.id, first.id);
    assert.equal(recovered.attempts, first.attempts + 1);
    await assert.rejects(outbox.complete(first.id, first.leaseToken!), /LEASE_LOST/);
    await outbox.retry(recovered.id, recovered.leaseToken!);
    await outbox.complete(second.id, second.leaseToken!);

    const mock = new DevelopmentEmailTransport({ mode: 'mock', smtpHost: 'localhost', smtpPort: 1025, fromAddress: 'fixture@example.test' });
    const worker = new NotificationWorker(client, mock);
    await client.notificationJob.update({ where: { id: first.id }, data: { availableAt: new Date(0) } });
    mock.setSimulateFailure(true);
    assert.equal(await worker.runOnce(), true);
    assert.equal((await client.notificationJob.findUniqueOrThrow({ where: { id: first.id } })).lastError, 'DELIVERY_FAILED');
    await client.notificationJob.update({ where: { id: first.id }, data: { availableAt: new Date(0), maxAttempts: first.attempts + 3 } });
    assert.equal(await worker.runOnce(), true);
    assert.equal((await client.notificationJob.findUniqueOrThrow({ where: { id: first.id } })).state, 'FAILED');

    mock.setSimulateFailure(false);
    const start = performance.now();
    let processed = 0;
    while (await worker.runOnce()) processed++;
    const sent = await client.notification.findMany({ where: { status: 'SENT', job: { isNot: null } } });
    const delivered = mock.getDeliveredMessages();
    assert.equal(delivered.length, processed);
    assert.ok(delivered.every(message => sent.some(row => row.id === message.deliveryId && row.recipientEmail === message.to && row.channel === 'EMAIL_AND_IN_APP')));
    t.diagnostic('DAY5_WORKER ' + JSON.stringify({ processed, durationMs: performance.now() - start }));

    const pending = await app.inject({ method: 'POST', url: '/api/tickets', token: employee, body: input });
    assert.equal(pending.status, 201);
    const processWorker = async () => {
      const child = spawn(process.execPath, ['apps/worker/src/main.ts'], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      const exit = once(child, 'exit');
      try {
        for (let i = 0; i < 100 && !output.includes('WORKER_READY') && child.exitCode === null; i++) await delay(25);
        assert.match(output, /WORKER_READY/);
      } finally {
        child.kill('SIGTERM');
        await exit;
      }
    };
    await processWorker();
    await processWorker();
    const job = await client.notificationJob.findFirstOrThrow({ where: { notification: { ticketId: pending.data.ticket.id } } });
    assert.equal(job.state, 'SENT');
    assert.equal(job.attempts, 1);
  });

  await t.test('SIGKILL after claim leaves a recoverable job for a new worker', async () => {
    const pending = await app.inject({ method: 'POST', url: '/api/tickets', token: employee, body: input });
    assert.equal(pending.status, 201);
    const job = await client.notificationJob.findFirstOrThrow({ where: { notification: { ticketId: pending.data.ticket.id } } });
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      import { connectPostgres } from './apps/api/src/postgres-runtime.ts';
      import { NotificationWorker } from './apps/worker/src/notification-worker.ts';
      const client = await connectPostgres();
      const worker = new NotificationWorker(client, {
        async sendEmail() {
          console.log('DELIVERY_STARTED');
          await new Promise(() => setInterval(() => {}, 1000));
        },
      });
      await worker.runOnce();
    `], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    const exit = once(child, 'exit');
    try {
      for (let i = 0; i < 100 && !output.includes('DELIVERY_STARTED') && child.exitCode === null; i++) await delay(25);
      assert.match(output, /DELIVERY_STARTED/);
    } finally {
      child.kill('SIGKILL');
      await exit;
    }
    const interrupted = await client.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(interrupted.state, 'PROCESSING');
    assert.equal(interrupted.attempts, 1);
    await client.notificationJob.update({ where: { id: job.id }, data: { leaseUntil: new Date(0) } });
    const mock = new DevelopmentEmailTransport({ mode: 'mock', smtpHost: 'localhost', smtpPort: 1025, fromAddress: 'fixture@example.test' });
    assert.equal(await new NotificationWorker(client, mock).runOnce(), true);
    const recovered = await client.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(recovered.state, 'SENT');
    assert.equal(recovered.attempts, 2);
    assert.equal(mock.getDeliveredMessages()[0].deliveryId, job.id);
  });

  await t.test('backup and restore preserve the exercised HTTP dataset and its relationships', async () => {
    const restored = await connectPostgres({ ...env, DATABASE_URL: cluster.restoreBackup() });
    try {
      const inspect = async (db: PrismaClient) => ({
        tickets: await db.ticket.findMany({
          orderBy: { id: 'asc' },
          select: {
            id: true, ticketNumber: true, status: true, version: true,
            requester: { select: { id: true, sbuId: true } },
            _count: { select: { events: true, comments: true, aiActionLogs: true, approvals: true } },
          },
        }),
        jobs: await db.notificationJob.findMany({
          orderBy: { id: 'asc' },
          select: { id: true, state: true, attempts: true, notification: { select: { recipientId: true, ticketId: true, readAt: true } } },
        }),
        auditCount: await db.auditLog.count(),
        sessions: await db.authSession.count(),
      });
      const actual = await inspect(restored);
      assert.deepEqual(actual, await inspect(client));
      t.diagnostic('DAY5_RUNTIME_RESTORE ' + JSON.stringify({
        ticketCount: actual.tickets.length, jobCount: actual.jobs.length,
        auditCount: actual.auditCount, sessionCount: actual.sessions, relationshipsMatched: true,
      }));
    } finally {
      await restored.$disconnect();
    }
  });
});

test('PostgreSQL OIDC persists digest sessions, revokes and rolls back login audit failures', { timeout: 60000, skip: skipDatabase }, async t => {
  const cluster = await disposablePostgres();
  const env = { ...config, DATABASE_URL: cluster.url };
  const client = await connectPostgres(env);
  t.after(async () => { await client.$disconnect(); cluster.close(); });
  const fixture = await startOidcApplication(client);
  try {
    const first = await oidcLogin(fixture);
    assert.equal(first.response.status, 303);
    const replay = await fetch(first.callback, { redirect: 'manual', headers: { cookie: first.flow } });
    assert.equal(replay.status, 400);
    assert.match(first.cookie, /^itsupport_session=[\w-]{43}$/);
    const second = await oidcLogin(fixture);
    assert.equal(second.response.status, 303);
    const sessions = await client.authSession.findMany();
    assert.equal(sessions.length, 2);
    assert.ok(sessions.every(row => /^[a-f0-9]{64}$/.test(row.id) && row.kind === 'oidc'));
    assert.ok(!JSON.stringify(sessions).includes(first.cookie.split('=')[1]));
    const restartedClient = await connectPostgres(env);
    try {
      const restart = await createPostgresApiServer(restartedClient);
      const headers = { cookie: first.cookie };
      const me = await restart.inject({ method: 'GET', url: '/api/auth/me', headers });
      assert.equal(me.status, 200);
      assert.equal((await restart.inject({ method: 'POST', url: '/api/tickets', headers: { ...headers, origin: 'https://invalid.example.test' }, body: input })).status, 403);
      const csrf = await restart.inject({ method: 'POST', url: '/api/tickets', headers: { ...headers, origin: fixture.publicUrl }, body: input });
      assert.equal(csrf.data.error.code, 'CSRF_DENIED');
      const logout = await restart.inject({ method: 'POST', url: '/api/auth/logout', headers: { ...headers, origin: fixture.publicUrl, 'x-csrf-token': me.data.csrfToken } });
      assert.equal(logout.status, 200);
      const newApp = await createPostgresApiServer(client);
      assert.equal((await newApp.inject({ method: 'GET', url: '/api/auth/me', headers })).status, 401);
      assert.equal((await newApp.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: second.cookie } })).status, 200);

      await client.$executeRawUnsafe(`CREATE FUNCTION day5_reject_login_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'TEST_AUDIT_FAILURE'; END $$`);
      await client.$executeRawUnsafe('CREATE TRIGGER day5_reject_login_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION day5_reject_login_audit()');
      const rejected = await oidcLogin(fixture, second.cookie);
      assert.equal(rejected.response.status, 503);
      assert.equal(rejected.cookie, '');
      assert.equal(await client.authSession.count(), 1);
      await client.$executeRawUnsafe('DROP TRIGGER day5_reject_login_audit ON "AuditLog"');

      const userId = sessions[0].userId;
      await client.user.update({ where: { id: userId }, data: { isActive: false } });
      await client.user.update({ where: { id: userId }, data: { isActive: true } });
      assert.equal((await newApp.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: second.cookie } })).status, 401);
      const fresh = await oidcLogin(fixture);
      assert.equal(fresh.response.status, 303);
      await fixture.expireSessions();
      assert.equal((await newApp.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: fresh.cookie } })).status, 401);
    } finally {
      await restartedClient.$disconnect();
    }
  } finally {
    await fixture.close();
  }
});
