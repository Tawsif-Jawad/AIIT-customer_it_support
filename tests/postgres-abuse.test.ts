import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectPostgres } from '../apps/api/src/postgres-runtime.ts';
import { importJsonSnapshot } from '../scripts/json-import.ts';
import { disposablePostgres, postgresBinaries, runtimeFixture } from './support/disposable-postgres.ts';
import { startApiProcess } from './support/api-process.ts';
import { startTestIssuer } from './support/oidc-issuer.ts';
import { cookieFrom } from './support/oidc-application.ts';

const skip = process.env.DB_REQUIRED !== 'true' && !postgresBinaries() ? 'Disposable PostgreSQL binaries unavailable' : false;

test('shared PostgreSQL budgets and one-time OIDC state across independent API processes', { timeout: 35000, skip }, async t => {
  const cluster = await disposablePostgres();
  t.after(() => cluster.close());
  const issuer = await startTestIssuer();
  t.after(() => issuer.close());
  const publicUrl = 'http://127.0.0.1:29999';
  const proxyToken = randomBytes(32).toString('hex');
  const env = {
    NODE_ENV: 'test', STORAGE_MODE: 'postgres', MAIL_PROVIDER: 'mock', DATABASE_URL: cluster.url,
    AUTH_MODE: 'oidc', OIDC_CLIENT_SECRET: '', OIDC_ALLOW_INSECURE_LOOPBACK: 'true',
    OIDC_ISSUER_URL: issuer.issuer, OIDC_CLIENT_ID: 'aiit-fixture', APP_PUBLIC_URL: publicUrl,
    API_TRUSTED_PROXY_IPS: '127.0.0.1', API_PROXY_TOKEN: proxyToken, API_PUBLIC_ORIGIN: publicUrl, API_RATE_LIMIT: '16',
    OIDC_LOGIN_RATE_LIMIT: '2', OIDC_GLOBAL_LOGIN_RATE_LIMIT: '5', OIDC_CALLBACK_RATE_LIMIT: '4',
  };
  const client = await connectPostgres(env);
  const processes: Awaited<ReturnType<typeof startApiProcess>>[] = [];
  t.after(async () => {
    await Promise.all(processes.map(proc => proc.close()));
    await client.$disconnect();
  });
  const source = runtimeFixture();
  source.users[0].oidcIssuer = issuer.issuer;
  issuer.setSubject(source.users[0].oidcSubject);
  await importJsonSnapshot(client, source);
  for (let i = 0; i < 2; i++) processes.push(await startApiProcess(env));
  assert.notEqual(processes[0].pid, processes[1].pid);
  const request = (i: number, route: string, ip: string, cookie?: string) => fetch(processes[i % 2].url + route, {
    redirect: 'manual', headers: { 'x-forwarded-for': ip, 'x-aiit-ingress-token': proxyToken, ...(cookie ? { cookie } : {}) },
  });

  const requests = await Promise.all(Array.from({ length: 24 }, (_, index) => request(index, '/api/health', '198.51.100.11')));
  assert.equal(requests.filter(response => response.status === 200).length, 16);
  assert.equal(requests.filter(response => response.status === 429 && Number(response.headers.get('retry-after')) > 0).length, 8);
  assert.equal((await request(1, '/api/health', '198.51.100.12')).status, 200);

  const login = '/api/auth/oidc/login';
  const first = await request(0, login, '192.0.2.10');
  assert.equal(first.status, 302);
  const flow = cookieFrom(first, 'aiit_oidc_flow');
  const approved = await fetch(first.headers.get('location')!, { redirect: 'manual' });
  const callback = new URL(approved.headers.get('location')!);
  const callbackRoute = callback.pathname + callback.search;
  const callbacks = await Promise.all([request(1, callbackRoute, '192.0.2.10', flow), request(1, callbackRoute, '192.0.2.10', flow)]);
  assert.deepEqual(callbacks.map(response => response.status).sort(), [303, 400]);
  const session = cookieFrom(callbacks.find(response => response.status === 303)!, 'itsupport_session');
  assert.equal((await request(0, '/api/auth/me', '192.0.2.10', session)).status, 200);
  assert.equal(await client.authSession.count(), 1);
  assert.equal(await client.auditLog.count({ where: { action: 'AUTH_ENTERPRISE_LOGIN_SUCCESS' } }), 1);

  const attempts = await Promise.all([request(0, login, '192.0.2.10'), request(1, login, '192.0.2.10')]);
  assert.deepEqual(attempts.map(response => response.status).sort(), [302, 429]);
  for (const ip of ['192.0.2.11', '192.0.2.12', '192.0.2.13']) assert.equal((await request(1, login, ip)).status, 302);
  assert.equal((await request(0, login, '192.0.2.14')).status, 429);
  assert.equal(await client.oidcLoginFlow.count(), 4);

  for (let i = 0; i < 5; i++) {
    const invalid = await request(i, '/api/auth/oidc/callback?code=invalid', '203.0.113.88');
    assert.equal(invalid.status, i < 4 ? 400 : 429);
    assert.equal(cookieFrom(invalid, 'itsupport_session'), '');
  }
  const keys = await client.abuseBucket.findMany({ select: { key: true } });
  assert.ok(keys.every(({ key }) => /^(api|login|callback):[0-9a-f]{5}$|^login:global$/.test(key)));
  await client.abuseBucket.updateMany({ data: { expiresAt: new Date(0) } });
  await client.oidcLoginFlow.updateMany({ data: { expiresAt: new Date(0) } });
  assert.equal((await request(1, login, '192.0.2.14')).status, 302);
  assert.equal(await client.oidcLoginFlow.count(), 1);

  cluster.stop();
  assert.equal((await request(0, login, '192.0.2.14')).status, 503);
  assert.equal((await request(1, '/api/live', '192.0.2.14')).status, 200);
  cluster.start();
});
