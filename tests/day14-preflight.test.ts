import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import test from 'node:test';
import { consumeExecution } from '../scripts/synthetic/day14-registry.ts';
import { collectRuntimeEvidence, runIsolatedProcess, type ContainerObservation } from '../scripts/synthetic/day14-runtime-evidence.ts';
import { superviseDay14, type SupervisionDependencies } from '../scripts/synthetic/day14-supervisor.ts';
import { disposablePostgres, postgresBinaries } from './support/disposable-postgres.ts';
import {
  APPROVED_IMAGE_DIGESTS,
  EXCEPTION_ID,
  MANDATORY_ACKNOWLEDGEMENTS,
  REQUIRED_BRANCH,
  canonicalizePayload,
  evaluateDay14Preflight,
  runLivePreflight,
  type AuthorizationPayload,
  type CompensatingControlSnapshot,
  type PreflightContext,
  type SignedAuthorizationEnvelope,
  type StartAuthorizationPayload,
} from '../scripts/synthetic/day14-preflight.ts';

// Dedicated ephemeral test-only Ed25519 keypair (never used for real authorization).
const { publicKey: testPubKey, privateKey: testPrivKey } = generateKeyPairSync('ed25519');
const testPublicKeyPem = testPubKey.export({ type: 'spki', format: 'pem' }).toString();
const NOW_UTC_MS = Date.parse('2026-11-23T12:00:00Z');

function allAcknowledgements(): Record<string, boolean> {
  return Object.fromEntries(MANDATORY_ACKNOWLEDGEMENTS.map(ack => [ack, true]));
}

function validPayload(overrides: Partial<AuthorizationPayload> = {}): AuthorizationPayload {
  return {
    exceptionId: EXCEPTION_ID,
    status: 'APPROVED',
    approver: 'test-owner@example.test',
    approvalMechanism: 'signed-owner-record',
    approvedAtUtc: '2026-11-23T10:00:00Z',
    expiresAtUtc: '2026-12-07T10:00:00Z', // exactly 336 hours (14 days)
    revoked: false,
    revokedAtUtc: null,
    acknowledgements: allAcknowledgements(),
    permittedScopes: ['day14-synthetic-simulation', 'day14-full-office-load'],
    approvedImages: {
      keycloak: APPROVED_IMAGE_DIGESTS.keycloak,
      sambaBase: APPROVED_IMAGE_DIGESTS.sambaBase,
    },
    ...overrides,
  };
}

function signPayload<T extends AuthorizationPayload | StartAuthorizationPayload>(payload: T): SignedAuthorizationEnvelope<T> {
  const signature = cryptoSign(null, Buffer.from(canonicalizePayload(payload), 'utf8'), testPrivKey);
  return { payload, signatureBase64: signature.toString('base64') };
}

function validControls(overrides: Partial<CompensatingControlSnapshot> = {}): CompensatingControlSnapshot {
  return {
    keycloakImageDigest: APPROVED_IMAGE_DIGESTS.keycloak,
    sambaBaseImageDigest: APPROVED_IMAGE_DIGESTS.sambaBase,
    keycloakRuntimeImageId: 'sha256:4938c322f47d3736c580fc57bb335d35c784489bc7e6d8fbbd52dbdd1b27e72e',
    sambaRuntimeImageId: `sha256:${'b'.repeat(64)}`,
    internalNetworkOnly: true,
    noPublishedPorts: true,
    egressIsolationVerified: true,
    syntheticDataOnly: true,
    targetEndpoints: ['https://127.0.0.1:38443', 'https://127.0.0.1:38444', 'ldaps://directory:636'],
    noProductionSecrets: true,
    containerPrivilegeRestrictionsIntact: true,
    teardownVerified: true,
    ...overrides,
  };
}

const execution = { commit: 'a'.repeat(40), id: 'test-run-1' };
const activity = 'day14-synthetic-simulation';

function startDecision(payload: AuthorizationPayload): StartAuthorizationPayload {
  return {
    purpose: 'aiit-day14-start-v1',
    exceptionPayloadSha256: createHash('sha256').update(canonicalizePayload(payload)).digest('hex'),
    approver: payload.approver,
    activity,
    authorizedAtUtc: '2026-11-23T10:05:00Z',
    commit: execution.commit,
    executionId: execution.id,
  };
}

