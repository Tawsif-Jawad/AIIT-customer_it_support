import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRehearsalSmtp } from '../apps/worker/src/rehearsal-smtp.ts';
import { rehearsalCertificate, startRehearsalSink } from './support/staging-transport.ts';

test('synthetic SMTP requires authentication over verified TLS and recovers locally after outage', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'aiit-day13-smtp-'));
  const wrong = mkdtempSync(join(dir, 'wrong-ca-'));
  const cert = rehearsalCertificate(dir);
  const auth = { user: 'synthetic-relay', pass: randomBytes(24).toString('base64url') };
  let sink = await startRehearsalSink(cert, { auth });
  let running = true;
  t.after(async () => {
    if (running) await sink.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const env = {
    NODE_ENV: 'test', STORAGE_MODE: 'postgres', DATABASE_URL: 'postgresql://aiit_test@127.0.0.1:1/aiit_test',
    AIIT_REHEARSAL_SMTP_PORT: String(sink.port), AIIT_REHEARSAL_SMTP_CA: cert.caFile,
    AIIT_REHEARSAL_SMTP_USER: auth.user, AIIT_REHEARSAL_SMTP_PASSWORD: auth.pass,
  };
  const message = {
    deliveryId: 'synthetic-auth-probe', to: 'employee1@example.test', subject: 'Synthetic notification',
    textBody: 'Synthetic body',
  };
  const transport = createRehearsalSmtp(env)!;
  assert.throws(() => createRehearsalSmtp({ ...env, AIIT_REHEARSAL_SMTP_PASSWORD: undefined }), /UNSAFE_CONFIG/);
  assert.equal((await createRehearsalSmtp({ ...env, AIIT_REHEARSAL_SMTP_PASSWORD: 'invalid' })!.sendEmail(message)).delivered, false);
  assert.throws(() => createRehearsalSmtp({ ...env, AIIT_REHEARSAL_SMTP_PORT: undefined }), /UNSAFE_CONFIG/);
  const untrustedCa = rehearsalCertificate(wrong).caFile;
  assert.equal((await createRehearsalSmtp({ ...env, AIIT_REHEARSAL_SMTP_CA: untrustedCa })!.sendEmail(message)).delivered, false);
  assert.equal((await transport.sendEmail({ ...message, to: 'blocked@example.invalid' })).delivered, false);
  sink.rejectNextMessage(451);
  assert.equal((await transport.sendEmail(message)).delivered, false);
  sink.rejectNextMessage(550);
  assert.equal((await transport.sendEmail(message)).delivered, false);
  assert.equal(sink.rejectedCount(), 2);
  assert.deepEqual(sink.received, []);
  const first = await transport.sendEmail(message);
  assert.equal(first.delivered, true);
  const port = sink.port;
  await sink.close();
  running = false;
  assert.equal((await transport.sendEmail(message)).delivered, false);
  sink = await startRehearsalSink(cert, { auth, port });
  running = true;
  const recovered = await transport.sendEmail(message);
  assert.equal(recovered.delivered, true);
  assert.equal(recovered.messageId, first.messageId);
  assert.equal(sink.received.length, 1);
  assert.match(sink.received[0].data, /Message-ID: <synthetic-auth-probe@example\.test>/);
});
