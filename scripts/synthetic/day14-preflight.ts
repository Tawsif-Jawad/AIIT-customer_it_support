import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const EXCEPTION_ID = 'AIIT-SYNTH-EXC-001' as const;
export const MAX_VALIDITY_HOURS = 336;
export const MAX_VALIDITY_MS = MAX_VALIDITY_HOURS * 60 * 60 * 1000;
export const REQUIRED_BRANCH = 'development' as const;

export const APPROVED_IMAGE_DIGESTS = {
  keycloak: 'quay.io/keycloak/keycloak:26.8.2@sha256:7e66a96e4739239070aeaf72e4c5decf0f7f682cfc725b9f7ea2b336eaba38b3',
  sambaBase: 'debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2',
} as const;

const KEYCLOAK_AMD64_IMAGE_ID = 'sha256:4938c322f47d3736c580fc57bb335d35c784489bc7e6d8fbbd52dbdd1b27e72e';
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;

export const PERMITTED_SCOPES = [
  'day14-synthetic-simulation',
  'day14-full-office-load',
  'day14-synthetic-performance',
  'day14-enterprise-stress',
] as const;

export type PermittedScope = (typeof PERMITTED_SCOPES)[number];

export const MANDATORY_ACKNOWLEDGEMENTS = [
  'vulnerability_scan_remains_failing',
  'day13_remains_partial',
  'production_remains_no_go',
  'isolated_synthetic_testing_only',
  'expires_after_14_days_no_auto_renewal',
  'day14_requires_separate_authorization',
] as const;

export type MandatoryAcknowledgement = (typeof MANDATORY_ACKNOWLEDGEMENTS)[number];

export interface AuthorizationPayload {
  exceptionId: string;
  status: string;
  approver: string;
  approvalMechanism: 'signed-owner-record' | 'github-protected-environment';
  approvedAtUtc: string;
  expiresAtUtc: string;
  revoked: boolean;
  revokedAtUtc?: string | null;
  acknowledgements: Record<string, boolean>;
  permittedScopes: string[];
  approvedImages: {
    keycloak: string;
    sambaBase: string;
  };
}

export interface StartAuthorizationPayload {
  purpose: 'aiit-day14-start-v1';
  exceptionPayloadSha256: string;
  approver: string;
  activity: string;
  authorizedAtUtc: string;
  commit: string;
  executionId: string;
}

export interface SignedAuthorizationEnvelope<T = AuthorizationPayload> {
  payload: T;
  signatureBase64: string;
}

export interface CompensatingControlSnapshot {
  keycloakImageDigest: string;
  sambaBaseImageDigest: string;
  keycloakRuntimeImageId: string;
  sambaRuntimeImageId: string;
  internalNetworkOnly: boolean;
  noPublishedPorts: boolean;
  egressIsolationVerified: boolean;
  syntheticDataOnly: boolean;
  targetEndpoints: string[];
  noProductionSecrets: boolean;
  containerPrivilegeRestrictionsIntact: boolean;
  teardownVerified: boolean;
}

export interface PreflightContext {
  envelope: SignedAuthorizationEnvelope | null;
  startEnvelope?: SignedAuthorizationEnvelope<StartAuthorizationPayload>;
  execution?: { commit: string; id: string };
  trustedPublicKeyPem: string | null;
  trustedApprovers: readonly string[];
  revokedExceptionIds?: readonly string[];
  intendedActivity: string;
  currentBranch: string;
  controls: CompensatingControlSnapshot;
  scannedSambaImageId?: string;
  nowUtcMs?: number;
  clockTrustMode?: 'ci-runner-utc' | 'local-signed-attestation' | 'test-injected';
  githubProtectedEnvironmentVerified?: boolean;
}

export interface PreflightResult {
  allowed: boolean;
  reasons: string[];
  checkedAtUtc: string;
  expiresAtUtc?: string;
  remainingMs?: number;
}

const STRICT_ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const ALLOWED_SYNTHETIC_ENDPOINTS = new Set([
  'https://127.0.0.1:38443',
  'https://127.0.0.1:38444',
  'ldaps://directory:636',
]);

export function canonicalizePayload(payload: AuthorizationPayload | StartAuthorizationPayload): string {
  const sortValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortValue);
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return Object.fromEntries(Object.keys(record).sort().map(key => [key, sortValue(record[key])]));
    }
    return value;
  };
  return JSON.stringify(sortValue(payload));
}

function parseStrictUtcMs(value: unknown): number | null {
  if (typeof value !== 'string' || !STRICT_ISO_UTC.test(value)) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = value.includes('.') ? value : value.replace(/Z$/, '.000Z');
  return new Date(parsed).toISOString() === normalized ? parsed : null;
}