function validContext(overrides: Partial<PreflightContext> = {}): PreflightContext {
  const envelope = overrides.envelope === undefined ? signPayload(validPayload()) : overrides.envelope;
  return {
    envelope,
    startEnvelope: envelope ? signPayload(startDecision(envelope.payload)) : undefined,
    execution,
    revokedExceptionIds: [],
    trustedPublicKeyPem: testPublicKeyPem,
    trustedApprovers: ['test-owner@example.test'],
    intendedActivity: activity,
    currentBranch: REQUIRED_BRANCH,
    controls: validControls(),
    scannedSambaImageId: `sha256:${'b'.repeat(64)}`,
    nowUtcMs: NOW_UTC_MS,
    clockTrustMode: 'test-injected',
    ...overrides,
  };
}

test('Day 14 authorization preflight: positive test with test-only signed fixture', () => {
  const result = evaluateDay14Preflight(validContext());
  assert.equal(result.allowed, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.expiresAtUtc, '2026-12-07T10:00:00.000Z');
  assert.ok((result.remainingMs ?? 0) > 0);
});

test('Day 14 authorization preflight: live unapproved repository configuration denies by default', () => {
  const live = runLivePreflight(activity);
  assert.equal(live.allowed, false);
  assert.ok(live.reasons.some(r => r.includes('Missing signed authorization approval record')));
});

test('Day 14 authorization preflight: all 18 mandatory negative cases fail closed', async t => {
  await t.test('1. No approval record', () => {
    const res = evaluateDay14Preflight(validContext({ envelope: null }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('Missing signed authorization approval record')));
  });

  await t.test('2. Pending approval', () => {
    const res = evaluateDay14Preflight(validContext({ envelope: signPayload(validPayload({ status: 'PENDING APPROVAL' })) }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('PENDING APPROVAL')));
  });

  await t.test('3. Invalid approval evidence (tampered signature)', () => {
    const env = signPayload(validPayload());
    env.signatureBase64 = Buffer.from('tampered-signature').toString('base64');
    const res = evaluateDay14Preflight(validContext({ envelope: env }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('Cryptographic signature verification failed')));
  });

  await t.test('4. Unknown approver', () => {
    const res = evaluateDay14Preflight(validContext({ envelope: signPayload(validPayload({ approver: 'unknown@example.test' })) }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('not in the trusted approver list')));
  });

  await t.test('5. Missing mandatory acknowledgement', () => {
    const acks = allAcknowledgements();
    acks.production_remains_no_go = false;
    const res = evaluateDay14Preflight(validContext({ envelope: signPayload(validPayload({ acknowledgements: acks })) }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('production_remains_no_go')));
  });

  await t.test('6. Missing approval timestamp', () => {
    const res = evaluateDay14Preflight(validContext({ envelope: signPayload(validPayload({ approvedAtUtc: '' })) }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('Missing or malformed UTC approval timestamp')));
  });

  await t.test('7. Malformed timestamp (non-UTC offset rejected)', () => {
    const res = evaluateDay14Preflight(validContext({ envelope: signPayload(validPayload({ approvedAtUtc: '2026-11-23T10:00:00+06:00' })) }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('Missing or malformed UTC approval timestamp')));
  });

  await t.test('8. Future approval timestamp', () => {
    const res = evaluateDay14Preflight(validContext({ envelope: signPayload(validPayload({ approvedAtUtc: '2026-11-23T13:00:00Z' })) }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('in the future')));
  });

  await t.test('9. Expired 14-day authorization', () => {
    const res = evaluateDay14Preflight(validContext({ nowUtcMs: Date.parse('2026-12-07T10:00:00Z') }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('has expired')));
  });

  await t.test('10. Validity longer than 336 hours', () => {
    const res = evaluateDay14Preflight(validContext({
      envelope: signPayload(validPayload({ expiresAtUtc: '2026-12-07T10:00:01Z' })),
    }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('exceeds maximum 336 hours')));
  });

  await t.test('11. Revoked exception', () => {
    const res = evaluateDay14Preflight(validContext({ envelope: signPayload(validPayload({ revoked: true })) }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('has been revoked')));
  });

  await t.test('12. Wrong exception ID', () => {
    const res = evaluateDay14Preflight(validContext({ envelope: signPayload(validPayload({ exceptionId: 'AIIT-SYNTH-EXC-999' })) }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('Invalid exception ID')));
  });

  await t.test('13. Changed image digest', () => {
    const res = evaluateDay14Preflight(validContext({
      controls: validControls({ keycloakImageDigest: 'quay.io/keycloak/keycloak:26.8.2@sha256:0000' }),
    }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('Keycloak image digest does not match')));
  });

  await t.test('14. Unauthorized corporate endpoint', () => {
    const res = evaluateDay14Preflight(validContext({
      controls: validControls({ targetEndpoints: ['https://127.0.0.1:38443', 'ldaps://ad.corp.upstra.com:636'] }),
    }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('Unauthorized non-synthetic or corporate endpoint')));
  });

  await t.test('15. Missing required isolation control', () => {
    const res = evaluateDay14Preflight(validContext({
      controls: validControls({ internalNetworkOnly: false, egressIsolationVerified: false }),
    }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('internal Docker network isolation')));
    assert.ok(res.reasons.some(r => r.includes('egress isolation')));
  });

  await t.test('16. Missing separate Day 14 authorization', () => {
    const res = evaluateDay14Preflight(validContext({
      startEnvelope: undefined,
    }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes('Separate Day 14 start authorization')));
  });

  await t.test('17. Wrong Git branch', () => {
    const res = evaluateDay14Preflight(validContext({ currentBranch: 'main' }));
    assert.equal(res.allowed, false);
    assert.ok(res.reasons.some(r => r.includes("Active Git branch must be 'development'")));
  });

  await t.test('18. Incorrect or missing trusted authorization data (missing public key / unverified GitHub env)', () => {
    const noKey = evaluateDay14Preflight(validContext({ trustedPublicKeyPem: null }));
    assert.equal(noKey.allowed, false);
    assert.ok(noKey.reasons.some(r => r.includes('Missing trusted verification key')));

    const noGhEnv = evaluateDay14Preflight(validContext({
      envelope: signPayload(validPayload({ approvalMechanism: 'github-protected-environment' })),
      githubProtectedEnvironmentVerified: false,
    }));
    assert.equal(noGhEnv.allowed, false);
    assert.ok(noGhEnv.reasons.some(r => r.includes('GitHub protected environment reviewer attestation')));
  });
});

