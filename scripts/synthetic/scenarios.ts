import assert from 'node:assert/strict';
import type { User } from '../../packages/shared/src/index.ts';
import { cookieFrom } from '../../tests/support/oidc-application.ts';
import { demoPassword, type startOffice } from './office.ts';

type Office = Awaited<ReturnType<typeof startOffice>>;
export async function officeLogin(office: Office, email: string, password = demoPassword) {
  const request = await fetch(office.publicUrl + '/api/auth/oidc/login', { redirect: 'manual' });
  const authorization = request.headers.get('location');
  assert.ok(authorization);
  assert.equal(new URL(authorization).origin, office.issuer.issuer);
  const grant = await fetch(authorization, {
    method: 'POST', redirect: 'manual', body: new URLSearchParams({ email, password }),
  });
  if (grant.status !== 302) return { status: grant.status, cookie: '' };
  const callback = grant.headers.get('location');
  assert.ok(callback);
  assert.equal(new URL(callback).origin, office.publicUrl);
  const response = await fetch(callback, {
    redirect: 'manual', headers: { cookie: cookieFrom(request, 'aiit_oidc_flow') },
  });
  return { status: response.status, cookie: cookieFrom(response, 'itsupport_session') };
}

export async function runOfficeScenarios(office: Office, signIn = (email: string) => officeLogin(office, email), checkSimulatorDenials = true) {
  const results: string[] = [];
  type Body = Record<string, unknown>;
  async function session(email: string, role: User['roleName']) {
    const login = await signIn(email);
    assert.ok(login.cookie);
    const profile = await fetch(office.publicUrl + '/api/auth/me', { headers: { cookie: login.cookie } });
    assert.equal(profile.status, 200);
    const { user, csrfToken } = await profile.json() as { user: User; csrfToken: string };
    assert.equal(user.email, email);
    assert.equal(user.roleName, role);
    const call = async <T = unknown>(path: string, expected: number, body?: Body) => {
      const response = await fetch(office.publicUrl + '/api/' + path, {
        method: body ? 'POST' : 'GET',
        headers: { cookie: login.cookie, origin: office.publicUrl, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      assert.equal(response.status, expected, path + ' · ' + JSON.stringify(data.error ?? {}));
      return data as T;
    };
    return { user, call };
  }
  if (checkSimulatorDenials) {
    assert.equal((await officeLogin(office, 'employee1@example.test', 'invalid')).status, 403);
    assert.equal((await officeLogin(office, 'employee120@example.test')).status, 403);
  }
  const employee = await session('employee1@example.test', 'EMPLOYEE');
  const colleague = await session('employee92@example.test', 'EMPLOYEE');
  const it = await session('it1@example.test', 'IT_ADMIN');
  const cto = await session('cto@example.test', 'CTO');
  type TicketResult = { ticket: { id: string; status: string; aiSuggestedFix: string | null }; aiDecision: object };
  const outlook = {
    title: 'Outlook profile needs help', description: 'The synthetic Outlook client needs email profile troubleshooting.',
    serviceCategoryId: 'cat-outlook-config', customFormPayload: { osPlatform: 'macOS' },
  };
  const ticket = (output: TicketResult) => 'tickets/' + output.ticket.id;
  const change = (status: string) => ({ status, notes: 'Synthetic scenario verification' });
  const mail = await employee.call<TicketResult>('tickets', 201, outlook);
  assert.equal(mail.ticket.status, 'RESOLVED_PENDING_CONFIRMATION');
  assert.ok(mail.ticket.aiSuggestedFix);
  const reopened = await employee.call<TicketResult>(ticket(mail) + '/transition', 200, change('REOPENED'));
  assert.equal(reopened.ticket.status, 'ASSIGNED_TO_IT');
  results.push('A: Outlook guidance rejected; queued for IT');

  office.network.fail('wifi');
  const fault = office.network.observe('wifi');
  const connectivity = await employee.call<TicketResult>('tickets', 201, {
    title: 'Office Wi-Fi fails authentication',
    description: 'Structured synthetic diagnostic observation: ' + JSON.stringify(fault),
    serviceCategoryId: 'cat-internet-conn', customFormPayload: { connectionType: 'Corporate Wi-Fi', floorLocation: 'Alder 1' },
  });
  assert.equal(fault.available, false);
  assert.ok(connectivity.aiDecision);
  const networkPath = ticket(connectivity);
  if (connectivity.ticket.status === 'RESOLVED_PENDING_CONFIRMATION') await employee.call(networkPath + '/transition', 200, change('REOPENED'));
  await it.call(networkPath + '/transition', 200, change('IN_PROGRESS'));
  assert.equal(office.network.repair('wifi'), true);
  assert.equal(office.network.observe('wifi').available, true);
  await it.call(networkPath + '/transition', 200, change('RESOLVED_PENDING_CONFIRMATION'));
  results.push('B: Wi-Fi fault recorded and simulated recovery verified');

  const serial = crypto.randomUUID();
  const equipment = await it.call<{ asset: { id: string } }>('assets', 201, {
    assetTag: 'FIC-DEMO-' + serial, serialNumber: serial, category: 'Laptop', modelName: 'Fictional Laptop',
    sbuId: colleague.user.sbuId,
  });
  const asset = 'assets/' + equipment.asset.id;
  await it.call(asset + '/lifecycle', 200, { action: 'assign', assigneeId: colleague.user.id, notes: 'Synthetic handover' });
  await colleague.call(asset + '/acknowledge', 200, {});
  await colleague.call(asset + '/acknowledge', 200, {});
  assert.equal(await office.client.auditLog.count({ where: { resourceId: equipment.asset.id, action: 'ASSET_HANDOVER_ACKNOWLEDGED' } }), 1);
  results.push('C: Laptop handover acknowledged once');

  const directory = await employee.call<TicketResult>('tickets', 201, {
    title: 'Request fictional directory account', description: 'Request synthetic account access.',
    serviceCategoryId: 'cat-ad-account', customFormPayload: { targetAdGroup: 'Alder Observers', businessJustification: 'Synthetic demonstration' },
  });
  const request = await office.client.approval.findFirstOrThrow({ where: { ticketId: directory.ticket.id } });
  const decision = { decision: 'APPROVED', decisionNotes: 'Synthetic authorization review' };
  await employee.call('approvals/' + request.id + '/decide', 403, decision);
  await it.call('approvals/' + request.id + '/decide', 200, decision);
  results.push('D: Directory request approved through business workflow; dry-run only');

  const critical = await employee.call<TicketResult>('tickets', 201, {
    title: 'Synthetic core switch incident', description: 'The fictional office switch is unavailable.',
    serviceCategoryId: 'cat-hardware-incident', severity: 'CRITICAL',
    customFormPayload: { impactedSystems: 'Alder lab switch', sbuWideImpact: true },
  });
  const criticalPath = ticket(critical);
  if (critical.ticket.status === 'RESOLVED_PENDING_CONFIRMATION') await employee.call(criticalPath + '/transition', 200, change('REOPENED'));
  await it.call(criticalPath + '/escalate-cto', 200, { reason: 'Synthetic critical escalation' });
  const ctoApproval = await office.client.approval.findFirstOrThrow({ where: { ticketId: critical.ticket.id } });
  await it.call('approvals/' + ctoApproval.id + '/decide', 403, decision);
  await cto.call('approvals/' + ctoApproval.id + '/decide', 200, decision);
  await cto.call(criticalPath + '/transition', 200, change('RESOLVED_PENDING_CONFIRMATION'));
  assert.ok(await office.client.ticketEvent.count({ where: { ticketId: critical.ticket.id } }) > 2);
  results.push('E: IT escalated the critical ticket; CTO updated it');

  await office.client.ticket.update({ where: { id: mail.ticket.id }, data: { slaResolutionDueAt: new Date(0) } });
  const sla = await Promise.all([office.worker.processSlaOnce(), office.worker.processSlaOnce()]);
  assert.deepEqual(sla.sort(), [false, true]);
  assert.equal(await office.client.slaJob.count({ where: { ticketId: mail.ticket.id, state: 'COMPLETED' } }), 1);
  results.push('F: Competing SLA runs committed one breach');

  await cto.call('approvals/office-approval-0/decide', 410, decision);
  assert.equal((await office.client.approval.findUniqueOrThrow({ where: { id: 'office-approval-0' } })).status, 'PENDING');
  results.push('G: Expired approval refused and retained');
  await colleague.call(ticket(mail), 403);
  await colleague.call(asset + '/acknowledge', 200, {});
  await employee.call(asset + '/acknowledge', 403, {});
  await it.call('reports/summary', 200);
  results.push('H: Cross-SBU requester ticket and asset access denied');

  // The seed has no delivery intents. All mail here resulted from actual scenario requests.
  for (let remaining = 32; remaining > 0 && await office.worker.runOnce(); remaining--) { /* drain */ }
  assert.ok(office.sink.received.length > 0);
  assert.ok(office.sink.received.every(message => message.recipient.endsWith('@example.test')));
  const sent = await office.client.notificationJob.count({ where: { state: 'SENT' } });
  assert.equal(sent, office.sink.received.length);
  return { results, sent };
}
