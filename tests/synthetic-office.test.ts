import assert from 'node:assert/strict';
import { test } from 'node:test';
import { officeDataset } from '../scripts/synthetic/dataset.ts';
import { createOfficeNetwork } from '../scripts/synthetic/network.ts';
import { startOffice } from '../scripts/synthetic/office.ts';
import { officeLogin, runOfficeScenarios } from '../scripts/synthetic/scenarios.ts';
import { startTestIssuer } from './support/oidc-issuer.ts';
import { postgresBinaries } from './support/disposable-postgres.ts';

test('synthetic office inventory and network observations are deterministic', async () => {
  await assert.rejects(startTestIssuer({ redirect: 'https://office.example.test/api/auth/oidc/callback',
    clientId: 'synthetic-office', accounts: new Map(), password: '' }), /exact loopback callback/);
  const { snapshot, profiles } = officeDataset();
  assert.deepEqual({ snapshot, profiles }, officeDataset());
  assert.deepEqual([snapshot.sbus.length, snapshot.users.length, snapshot.assets.length, snapshot.tickets.length, snapshot.approvals.length],
    [6, 129, 180, 240, 40]);
  assert.equal(profiles.filter(({ user }) => user.roleName === 'EMPLOYEE').length, 120);
  assert.equal(profiles.filter(({ user }) => user.roleName === 'IT_ADMIN').length, 8);
  assert.equal(profiles.filter(({ user }) => user.roleName === 'CTO').length, 1);
  assert.equal(profiles.filter(({ user }) => !user.isActive).length, 3);
  assert.equal(new Set(profiles.map(({ user }) => user.oidcSubject)).size, 129);
  assert.ok(snapshot.users.every(user => user.email.endsWith('@example.test')));
  assert.deepEqual(snapshot.notifications, []);
  const net = createOfficeNetwork();
  for (const fault of ['internet', 'wifi', 'dns', 'dhcp', 'vpn', 'printer', 'latency', 'intermittent'] as const) {
    assert.equal(net.observe(fault).available, true);
    net.fail(fault);
    assert.equal(net.observe(fault).available, false);
    assert.equal(net.repair(fault), true);
    assert.equal(net.observe(fault).available, true);
  }
});

test('synthetic office runs all eight scenarios with scoped OIDC and TLS mail', {
  skip: process.env.DB_REQUIRED !== 'true' && !postgresBinaries() ? 'Disposable PostgreSQL unavailable' : false,
  timeout: 120000,
}, async t => {
  const office = await startOffice(0, false, true);
  t.after(() => office.close());
  const page = await fetch(office.publicUrl + '/app');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /SYNTHETIC ENVIRONMENT — FICTIONAL DATA/);
  assert.deepEqual(await office.client.notificationJob.findMany(), []);
  const { results, sent } = await runOfficeScenarios(office);
  assert.equal(results.length, 8);
  assert.ok(sent > 0);
  t.diagnostic(JSON.stringify({ inventory: office.counts, results, smtpAccepted: sent }));

  const account = office.snapshot.users[0];
  const session = await officeLogin(office, account.email);
  await office.setDirectoryActive(account.email, false);
  assert.equal(await office.client.auditLog.count({
    where: { resourceId: account.id, action: 'SYNTHETIC_DIRECTORY_DISABLED' },
  }), 1);
  const disabled = await fetch(office.publicUrl + '/api/auth/me', { headers: { cookie: session.cookie } });
  assert.equal(disabled.status, 401);
  assert.equal((await officeLogin(office, account.email)).status, 403);
  await office.setDirectoryActive(account.email, true);
  assert.ok((await officeLogin(office, account.email)).cookie);

  await office.client.notification.create({ data: {
    recipientId: account.id, recipientEmail: 'synthetic-retry@example.test', subject: 'Synthetic retry fixture',
    body: 'This message stays in the synthetic sink.', job: { create: { id: 'office-retry', maxAttempts: 2 } },
  } });
  office.sink.rejectNextMessage();
  assert.equal(await office.worker.runOnce(), true);
  assert.equal((await office.client.notificationJob.findUniqueOrThrow({ where: { id: 'office-retry' } })).state, 'QUEUED');
  await office.client.notificationJob.update({ where: { id: 'office-retry' }, data: { availableAt: new Date(0) } });
  assert.equal(await office.worker.runOnce(), true);
  assert.equal((await office.client.notificationJob.findUniqueOrThrow({ where: { id: 'office-retry' } })).state, 'SENT');
  assert.equal(office.sink.received.filter(message => message.data.includes('<office-retry@example.test>')).length, 1);

  const manifest = (db: typeof office.client) => Promise.all([
    db.sBU.count(), db.user.count(), db.asset.count(), db.ticket.count(), db.ticketEvent.count(),
    db.approval.count(), db.slaJob.count(), db.auditLog.count(), db.notificationJob.count(),
  ]);
  const source = await manifest(office.client);
  const restored = await office.connectRestoredSnapshot();
  try {
    assert.deepEqual(await manifest(restored), source);
    assert.equal((await restored.notificationJob.findUniqueOrThrow({ where: { id: 'office-retry' } })).state, 'SENT');
  } finally {
    await restored.$disconnect();
  }

});
