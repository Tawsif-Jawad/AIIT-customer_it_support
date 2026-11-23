import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import test from 'node:test';
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
    day14StartAuthorized: true,
    day14StartAuthorizedAtUtc: '2026-11-23T10:05:00Z',
    ...overrides,
  };
}

function signPayload(payload: AuthorizationPayload): SignedAuthorizationEnvelope {
  const signature = cryptoSign(null, Buffer.from(canonicalizePayload(payload), 'utf8'), testPrivKey);
  return { payload, signatureBase64: signature.toString('base64') };
}

function validControls(overrides: Partial<CompensatingControlSnapshot> = {}): CompensatingControlSnapshot {
  return {
    keycloakImageDigest: APPROVED_IMAGE_DIGESTS.keycloak,
    sambaBaseImageDigest: APPROVED_IMAGE_DIGESTS.sambaBase,
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

function validContext(overrides: Partial<PreflightContext> = {}): PreflightContext {
  return {
    envelope: signPayload(validPayload()),
    trustedPublicKeyPem: testPublicKeyPem,
    trustedApprovers: ['test-owner@example.test'],
    intendedActivity: 'day14-synthetic-simulation',
    currentBranch: REQUIRED_BRANCH,
    controls: validControls(),
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
  const live = runLivePreflight('day14-synthetic-simulation', {
    AIIT_GIT_BRANCH: 'development',
  });
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
      envelope: signPayload(validPayload({ day14StartAuthorized: false })),
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
