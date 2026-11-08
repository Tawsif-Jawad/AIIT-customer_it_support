import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { getPortalHtml } from '../apps/web/src/server.ts';
import { createApiServer } from '../apps/api/src/app.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('generated browser JavaScript parses, AIIT renders without JS, requests have a deadline', () => {
  const html = getPortalHtml();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script));
  assert.match(html, /<span class="brand-badge">AIIT<\/span>/);
  assert.doesNotMatch(html.match(/<section id="login-section"[^>]*>/)![0], /display: none/);
  assert.match(script, /controller.abort\(\), 8000/);
});

test('production rejects development identity enumeration and email-only sign-in', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiit-auth-'));
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const app = createApiServer(path.join(dir, 'db.json'));
    for (const [method, url] of [['GET', '/api/auth/identities'], ['POST', '/api/auth/login']]) {
      const result = await app.inject({method, url, body: {email: 'tawsif.zawad@upstra.com'}});
      assert.equal(result.status, 503);
      assert.equal(result.data.error.code, 'IDENTITY_PROVIDER_NOT_CONFIGURED');
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('corrupted persistence fails without replacing existing records with demo data', async () => {
  const { EnterpriseDataStore } = await import('../apps/api/src/store.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiit-store-'));
  const file = path.join(dir, 'db.json');
  try {
    fs.writeFileSync(file, '{broken data');
    assert.throws(() => new EnterpriseDataStore(file), /PERSISTENCE_CORRUPT/);
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken data');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('development tokens validate issuer/audience/expiry and are rejected in production', async () => {
  const { issueOIDCToken, verifyOIDCToken } = await import('../apps/api/src/auth.ts');
  const { createInitialSeedState } = await import('../apps/api/src/store.ts');
  const crypto = await import('node:crypto');
  const user = createInitialSeedState().users[0];
  const token = issueOIDCToken(user);
  assert.equal(verifyOIDCToken(token)?.sub, user.id);
  const [header, payload] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  for (const patch of [{iss: 'untrusted'}, {aud: 'other-app'}, {exp: null}, {exp: 0}, {iat: 99999999999}]) {
    const encoded = Buffer.from(JSON.stringify({...claims, ...patch})).toString('base64url');
    const input = header + '.' + encoded;
    const signature = crypto.createHmac('sha256', process.env.JWT_SIGNING_SECRET || 'dev-only-hmac-secret-replace-in-production-immediately').update(input).digest('base64url');
    assert.equal(verifyOIDCToken(input + '.' + signature), null);
  }
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.equal(verifyOIDCToken(token), null);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