test('Verifier rejects a replacement public key and non-Ed25519 keys', () => {
  for (const type of ['ed25519', 'ed448'] as const) {
    const { publicKey } = type === 'ed25519' ? generateKeyPairSync('ed25519') : generateKeyPairSync('ed448');
    const trustedPublicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    assert.equal(evaluateDay14Preflight(validContext({ trustedPublicKeyPem })).allowed, false);
  }
});

test('Signed scope, approver and mechanism are covered by Ed25519', () => {
  const edits: Partial<AuthorizationPayload>[] = [
    { permittedScopes: [activity] },
    { approver: 'another-owner@example.test' },
    { approvalMechanism: 'github-protected-environment' },
  ];
  for (const edit of edits) {
    const original = signPayload(validPayload());
    const envelope = { ...original, payload: { ...original.payload, ...edit } };
    const result = evaluateDay14Preflight(validContext({
      envelope,
      trustedApprovers: [envelope.payload.approver],
      githubProtectedEnvironmentVerified: true,
    }));
    assert.equal(result.allowed, false);
    assert.ok(result.reasons.some(reason => reason.includes('Cryptographic signature verification failed')));
  }
});

test('Impossible and noncanonical timestamps and nonpositive validity periods fail closed', () => {
  for (const edit of [
    { approvedAtUtc: '2026-11-31T10:00:00Z' },
    { approvedAtUtc: '2026-11-23T10:00:00.0Z' },
    { approvedAtUtc: '2026-11-22T24:00:00Z' },
    { approvedAtUtc: '2026-11-23T10:00:60Z' },
    { expiresAtUtc: '2026-11-23T10:00:00Z' },
    { expiresAtUtc: '2026-11-23T09:59:59Z' },
  ]) {
    assert.equal(evaluateDay14Preflight(validContext({ envelope: signPayload(validPayload(edit)) })).allowed, false);
  }
  assert.equal(evaluateDay14Preflight(validContext({ nowUtcMs: NaN })).allowed, false);
  assert.equal(evaluateDay14Preflight(validContext({ clockTrustMode: undefined })).allowed, false);
});

