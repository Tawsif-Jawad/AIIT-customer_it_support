import assert from 'node:assert/strict';
import { test } from 'node:test';
import { disposablePostgresUrl } from '../packages/shared/src/isolation.ts';
import { readEnterpriseSettings } from '../apps/api/src/enterprise-auth.ts';
import { createWebServer } from '../apps/web/src/server.ts';
import { createRehearsalSmtp } from '../apps/worker/src/rehearsal-smtp.ts';

test('disposable database configuration rejects non-local and alternate socket destinations before connecting', () => {
  assert.ok(disposablePostgresUrl(new URL('postgresql://aiit_test@127.0.0.1:40000/aiit_test')));
  assert.ok(disposablePostgresUrl(new URL('postgresql://aiit_test@127.0.0.1:40000/aiit_test_runtime_restore?connect_timeout=2')));
  for (const rejected of [
    'postgresql://aiit_test@10.0.0.2:5432/aiit_test',
    'postgresql://aiit_test@db.invalid:5432/aiit_test',
    'postgresql://aiit_test@localhost:5432/aiit_test',
    'postgresql://aiit_test@127.0.0.1:5432/office',
    'postgresql://aiit_test:synthetic-secret@127.0.0.1:5432/aiit_test',
    'postgresql://aiit_test@127.0.0.1:5432/aiit_test?host=%2Ftmp',
    'postgresql://aiit_test@127.0.0.1:5432/aiit_test?connect_timeout=2&connect_timeout=3',
  ]) assert.equal(disposablePostgresUrl(new URL(rejected)), false);
});

test('OIDC and proxy configuration fail closed on unknown destinations and embedded identities', () => {
  const env = {
    NODE_ENV: 'test', AUTH_MODE: 'oidc', OIDC_CLIENT_ID: 'fixture',
    OIDC_ISSUER_URL: 'https://127.0.0.1:8443/realm', APP_PUBLIC_URL: 'https://127.0.0.1:4000',
  };
  assert.equal(readEnterpriseSettings(env).issuer, env.OIDC_ISSUER_URL);
  for (const host of ['10.0.0.2', 'issuer.invalid', 'localhost', 'synthetic@127.0.0.1']) {
    const url = 'https://' + host + ':8443';
    assert.throws(() => readEnterpriseSettings({ ...env, OIDC_ISSUER_URL: url }), /OIDC_DESTINATION_DENIED/);
    assert.throws(() => readEnterpriseSettings({ ...env, APP_PUBLIC_URL: url }), /OIDC_DESTINATION_DENIED/);
    assert.throws(() => createWebServer(url), /WEB_API_DESTINATION_DENIED/);
  }
  assert.throws(() => readEnterpriseSettings({ ...env, OIDC_CLIENT_SECRET: 'synthetic' }), /OIDC_TEST_CLIENT_SECRET_DENIED/);
  assert.equal(createWebServer('http://127.0.0.1:4000').listening, false);
});

test('SMTP rehearsal rejects an unapproved database before reading a certificate or opening a socket', () => {
  assert.throws(() => createRehearsalSmtp({
    NODE_ENV: 'test', STORAGE_MODE: 'postgres', AIIT_REHEARSAL_SMTP_PORT: '42425',
    AIIT_REHEARSAL_SMTP_CA: '/nonexistent-fixture-cert.pem',
    DATABASE_URL: 'postgresql://aiit_test@db.invalid:5432/aiit_test',
  }), /REHEARSAL_SMTP_UNSAFE_CONFIG/);
});
