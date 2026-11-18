import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import https from 'node:https';
import type { IncomingHttpHeaders, OutgoingHttpHeaders, Server } from 'node:http';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { connectPostgres } from '../apps/api/src/postgres-runtime.ts';
import { createWebServer } from '../apps/web/src/server.ts';
import { createRehearsalSmtp } from '../apps/worker/src/rehearsal-smtp.ts';
import { NotificationWorker } from '../apps/worker/src/notification-worker.ts';
import { importJsonSnapshot } from '../scripts/json-import.ts';
import { startApiProcess } from './support/api-process.ts';
import { disposablePostgres, postgresBinaries, runtimeFixture } from './support/disposable-postgres.ts';
import { startTestIssuer } from './support/oidc-issuer.ts';
import { proxyTokenHeader } from '../packages/shared/src/ingress.ts';
import { createRehearsalEdge, listenOnLoopback, rehearsalCertificate, startRehearsalSink } from './support/staging-transport.ts';

const skip = process.env.DB_REQUIRED !== 'true' && !postgresBinaries() ? 'Disposable PostgreSQL unavailable' : false;

function closeHttp(server: Server | https.Server) {
  return new Promise<void>(resolve => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

async function replayWorker(env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, ['apps/worker/src/main.ts'], {
    env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.resume();
  const exit = once(child, 'exit');
  try {
    for (let i = 0; i < 400 && !output.includes('WORKER_READY') && child.exitCode === null; i++) await delay(25);
    assert.match(output, /"event":"WORKER_READY".*"transport":"rehearsal-loopback-smtp"/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exit;
  }
}

test('controlled staging rehearsal crosses authenticated TLS ingress, OIDC, PostgreSQL and SMTP', { timeout: 120000, skip }, async t => {
  const cluster = await disposablePostgres();
  t.after(() => cluster.close());
  const issuer = await startTestIssuer();
  t.after(() => issuer.close());
  const certificate = rehearsalCertificate(cluster.dir);
  const unrelated = rehearsalCertificate(mkdtempSync(cluster.dir + '/unrelated-ca-'));
  const smtp = await startRehearsalSink(certificate);
  t.after(() => smtp.close());
  const edgeToken = randomBytes(32).toString('hex');
  const apiToken = randomBytes(32).toString('hex');
  let webPort = 0;
  const edge = createRehearsalEdge(certificate, edgeToken, () => webPort);
  const origin = 'https://127.0.0.1:' + await listenOnLoopback(edge);
  t.after(() => closeHttp(edge));

  const env = {
    NODE_ENV: 'test', STORAGE_MODE: 'postgres', DATABASE_URL: cluster.url, MAIL_PROVIDER: 'mock',
    AUTH_MODE: 'oidc', APP_PUBLIC_URL: origin, OIDC_ISSUER_URL: issuer.issuer, OIDC_CLIENT_ID: 'aiit-rehearsal',
    OIDC_CLIENT_SECRET: undefined, OIDC_ALLOW_INSECURE_LOOPBACK: 'true',
    API_TRUSTED_PROXY_IPS: '127.0.0.1', API_PROXY_TOKEN: apiToken, API_PUBLIC_ORIGIN: origin,
    AIIT_REHEARSAL_SMTP_PORT: String(smtp.port), AIIT_REHEARSAL_SMTP_CA: certificate.caFile,
  };
  const client = await connectPostgres(env);
  t.after(() => client.$disconnect());
  const fixture = runtimeFixture();
  const employee = fixture.users.find(user => user.roleName === 'EMPLOYEE')!;
  const disabled = fixture.users.find(user => user.roleName === 'EMPLOYEE' && user.id !== employee.id)!;
  disabled.isActive = false;
  fixture.users.push({ ...employee, id: 'staging-service', email: 'service@example.test', oidcSubject: 'staging-service',
    roleName: 'SYSTEM_SERVICE', roleId: 'role-system' });
  for (const user of fixture.users) user.oidcIssuer = issuer.issuer;
  fixture.notifications = [];
  await importJsonSnapshot(client, fixture);
  const api = await startApiProcess(env);
  t.after(() => api.close());

  const webEnv = { APP_PUBLIC_URL: origin, WEB_TRUSTED_PROXY_IPS: '127.0.0.1', WEB_PROXY_TOKEN: edgeToken, WEB_API_PROXY_TOKEN: apiToken };
  const previous = Object.fromEntries(Object.keys(webEnv).map(key => [key, process.env[key]]));
  Object.assign(process.env, webEnv);
  let web: ReturnType<typeof createWebServer>;
  try { web = createWebServer(api.url); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  webPort = await listenOnLoopback(web);
  t.after(() => closeHttp(web));

  const request = (target: string, headers: OutgoingHttpHeaders = {}, payload?: object) => {
    const url = new URL(target, origin);
    assert.equal(url.origin, origin);
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    if (body) headers = { ...headers, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) };
    return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
      const req = https.request(url, { ca: certificate.cert, headers, method: body ? 'POST' : 'GET', timeout: 5000 }, async res => {
        try {
          let text = '';
          for await (const chunk of res) text += chunk;
          resolve({ status: res.statusCode!, headers: res.headers, body: text });
        } catch (error) { reject(error); }
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Rehearsal request timed out')));
      req.end(body);
    });
  };

  const signIn = async (subject: string) => {
    issuer.setSubject(subject);
    const start = await request('/api/auth/oidc/login');
    assert.equal(start.status, 302);
    const authorize = new URL(start.headers.location!);
    assert.equal(authorize.origin, issuer.issuer);
    const authorized = await fetch(authorize, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    assert.equal(authorized.status, 302);
    const flow = start.headers['set-cookie']![0].split(';')[0];
    const result = await request(authorized.headers.get('location')!, { cookie: flow });
    const cookie = result.headers['set-cookie']?.find(value => value.startsWith('itsupport_session='));
    return { status: result.status, cookie: cookie?.split(';')[0], cookieHeader: cookie };
  };

  const ready = await request('/api/ready', { 'x-forwarded-for': 'invalid-forwarded-address', [proxyTokenHeader]: 'forged' });
  assert.equal(ready.status, 200);
  assert.equal(JSON.parse(ready.body).storageMode, 'postgres');
  assert.equal((await request('/api/live')).status, 200);
  const portal = await request('/app');
  assert.equal(portal.status, 200);
  assert.equal(portal.headers['strict-transport-security'], 'max-age=300');
  assert.match(String(portal.headers['content-security-policy']), /frame-ancestors 'none'/);
  const forwarded = { 'x-forwarded-for': 'invalid-forwarded-address' };
  assert.equal((await fetch(api.url + '/api/ready', { headers: { ...forwarded, [proxyTokenHeader]: 'forged' } })).status, 200);
  assert.equal((await fetch(api.url + '/api/ready', { headers: { ...forwarded, [proxyTokenHeader]: apiToken } })).status, 400);

  for (const role of ['CUSTOMER', 'EMPLOYEE', 'IT_ADMIN', 'CTO'] as const) {
    const user = fixture.users.find(row => row.roleName === role)!;
    const auth = await signIn(user.oidcSubject);
    assert.equal(auth.status, 303);
    assert.match(auth.cookieHeader!, /;\s*Secure/i);
    const session = await request('/api/auth/me', { cookie: auth.cookie });
    const { user: current, csrfToken } = JSON.parse(session.body);
    assert.equal(current.roleName, role);
    assert.equal(current.sbuId, user.sbuId);
    assert.equal((await request('/api/tickets', { cookie: auth.cookie })).status, 200);
    assert.equal((await request('/api/tickets/ticket-seed-1002', { cookie: auth.cookie })).status,
      role === 'CUSTOMER' || role === 'EMPLOYEE' ? 403 : 200);
    if (role === 'EMPLOYEE') {
      const payload = {
        title: 'Rehearsal Outlook TLS support',
        description: 'Synthetic device needs assistance with Outlook configuration',
        serviceCategoryId: 'cat-outlook-config', customFormPayload: { osPlatform: 'macOS' },
      };
      const credentials = { cookie: auth.cookie, origin, 'x-csrf-token': csrfToken };
      assert.equal((await request('/api/tickets', { ...credentials, origin: 'https://untrusted.example.test' }, payload)).status, 403);
      assert.equal((await request('/api/tickets', { ...credentials, 'x-csrf-token': 'invalid' }, payload)).status, 403);
      assert.equal((await request('/api/tickets', credentials, payload)).status, 201);
      assert.equal((await request('/api/auth/logout', credentials, {})).status, 200);
      assert.equal((await request('/api/auth/me', { cookie: auth.cookie })).status, 401);
    }
    if (role === 'CTO') {
      await client.authSession.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1) } });
      assert.equal((await request('/api/auth/me', { cookie: auth.cookie })).status, 401);
    }
  }
  for (const user of [disabled, fixture.users.find(row => row.roleName === 'SYSTEM_SERVICE')!]) {
    assert.equal((await signIn(user.oidcSubject)).cookie, undefined);
  }
  issuer.setMode('bad-signature');
  assert.equal((await signIn(employee.oidcSubject)).cookie, undefined);
  assert.ok(issuer.stats().jwksRequests > 0);

  const transport = createRehearsalSmtp(env)!;
  assert.throws(() => createRehearsalSmtp({ ...env, NODE_ENV: 'production' }), /UNSAFE_CONFIG/);
  for (const to of ['external@outside.example', 'safe@example.test, external@outside.example', 'a@example.test\r\nBcc: x@example.test']) {
    assert.equal((await transport.sendEmail({ to, deliveryId: 'blocked', subject: 'blocked', textBody: 'blocked' })).delivered, false);
  }
  const untrustedTransport = createRehearsalSmtp({ ...env, AIIT_REHEARSAL_SMTP_CA: unrelated.caFile })!;
  assert.equal((await untrustedTransport.sendEmail({
    to: employee.email, deliveryId: 'wrong-trust-anchor', subject: 'blocked', textBody: 'blocked',
  })).delivered, false);
  assert.equal(smtp.received.length, 0);
  assert.equal(smtp.rejectedCount(), 0);
  const [job] = await client.notificationJob.findMany({ include: { notification: true } });
  assert.equal(await client.notificationJob.count(), 1);
  assert.equal(job.notification.recipientEmail, employee.email);
  smtp.rejectNextMessage();
  assert.equal(await new NotificationWorker(client, transport).runOnce(), true);
  const failed = await client.notificationJob.findUniqueOrThrow({ where: { id: job.id }, include: { notification: true } });
  assert.equal(smtp.rejectedCount(), 1);
  assert.equal(failed.state, 'QUEUED');
  assert.equal(failed.notification.sentAt, null);
  assert.equal(failed.lastError, 'DELIVERY_FAILED');
  assert.ok(failed.availableAt.getTime() > job.availableAt.getTime());

  await client.notificationJob.update({ where: { id: job.id }, data: { availableAt: new Date(0) } });
  await replayWorker(env);
  await replayWorker(env);
  const sent = await client.notificationJob.findUniqueOrThrow({ where: { id: job.id }, include: { notification: true } });
  assert.equal(sent.attempts, 2);
  assert.equal(sent.state, 'SENT');
  assert.equal(sent.notification.status, 'SENT');
  assert.ok(sent.notification.sentAt);
  assert.equal(await client.notificationJob.count(), 1);
  assert.equal(smtp.received.length, 1);
  assert.equal(smtp.received[0].recipient, employee.email);
  assert.match(smtp.received[0].data, new RegExp('Message-ID: <' + job.id + '@example\\.test>'));
  assert.doesNotMatch(smtp.received[0].data, /^(Cc|Bcc):/mi);
  issuer.setMode('valid');
  const restoredSession = await signIn(employee.oidcSubject);
  assert.ok(restoredSession.cookie);
  const started = performance.now();
  cluster.stop();
  assert.equal((await request('/api/live')).status, 200);
  assert.equal((await request('/api/ready')).status, 503);
  cluster.start();
  let readyStatus = 503;
  for (let i = 0; i < 25 && readyStatus !== 200; i++) {
    readyStatus = (await request('/api/ready')).status;
    if (readyStatus !== 200) await delay(100);
  }
  assert.equal(readyStatus, 200);
  const restartMs = Math.round(performance.now() - started);

  await client.$disconnect();
  const sourceCounts = await Promise.all([client.ticket.count(), client.ticketEvent.count(), client.auditLog.count(),
    client.authSession.count(), client.notification.count(), client.notificationJob.count()]);
  const restoreStarted = performance.now();
  const restoredEnv = { ...env, DATABASE_URL: cluster.restoreBackup(), AIIT_REHEARSAL_SMTP_PORT: undefined };
  const restored = await connectPostgres(restoredEnv);
  t.after(() => restored.$disconnect());
  assert.deepEqual(await Promise.all([restored.ticket.count(), restored.ticketEvent.count(), restored.auditLog.count(),
    restored.authSession.count(), restored.notification.count(), restored.notificationJob.count()]), sourceCounts);
  const restoredJob = await restored.notificationJob.findUniqueOrThrow({ where: { id: job.id }, include: { notification: true } });
  assert.deepEqual(restoredJob, sent);
  const restoredApi = await startApiProcess(restoredEnv);
  t.after(() => restoredApi.close());
  const restoredQueue = await fetch(restoredApi.url + '/api/tickets', {
    headers: { cookie: restoredSession.cookie, [proxyTokenHeader]: apiToken }, signal: AbortSignal.timeout(5000),
  });
  assert.equal(restoredQueue.status, 200);
  assert.ok((await restoredQueue.json()).items.some((item: { title: string }) => item.title === 'Rehearsal Outlook TLS support'));
  const restoreMs = Math.round(performance.now() - restoreStarted);
  t.diagnostic('REHEARSAL_RECOVERY ' + JSON.stringify({ restartMs, restoreMs, tickets: sourceCounts[0],
    ticketEvents: sourceCounts[1], auditEntries: sourceCounts[2], sessions: sourceCounts[3],
    notifications: sourceCounts[4], jobs: sourceCounts[5] }));
  t.diagnostic('Controlled rehearsal verified TLS ingress, identity, and one durable SMTP intent after a failed attempt and worker restart.');
});