test('A valid signed record cannot override authoritative revocation or missing revocation state', () => {
  for (const revokedExceptionIds of [[EXCEPTION_ID], undefined]) {
    assert.equal(evaluateDay14Preflight(validContext({ revokedExceptionIds })).allowed, false);
  }
});

test('Start decision requires a valid signature, later timestamp and matching execution and exception', () => {
  const payload = validPayload();
  const start = signPayload(startDecision(payload));
  for (const startEnvelope of [
    { ...start, payload: { ...start.payload, authorizedAtUtc: '2026-11-23T10:06:00Z' } },
    signPayload({ ...start.payload, authorizedAtUtc: payload.approvedAtUtc }),
    signPayload({ ...start.payload, authorizedAtUtc: '2026-11-23T13:00:00Z' }),
    signPayload({ ...start.payload, executionId: 'other-run' }),
    signPayload({ ...start.payload, commit: 'b'.repeat(40) }),
    signPayload({ ...start.payload, exceptionPayloadSha256: '0'.repeat(64) }),
  ]) {
    assert.equal(evaluateDay14Preflight(validContext({ startEnvelope })).allowed, false);
  }
});

test('Runtime gate rejects changed network or image, missing probes and unverified data or secrets', () => {
  const changes: Partial<CompensatingControlSnapshot>[] = [
    { internalNetworkOnly: false },
    { noPublishedPorts: false },
    { sambaBaseImageDigest: '' },
    { keycloakRuntimeImageId: '' },
    { sambaRuntimeImageId: `sha256:${'c'.repeat(64)}` },
    { egressIsolationVerified: false },
    { syntheticDataOnly: false },
    { noProductionSecrets: false },
    { teardownVerified: false },
    { targetEndpoints: ['https://172.16.0.2:443'] },
  ];
  for (const change of changes) {
    assert.equal(evaluateDay14Preflight(validContext({ controls: validControls(change) })).allowed, false);
  }
});

test('Reevaluation denies at the expiry boundary even after a successful earlier check', () => {
  const context = validContext();
  const expiry = Date.parse(context.envelope!.payload.expiresAtUtc);
  assert.equal(evaluateDay14Preflight({ ...context, nowUtcMs: expiry - 1 }).allowed, true);
  assert.equal(evaluateDay14Preflight({ ...context, nowUtcMs: expiry }).allowed, false);
  assert.equal(evaluateDay14Preflight({ ...context, nowUtcMs: expiry + 1 }).allowed, false);
});

