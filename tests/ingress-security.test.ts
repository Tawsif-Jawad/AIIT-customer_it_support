import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApiServer } from '../apps/api/src/app.ts';
import { createWebServer } from '../apps/web/src/server.ts';
import { clientAddress, trustedPeers } from '../packages/shared/src/ingress.ts';
import { startOidcApplication } from './support/oidc-application.ts';
import { budgetBucket } from '../apps/api/src/abuse-control.ts';

test('ingress canonicalizes mapped IPv4 and IPv6 and stops at the first untrusted hop', () => {
  const trusted = trustedPeers('127.0.0.1, 2001:db8:2::1');
  assert.equal(clientAddress('::ffff:127.0.0.1', { 'x-forwarded-for': '198.51.100.1, 203.0.113.22, 2001:0db8:2::1' }, trusted), '203.0.113.22');
  assert.equal(clientAddress('127.0.0.1', { forwarded: 'for="[2001:0db8:3::11]";proto=https, for="[2001:db8:2::1]"' }, trusted), '2001:db8:3::11');
  assert.equal(clientAddress('192.0.2.1', { 'x-forwarded-for': 'garbage', forwarded: 'also garbage' }, trusted), '192.0.2.1');
  assert.throws(() => clientAddress('127.0.0.1', { forwarded: 'for=192.0.2.5', 'x-forwarded-for': '192.0.2.5' }, trusted), /INVALID_FORWARDING_CHAIN/);
  assert.throws(() => clientAddress('127.0.0.1', { forwarded: 'for=unknown' }, trusted), /INVALID_FORWARDING_CHAIN/);
  assert.equal(budgetBucket('test-secret', '2001:db8:3::11'), budgetBucket('test-secret', '2001:db8:3::9999'));
  assert.throws(() => trustedPeers('0.0.0.0/0'), /INVALID_TRUSTED_PROXY_IPS/);
});

test('web ingress strips client forwarding headers and configured origin defeats authority spoofing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiit-ingress-'));
  const token = randomBytes(32).toString('hex');
  const keys = ['API_TRUSTED_PROXY_IPS', 'WEB_TRUSTED_PROXY_IPS', 'API_PUBLIC_ORIGIN', 'API_RATE_LIMIT', 'API_PROXY_TOKEN', 'WEB_API_PROXY_TOKEN'];
  const original = keys.map(key => process.env[key]);
  const servers: ReturnType<typeof createWebServer>[] = [];
  async function listen(server: ReturnType<typeof createWebServer>) {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    return 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  }
  try {
    process.env.API_TRUSTED_PROXY_IPS = '127.0.0.1';
    delete process.env.WEB_TRUSTED_PROXY_IPS;
    delete process.env.API_PUBLIC_ORIGIN;
    delete process.env.API_PROXY_TOKEN;
    assert.throws(() => createApiServer(path.join(dir, 'test.json')), /TRUSTED_PROXY_REQUIRES_TOKEN/);
    process.env.API_PROXY_TOKEN = token;
    process.env.WEB_API_PROXY_TOKEN = token;
    assert.throws(() => createApiServer(path.join(dir, 'test.json')), /TRUSTED_PROXY_REQUIRES_PUBLIC_ORIGIN/);
    process.env.API_PUBLIC_ORIGIN = 'https://portal.example.test';
    process.env.API_RATE_LIMIT = '2';
    const api = createApiServer(path.join(dir, 'test.json'));
    const apiUrl = await listen(api.server);
    const web = await listen(createWebServer(apiUrl));
    for (let i = 1; i <= 3; i++) {
      const response = await fetch(web + '/api/health', { headers: {
        forwarded: 'for=198.51.100.' + i, 'x-forwarded-for': '192.0.2.' + i,
        'x-real-ip': '203.0.113.' + i, 'x-aiit-ingress-token': 'a'.repeat(32),
      } });
      assert.equal(response.status, i === 3 ? 429 : 200);
      if (i === 3) assert.ok(Number(response.headers.get('retry-after')) > 0);
    }
    for (const ip of ['192.0.2.50', '2001:db8:4::5', '2001:db8:5::6']) {
      assert.equal((await fetch(apiUrl + '/api/health', { headers: { 'x-forwarded-for': ip, 'x-aiit-ingress-token': token } })).status, 200);
    }
    assert.equal((await fetch(apiUrl + '/api/health', { headers: { 'x-forwarded-for': '192.0.2.100' } })).status, 429);
    const denied = await api.inject({ method: 'POST', url: '/api/auth/logout', headers: {
      host: 'attacker.example.test', origin: 'https://attacker.example.test',
      'x-forwarded-host': 'attacker.example.test', 'x-forwarded-proto': 'https',
      'x-forwarded-for': '192.0.2.52', 'x-aiit-ingress-token': token, cookie: 'itsupport_session=synthetic',
    } });
    assert.equal(denied.status, 403);

    delete process.env.API_TRUSTED_PROXY_IPS;
    const direct = createApiServer(path.join(dir, 'untrusted.json'));
    for (let i = 1; i <= 3; i++) {
      const response = await direct.inject({ method: 'GET', url: '/api/health', headers: { 'x-forwarded-for': '192.0.2.' + i } });
      assert.equal(response.status, i === 3 ? 429 : 200);
    }
  } finally {
    for (const server of servers.reverse()) await new Promise<void>(resolve => server.close(() => resolve()));
    for (const [index, key] of keys.entries()) {
      if (original[index] === undefined) delete process.env[key];
      else process.env[key] = original[index];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('OIDC discovery timeout leaves the API available and establishes no session', { timeout: 12000 }, async () => {
  const fixture = await startOidcApplication();
  try {
    fixture.issuer.setMode('stall-discovery');
    const started = performance.now();
    const login = fetch(fixture.publicUrl + '/api/auth/oidc/login', { redirect: 'manual' });
    const ready = await fetch(fixture.publicUrl + '/api/ready', { signal: AbortSignal.timeout(1500) });
    assert.equal(ready.status, 200);
    const result = await login;
    assert.equal(result.status, 503);
    assert.ok(performance.now() - started < 8000);
    assert.equal(result.headers.get('set-cookie'), null);
    assert.equal(fixture.app.store.getState().authSessions?.length ?? 0, 0);
    assert.ok(!fixture.app.store.getState().auditLogs.some(row => row.action === 'AUTH_ENTERPRISE_LOGIN_SUCCESS'));
  } finally {
    fixture.issuer.server.closeAllConnections();
    await fixture.close();
  }
});
