import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { chromium } from '@playwright/test';
import * as oidc from 'openid-client';
import { startOffice } from './office.ts';
import { runOfficeScenarios } from './scenarios.ts';

const address = process.env.AIIT_DAY13_ISSUER_ADDRESS ?? '';
assert.match(address, /^172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3}$/);
assert.equal(net.isIP(address), 4);
const project = process.env.AIIT_DAY13_COMPOSE_PROJECT ?? '';
assert.match(project, /^aiit-federation-[a-z0-9]+$/);
const root = 'https://127.0.0.1:38443';
const realm = 'aiit-synthetic-office';
const issuer = root + '/realms/' + realm;
const callback = 'https://127.0.0.1:38444';
const clientId = 'aiit-office';
const password = readFileSync(path.join(process.env.AIIT_DAY13_FIXTURE!, 'user-password'), 'utf8').trim();
const sockets = new Set<net.Socket>();
const proxy = net.createServer(socket => {
  const upstream = net.connect(8443, address);
  for (const connection of [socket, upstream]) {
    sockets.add(connection);
    connection.once('close', () => sockets.delete(connection));
  }
  socket.on('error', () => upstream.destroy());
  upstream.on('error', () => socket.destroy());
  socket.pipe(upstream).pipe(socket);
});
await new Promise<void>((resolve, reject) => {
  proxy.once('error', reject);
  proxy.listen(38443, '127.0.0.1', resolve);
});