test('Direct entry rejects caller branch labels and unrecognized activity', () => {
  const root = mkdtempSync(join(tmpdir(), 'aiit-preflight-test-'));
  try {
    const folder = join(root, 'scripts', 'synthetic');
    mkdirSync(folder, { recursive: true });
    const script = join(folder, 'day14-preflight.ts');
    copyFileSync(new URL('../scripts/synthetic/day14-preflight.ts', import.meta.url), script);
    const env = { PATH: process.env.PATH, AIIT_GIT_BRANCH: REQUIRED_BRANCH };
    assert.equal(spawnSync('git', ['init', '-q', '-b', 'fixture'], { cwd: root, env }).status, 0);
    const result = spawnSync(process.execPath, [script, 'unknown-scope'], { env, encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    const preflight = JSON.parse(result.stdout);
    assert.equal(preflight.allowed, false);
    assert.ok(preflight.reasons.some((reason: string) => reason.includes('Active Git ref')));
    assert.ok(preflight.reasons.some((reason: string) => reason.includes('outside permitted')));
    assert.ok(preflight.reasons.some((reason: string) => reason.includes('Environment protection')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function supervisorFixture() {
  const request = { ...execution, activity };
  const events: string[] = [];
  const evidence = { ...validContext(), owner: 'test-owner@example.test' };
  const dependencies: SupervisionDependencies = {
    authority: {
      read: async () => evidence,
      consume: async () => true,
    },
    open: () => ({
      provision: async () => { events.push('provision'); },
      inspect: async () => validControls(),
      run: async () => { events.push('run'); },
      stopAndRemove: async () => { events.push('cleanup'); },
    }),
    audit: async event => { events.push(event.outcome); },
  };
  return { request, evidence, dependencies, events };
}

test('Supervisor rejects unavailable, invalid, changed and unauthorized evidence before workload', async () => {
  const fixture = supervisorFixture();
  assert.equal((await superviseDay14(fixture.request)).outcome, 'authority-unconfigured');
  for (const change of ['clock', 'revoked', 'expired', 'signature', 'commit', 'scope', 'registry'] as const) {
    const { request, evidence, dependencies, events } = supervisorFixture();
    if (change === 'clock') evidence.nowUtcMs = undefined;
    if (change === 'revoked') evidence.revokedExceptionIds = [EXCEPTION_ID];
    if (change === 'expired') evidence.nowUtcMs = Date.parse(evidence.envelope!.payload.expiresAtUtc);
    if (change === 'signature') evidence.envelope!.signatureBase64 = '';
    if (change === 'commit') request.commit = 'b'.repeat(40);
    if (change === 'scope') request.activity = 'day14-full-office-load';
    if (change === 'registry') dependencies.authority.consume = async () => { throw new Error('offline'); };
    assert.equal((await superviseDay14(request, dependencies)).allowed, false, change);
    assert.ok(!events.includes('provision'), change);
  }
  const { request, dependencies, events } = supervisorFixture();
  const open = dependencies.open;
  dependencies.open = value => ({ ...open(value), inspect: async () => validControls({ sambaRuntimeImageId: '' }) });
  assert.equal((await superviseDay14(request, dependencies)).outcome, 'runtime-controls-denied');
  assert.ok(events.includes('cleanup'));
  assert.ok(!events.includes('run'));
});

test('Supervisor terminates a harmless process on expiry or observed revocation and never releases the claim', async () => {
  for (const condition of ['expiry', 'revocation'] as const) {
    const { request, evidence, dependencies, events } = supervisorFixture();
    if (condition === 'expiry') evidence.nowUtcMs = Date.parse(evidence.envelope!.payload.expiresAtUtc) - 500;
    let claimed = false;
    dependencies.authority.consume = async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    };
    const open = dependencies.open;
    dependencies.open = value => ({
      ...open(value),
      run: async signal => {
        events.push('run');
        if (condition === 'revocation') evidence.revokedExceptionIds = [EXCEPTION_ID];
        await runIsolatedProcess(process.execPath, ['-e', 'setInterval(() => {}, 100)'], tmpdir(), signal);
      },
    });
    const result = await superviseDay14(request, dependencies);
    assert.equal(result.allowed, false);
    assert.equal(result.outcome, condition === 'expiry' ? 'authorization-expired' : 'authorization-recheck-failed');
    assert.equal(result.cleanup, 'verified');
    assert.ok(events.includes('run'));
    evidence.revokedExceptionIds = [];
    assert.equal((await superviseDay14(request, dependencies)).outcome, 'claim-failed');
    assert.equal(events.filter(event => event === 'run').length, 1);
  }
});

test('Supervisor records a teardown failure after partial setup', async () => {
  const { request, dependencies, events } = supervisorFixture();
  const open = dependencies.open;
  dependencies.open = value => ({
    ...open(value),
    provision: async () => { throw new Error('partial setup'); },
    stopAndRemove: async () => { throw new Error('cleanup failed'); },
  });
  assert.deepEqual(await superviseDay14(request, dependencies),
    { allowed: false, outcome: 'teardown-failed', cleanup: 'failed' });
  assert.ok(events.includes('teardown-failed'));
});

test('Runtime collector checks effective Docker observations, probes, fixture bytes and credentials', async () => {
  const good = validControls();
  const observation: ContainerObservation = {
    Id: 'issuer', Image: good.keycloakRuntimeImageId, State: { Running: true },
    HostConfig: {
      Privileged: false, NetworkMode: 'isolated', PidMode: '', IpcMode: 'private', UsernsMode: '',
      CapAdd: null, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true'],
      Memory: 1536 * 1024 ** 2, Devices: [], PortBindings: null,
    },
    Config: { Env: ['PASSWORD=fixture'] }, Mounts: [],
    NetworkSettings: { Networks: { isolated: { NetworkID: 'net' } }, Ports: { '443/tcp': null } },
  };
  const fixtureBytes = Buffer.from('fictional data');
  const expected = { expectedMounts: [], expectedEnvironment: ['PASSWORD=fixture'] };
  const plan = {
    networkId: 'net', containers: [
      { ...expected, id: 'issuer', role: 'keycloak' as const },
      { ...expected, id: 'directory', role: 'samba' as const },
    ],
    keycloakImageDigest: good.keycloakImageDigest, sambaBaseImageDigest: good.sambaBaseImageDigest,
    fixtureBytes, expectedFixtureSha256: createHash('sha256').update(fixtureBytes).digest('hex'),
    targetEndpoints: good.targetEndpoints, teardownReady: true,
  };
  const network = { Id: 'net', Internal: true, Driver: 'bridge', Containers: { issuer: {}, directory: {} } };
  const source = {
    inspectNetwork: async () => network,
    inspectContainer: async (id: string) => ({
      ...observation, Id: id, Image: id === 'issuer' ? good.keycloakRuntimeImageId : good.sambaRuntimeImageId,
    }),
    probe: async () => 'blocked' as const,
  };
  const signal = new AbortController().signal;
  assert.deepEqual(await collectRuntimeEvidence(source, plan, signal), good);
  network.Internal = false;
  observation.Config.Env.push('UNEXPECTED=fixture');
  observation.NetworkSettings.Ports = { '443/tcp': [{ HostPort: '443' }] };
  const changed = await collectRuntimeEvidence({ ...source, probe: async () => 'indeterminate' },
    { ...plan, fixtureBytes: Buffer.from('changed') }, signal);
  assert.equal(changed.internalNetworkOnly, false);
  assert.equal(changed.noProductionSecrets, false);
  assert.equal(changed.noPublishedPorts, false);
  assert.equal(changed.egressIsolationVerified, false);
  assert.equal(changed.syntheticDataOnly, false);
});

test('PostgreSQL registry atomically consumes once and rejects replay, expiry and revoked claims', {
  skip: process.env.DB_REQUIRED !== 'true' && !postgresBinaries(),
}, async () => {
  const cluster = await disposablePostgres();
  const { PrismaClient } = await import('@prisma/client');
  const client = new PrismaClient({ datasourceUrl: cluster.url });
  try {
    const schema = readFileSync(new URL('../infra/synthetic-authorization/registry.sql', import.meta.url), 'utf8');
    for (const statement of schema.split(';').filter(sql => sql.trim())) await client.$executeRawUnsafe(statement);
    const fingerprint = 'a'.repeat(64);
    const expiresAtUtc = new Date(Date.now() + 60_000).toISOString();
    const expired = new Date(Date.now() - 60_000).toISOString();
    await client.$executeRaw`INSERT INTO day14_authority.exceptions (exception_id) VALUES (${EXCEPTION_ID})`;
    const claims = [['once', expiresAtUtc], ['revoked', expiresAtUtc], ['expired', expired], ['blocked', expiresAtUtc]];
    for (const [id, expiry] of claims) {
      await client.$executeRaw`INSERT INTO day14_authority.execution_claims (exception_id, execution_id, fingerprint, expires_at)
        VALUES (${EXCEPTION_ID}, ${id}, ${fingerprint}, ${expiry}::timestamptz)`;
    }
    await client.$executeRaw`UPDATE day14_authority.execution_claims SET revoked_at = clock_timestamp()
      WHERE execution_id = 'revoked'`;
    const signal = new AbortController().signal;
    const claim = (id: string, expiry = expiresAtUtc, digest = fingerprint) => consumeExecution(
      (sql, params) => client.$queryRawUnsafe(sql, ...params), { id, fingerprint: digest, expiresAtUtc: expiry }, signal,
    );
    assert.equal(await claim('once', expiresAtUtc, 'b'.repeat(64)), false);
    assert.deepEqual((await Promise.all([claim('once'), claim('once')])).sort(), [false, true]);
    assert.equal(await claim('once'), false);
    assert.equal(await claim('expired', expired), false);
    assert.equal(await claim('revoked'), false);
    assert.equal(await claim('unknown'), false);
    await client.$executeRaw`UPDATE day14_authority.exceptions SET revoked_at = clock_timestamp()
      WHERE exception_id = ${EXCEPTION_ID}`;
    assert.equal(await claim('blocked'), false);
  } finally {
    await client.$disconnect();
    cluster.close();
  }
});
