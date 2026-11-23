import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startOffice } from './office.ts';
import { runOfficeScenarios } from './scenarios.ts';

const address = process.env.AIIT_DAY13_ISSUER_ADDRESS ?? '';
assert.match(address, /^172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3}$/);
assert.equal(net.isIP(address), 4);
const project = process.env.AIIT_DAY13_COMPOSE_PROJECT ?? '';
assert.match(project, /^aiit-federation-[a-z0-9]+$/);
const root = 'https://localhost:38443';
const realm = 'aiit-synthetic-office';
const issuer = root + '/realms/' + realm;
const callback = 'https://localhost:38444';
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
  const subjects = new Map<string, string>();
  for (const email of actorEmails) {
    const users = await fetch(root + '/admin/realms/' + realm + '/users?exact=true&username=' + username(email),
      { headers: { authorization: 'Bearer ' + access_token } });
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
          await page.goto(callback + '/api/auth/oidc/login');
          assert.equal(new URL(page.url()).origin, root);
          await page.locator('#username').fill(username(email));
          await page.locator('#password').fill(secret);
          await page.locator('#kc-login').click();
          if (!success) {
            await page.locator('#username').waitFor({ state: 'visible' });
            assert.equal(new URL(page.url()).origin, root);
            assert.equal((await page.context().cookies(callback)).some(cookie => cookie.name === 'itsupport_session'), false);
            return { status: 403, cookie: '' };
          }
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
      const issuedAt = Date.now();
      const directoryState = (action: string) => compose('exec', '-T', 'directory', 'samba-tool', 'user', action,
        username(actorEmails[0]), '-s', '/tmp/synthetic-ad/etc/smb.conf');
      directoryState('disable');
      await login(actorEmails[0], password, false);
      const current = await fetch(callback + '/api/auth/me', { headers: { cookie: existing.cookie } });
      assert.ok([200, 401].includes(current.status));
      console.log(JSON.stringify({ lifecycle: 'directory-disabled', elapsedMs: Date.now() - issuedAt, existingAiitSessionStatus: current.status }));
      directoryState('enable');
      await login(actorEmails[0]);
      compose('stop', 'directory');
      try {
        await login(actorEmails[0], password, false);
        const outage = await fetch(callback + '/api/auth/me', { headers: { cookie: existing.cookie } });
        assert.ok([200, 401].includes(outage.status));
        console.log(JSON.stringify({ lifecycle: 'directory-outage', existingAiitSessionStatus: outage.status }));
      } finally {
        compose('start', 'directory');
      }
      for (let attempt = 0; ; attempt++) {
        try { await login(actorEmails[0]); break; }
        catch (error) {
          if (attempt >= 4) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
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