const actorEmails = ['employee1@example.test', 'employee92@example.test', 'it1@example.test', 'cto@example.test'];
const username = (email: string) => email.split('@')[0];
const compose = (...args: string[]) => execFileSync('docker', [
  'compose', '-p', project, '-f', 'infra/synthetic-enterprise/compose.yml',
  '-f', 'infra/synthetic-enterprise/federation.compose.yml', ...args,
], { stdio: 'pipe' });
try {
  const grant = await fetch(root + '/realms/master/protocol/openid-connect/token', {
    method: 'POST', body: new URLSearchParams({
      grant_type: 'password', client_id: 'admin-cli', username: 'fixture-admin',
      password: process.env.AIIT_DAY13_ADMIN_PASSWORD!,
    }),
  });
  assert.equal(grant.status, 200, 'Synthetic management authentication failed');
  const { access_token } = await grant.json();
  const adminHeaders = { authorization: 'Bearer ' + access_token };
  const adminRealm = root + '/admin/realms/' + realm;
  const providers = await fetch(adminRealm + '/components?type=' + encodeURIComponent('org.keycloak.storage.UserStorageProvider'), {
    headers: adminHeaders,
  });
  assert.equal(providers.status, 200);
  const directory = (await providers.json() as Array<{ id: string; name: string }>).find(provider => provider.name === 'synthetic-samba');
  assert.ok(directory?.id);
  const sync = await fetch(adminRealm + '/user-storage/' + directory.id + '/sync?action=triggerFullSync', {
    method: 'POST', headers: adminHeaders,
  });
  assert.equal(sync.status, 200);
  const { added, updated, failed } = await sync.json();
  assert.equal(failed, 0);
  assert.equal(added + updated, 129);
  console.log(JSON.stringify({ directorySync: { added, updated, failed } }));
  const subjects = new Map<string, string>();
  for (const email of actorEmails) {
    const users = await fetch(adminRealm + '/users?exact=true&username=' + username(email), { headers: adminHeaders });
    assert.equal(users.status, 200);
    const entries = await users.json() as Array<{ id: string; username: string; email: string; federationLink: string }>;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].username, username(email));
    assert.equal(entries[0].email, email);
    assert.ok(entries[0].federationLink, 'Account must be federated');
    subjects.set(email, entries[0].id);
  }
  const office = await startOffice(38444, false, true, {
    issuer, clientId, subjects, serverTls: {
      cert: readFileSync(path.join(process.env.AIIT_DAY13_TLS_DIR!, 'cert.pem')),
      key: readFileSync(path.join(process.env.AIIT_DAY13_TLS_DIR!, 'key.pem')),
    },
  });
  try {
    const browser = await chromium.launch();
    try {
      async function login(email: string, secret = password, success = true) {
        const page = await browser.newPage();
        try {
          const response = await page.goto(callback + '/api/auth/oidc/login');
          assert.ok(response?.ok(), 'OIDC login initiation failed with HTTP ' + response?.status());
          assert.equal(new URL(page.url()).origin, root);
          await page.locator('#username').fill(username(email));
          await page.locator('#password').fill(secret);
          if (!success) {
            const submission = page.waitForResponse(response => response.request().method() === 'POST' &&
              new URL(response.url()).origin === root && new URL(response.url()).pathname.includes('/login-actions/authenticate'));
            await page.locator('#kc-login').click();
            const rejection = await submission;
            assert.ok(rejection.status() >= 200 && rejection.status() < 600);
            assert.equal(rejection.headers().location, undefined, 'Expected a provider rejection without a callback redirect');
            assert.equal(new URL(page.url()).origin, root);
            assert.equal((await page.context().cookies(callback)).some(cookie => cookie.name === 'itsupport_session'), false);
            return { status: rejection.status(), cookie: '' };
          }
          await page.locator('#kc-login').click();
          await page.waitForURL(callback + '/app');
          const session = (await page.context().cookies(callback)).find(cookie => cookie.name === 'itsupport_session');
          assert.ok(session?.secure && session.httpOnly, 'Expected a secure application session');
          return { status: 200, cookie: session.name + '=' + session.value };
        } finally {
          await page.close();
        }
      }
      await login(actorEmails[0], 'invalid', false);
      await login('employee120@example.test', password, false);
      await login('unknown@example.test', password, false);
      console.log(JSON.stringify(await runOfficeScenarios(office, login, false)));
      const existing = await login(actorEmails[0]);
      const config = await oidc.discovery(new URL(issuer), clientId, {
        id_token_signed_response_alg: 'RS256',
      }, oidc.None(), { execute: [oidc.enableNonRepudiationChecks] });
      const redirect = callback + '/api/auth/oidc/callback';
      const verifier = oidc.randomPKCECodeVerifier();
      const nonce = oidc.randomNonce();
      const state = oidc.randomState();
      const authorization = oidc.buildAuthorizationUrl(config, {
        redirect_uri: redirect, scope: 'openid', code_challenge_method: 'S256',
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier), nonce, state,
      });
      const tokenPage = await browser.newPage();
      let verifiedAccessToken: string;
      try {
        await tokenPage.route(redirect + '?**', route => route.fulfill({ status: 200, body: 'Synthetic callback captured locally' }));
        await tokenPage.goto(authorization.href);
        await tokenPage.locator('#username').fill(username(actorEmails[0]));
        await tokenPage.locator('#password').fill(password);
        await tokenPage.locator('#kc-login').click();
        await tokenPage.waitForURL(redirect + '?**');
        const tokens = await oidc.authorizationCodeGrant(config, new URL(tokenPage.url()), {
          pkceCodeVerifier: verifier, expectedNonce: nonce, expectedState: state, idTokenExpected: true,
        });
        assert.equal(tokens.claims()?.sub, subjects.get(actorEmails[0]));
        verifiedAccessToken = tokens.access_token;
      } finally {
        await tokenPage.close();
      }
      const tokenStatus = async () => (await fetch(issuer + '/protocol/openid-connect/userinfo', {
        headers: { authorization: 'Bearer ' + verifiedAccessToken },
        signal: AbortSignal.timeout(15000),
      })).status;
      assert.equal(await tokenStatus(), 200);
      const issuedAt = Date.now();
      const directoryState = (action: string) => compose('exec', '-T', 'directory', 'samba-tool', 'user', action,
        username(actorEmails[0]), '-s', '/tmp/synthetic-ad/etc/smb.conf');
      directoryState('disable');
      await login(actorEmails[0], password, false);
      const current = await fetch(callback + '/api/auth/me', { headers: { cookie: existing.cookie } });
      assert.ok([200, 401].includes(current.status));
      console.log(JSON.stringify({ lifecycle: 'directory-disabled', elapsedMs: Date.now() - issuedAt, existingAiitSessionStatus: current.status, existingTokenUserInfoStatus: await tokenStatus() }));
      directoryState('enable');
      await login(actorEmails[0]);
      // Simulate an unresponsive directory while preserving its Docker network endpoint.
      compose('pause', 'directory');
      try {
        await login(actorEmails[0], password, false);
        const outage = await fetch(callback + '/api/auth/me', { headers: { cookie: existing.cookie } });
        assert.ok([200, 401].includes(outage.status));
        console.log(JSON.stringify({ lifecycle: 'directory-outage', existingAiitSessionStatus: outage.status, existingTokenUserInfoStatus: await tokenStatus() }));
      } finally {
        compose('unpause', 'directory');
      }
      // Check actual LDAPS readiness without spending the application's login budget.
      const recoveryDeadline = Date.now() + 20000;
      for (;;) {
        try {
          compose('exec', '-T', 'directory', 'env', 'LDAPTLS_CACERT=/fixture/ca.pem', 'LDAPTLS_REQCERT=demand',
            'ldapsearch', '-LLL', '-o', 'nettimeout=2', '-l', '3', '-H', 'ldaps://directory:636',
            '-x', '-D', 'CN=federation-reader,CN=Users,DC=office,DC=example,DC=test',
            '-y', '/fixture/bind-password', '-s', 'base', '-b', '', 'defaultNamingContext');
          break;
        } catch {
          if (Date.now() >= recoveryDeadline) throw new Error('Samba LDAPS did not become ready after resuming');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      await login(actorEmails[0]);
      console.log('Verified federated login recovery.');
    } finally {
      await browser.close();
    }
  } finally {
    await office.close();
  }
} finally {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>(resolve => proxy.close(() => resolve()));
}