export function verifySignedEnvelope(
  envelope: SignedAuthorizationEnvelope<AuthorizationPayload | StartAuthorizationPayload>,
  trustedPublicKeyPem: string,
): boolean {
  try {
    const publicKey = createPublicKey(trustedPublicKeyPem);
    const message = Buffer.from(canonicalizePayload(envelope.payload), 'utf8');
    const signature = Buffer.from(envelope.signatureBase64, 'base64');
    if (publicKey.asymmetricKeyType !== 'ed25519' || signature.length !== 64 ||
        signature.toString('base64') !== envelope.signatureBase64) return false;
    return cryptoVerify(null, message, publicKey, signature);
  } catch {
    return false;
  }
}

export function evaluateDay14Preflight(context: PreflightContext): PreflightResult {
  const clock = new Date(context.nowUtcMs ?? NaN);
  if (!context.clockTrustMode || !Number.isFinite(clock.getTime())) {
    return { allowed: false, reasons: ['Trusted UTC time is unavailable.'], checkedAtUtc: new Date().toISOString() };
  }
  const nowMs = clock.getTime();
  const checkedAtUtc = clock.toISOString();
  const reasons: string[] = [];

  if (context.currentBranch !== REQUIRED_BRANCH) {
    reasons.push(`Active Git branch must be '${REQUIRED_BRANCH}'; found '${context.currentBranch || 'unknown'}'.`);
  }

  if (!PERMITTED_SCOPES.includes(context.intendedActivity as PermittedScope)) {
    reasons.push(`Intended activity '${context.intendedActivity}' is outside permitted Day 14 synthetic scopes.`);
  }

  if (!context.envelope || typeof context.envelope !== 'object' || !context.envelope.payload) {
    reasons.push('Missing signed authorization approval record (default DENY).');
    return { allowed: false, reasons, checkedAtUtc };
  }

  const { payload, signatureBase64 } = context.envelope;

  if (payload.exceptionId !== EXCEPTION_ID) {
    reasons.push(`Invalid exception ID '${String(payload.exceptionId)}'; expected '${EXCEPTION_ID}'.`);
  }

  if (payload.status !== 'APPROVED') {
    reasons.push(`Exception status is '${String(payload.status)}'; explicit APPROVED status is required.`);
  }

  if (payload.revoked !== false || payload.revokedAtUtc != null || context.revokedExceptionIds?.includes(payload.exceptionId)) {
    reasons.push('Exception has been revoked.');
  }

  if (!context.revokedExceptionIds) {
    reasons.push('Current revocation state is unavailable.');
  }

  if (!context.trustedApprovers.includes(payload.approver)) {
    reasons.push(`Approver '${String(payload.approver)}' is not in the trusted approver list.`);
  }

  if (payload.approvalMechanism === 'github-protected-environment') {
    if (!context.githubProtectedEnvironmentVerified) {
      reasons.push('GitHub protected environment reviewer attestation is not verified.');
    }
  } else if (payload.approvalMechanism !== 'signed-owner-record') {
    reasons.push(`Unsupported approval mechanism '${String(payload.approvalMechanism)}'.`);
  }

  if (!context.trustedPublicKeyPem || typeof signatureBase64 !== 'string' || !signatureBase64.trim()) {
    reasons.push('Missing trusted verification key or cryptographic approval signature.');
  } else if (!verifySignedEnvelope(context.envelope, context.trustedPublicKeyPem)) {
    reasons.push('Cryptographic signature verification failed for approval record.');
  }

  for (const ack of MANDATORY_ACKNOWLEDGEMENTS) {
    if (payload.acknowledgements?.[ack] !== true) {
      reasons.push(`Missing mandatory owner acknowledgement: '${ack}'.`);
    }
  }

  const approvedMs = parseStrictUtcMs(payload.approvedAtUtc);
  const expiresMs = parseStrictUtcMs(payload.expiresAtUtc);

  if (approvedMs === null) {
    reasons.push('Missing or malformed UTC approval timestamp (expected ISO-8601 Z format).');
  }
  if (expiresMs === null) {
    reasons.push('Missing or malformed UTC expiration timestamp (expected ISO-8601 Z format).');
  }

  let remainingMs: number | undefined;
  if (approvedMs !== null && expiresMs !== null) {
    if (approvedMs > nowMs) {
      reasons.push('Approval timestamp is in the future relative to the trusted UTC clock.');
    }
    const durationMs = expiresMs - approvedMs;
    if (durationMs <= 0) {
      reasons.push('Expiration timestamp must be strictly after approval timestamp.');
    } else if (durationMs > MAX_VALIDITY_MS) {
      reasons.push(`Approval validity exceeds maximum ${MAX_VALIDITY_HOURS} hours (14 days).`);
    }
    remainingMs = expiresMs - nowMs;
    if (nowMs >= expiresMs) {
      reasons.push('Exception authorization has expired.');
    }
  }

  if (!Array.isArray(payload.permittedScopes) || !payload.permittedScopes.includes(context.intendedActivity)) {
    reasons.push(`Activity '${context.intendedActivity}' is not listed in the signed permittedScopes.`);
  }

  const start = context.startEnvelope?.payload;
  const startMs = parseStrictUtcMs(start?.authorizedAtUtc);
  if (!start || !context.startEnvelope) {
    reasons.push('Separate Day 14 start authorization is missing.');
  } else if (
    start.purpose !== 'aiit-day14-start-v1' ||
    start.approver !== payload.approver ||
    start.activity !== context.intendedActivity ||
    !context.execution || !/^[0-9a-f]{40}$/.test(context.execution.commit) || !context.execution.id ||
    start.commit !== context.execution.commit || start.executionId !== context.execution.id ||
    start.exceptionPayloadSha256 !== createHash('sha256').update(canonicalizePayload(payload)).digest('hex') ||
    startMs === null || approvedMs === null || expiresMs === null ||
    startMs <= approvedMs || startMs > nowMs || startMs >= expiresMs ||
    !context.trustedPublicKeyPem || !verifySignedEnvelope(context.startEnvelope, context.trustedPublicKeyPem)
  ) {
    reasons.push('Separate Day 14 start authorization does not match the signed exception, execution, or validity window.');
  }

  if (
    payload.approvedImages?.keycloak !== APPROVED_IMAGE_DIGESTS.keycloak ||
    context.controls.keycloakImageDigest !== APPROVED_IMAGE_DIGESTS.keycloak
  ) {
    reasons.push('Keycloak image digest does not match the approved immutable digest.');
  }

  if (
    payload.approvedImages?.sambaBase !== APPROVED_IMAGE_DIGESTS.sambaBase ||
    context.controls.sambaBaseImageDigest !== APPROVED_IMAGE_DIGESTS.sambaBase
  ) {
    reasons.push('Samba base image digest does not match the approved immutable digest.');
  }

  if (context.controls.keycloakRuntimeImageId !== KEYCLOAK_AMD64_IMAGE_ID) {
    reasons.push('Effective Keycloak image ID does not match the reviewed amd64 image.');
  }
  if (!context.scannedSambaImageId || !IMAGE_ID.test(context.scannedSambaImageId) ||
      context.controls.sambaRuntimeImageId !== context.scannedSambaImageId) {
    reasons.push('Effective Samba image ID does not match the trusted scan evidence.');
  }

  if (context.controls.internalNetworkOnly !== true) {
    reasons.push('Compensating control failed: internal Docker network isolation is not verified.');
  }
  if (context.controls.noPublishedPorts !== true) {
    reasons.push('Compensating control failed: container port publishing is not restricted.');
  }
  if (context.controls.egressIsolationVerified !== true) {
    reasons.push('Compensating control failed: IPv4/IPv6/DNS egress isolation is not verified.');
  }
  if (context.controls.syntheticDataOnly !== true) {
    reasons.push('Compensating control failed: environment is not verified as synthetic-data-only.');
  }
  if (context.controls.noProductionSecrets !== true) {
    reasons.push('Compensating control failed: production secrets exclusion is not verified.');
  }
  if (context.controls.containerPrivilegeRestrictionsIntact !== true) {
    reasons.push('Compensating control failed: container privilege restrictions are not intact.');
  }
  if (context.controls.teardownVerified !== true) {
    reasons.push('Compensating control failed: synthetic teardown verification is missing.');
  }

  if (!Array.isArray(context.controls.targetEndpoints) || context.controls.targetEndpoints.length === 0) {
    reasons.push('Compensating control failed: explicit synthetic target endpoints must be declared.');
  } else {
    for (const endpoint of context.controls.targetEndpoints) {
      if (!ALLOWED_SYNTHETIC_ENDPOINTS.has(endpoint)) {
        reasons.push(`Unauthorized non-synthetic or corporate endpoint detected: '${endpoint}'.`);
      }
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    checkedAtUtc,
    expiresAtUtc: expiresMs !== null ? new Date(expiresMs).toISOString() : undefined,
    remainingMs,
  };
}

export function runLivePreflight(intendedActivity: string): PreflightResult {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  let currentRef = '';
  try {
    currentRef = execFileSync('git', ['symbolic-ref', '--quiet', 'HEAD'], {
      cwd: repoRoot,
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // Detached checkouts and Git failures leave the local ref unverified.
  }

  const reasons = [
    'Missing signed authorization approval record from an owner-controlled source.',
    'Deployment authorization blocked: GitHub Environment protection and owner trust configuration are unverified.',
    'Current revocation state, trusted UTC time and effective runtime controls are unavailable.',
  ];
  if (currentRef !== `refs/heads/${REQUIRED_BRANCH}`) {
    reasons.push(`Active Git ref must be 'refs/heads/${REQUIRED_BRANCH}'.`);
  }
  if (!(PERMITTED_SCOPES as readonly string[]).includes(intendedActivity)) {
    reasons.push('Intended activity is outside permitted Day 14 synthetic scopes.');
  }
  // Live callers cannot supply the trust inputs used by the offline verifier.
  return { allowed: false, reasons, checkedAtUtc: new Date().toISOString() };
}

if (import.meta.main) {
  const activity = process.argv[2] ?? 'day14-synthetic-simulation';
  const result = runLivePreflight(activity);
  console.log(JSON.stringify(result, null, 2));
  if (!result.allowed) {
    process.exitCode = 1;
  }
}
