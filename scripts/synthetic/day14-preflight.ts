import { execFileSync } from 'node:child_process';
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXCEPTION_ID = 'AIIT-SYNTH-EXC-001' as const;
export const MAX_VALIDITY_HOURS = 336;
export const MAX_VALIDITY_MS = MAX_VALIDITY_HOURS * 60 * 60 * 1000;
export const REQUIRED_BRANCH = 'development' as const;

export const APPROVED_IMAGE_DIGESTS = {
  keycloak: 'quay.io/keycloak/keycloak:26.8.2@sha256:7e66a96e4739239070aeaf72e4c5decf0f7f682cfc725b9f7ea2b336eaba38b3',
  sambaBase: 'debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2',
} as const;

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
  day14StartAuthorized: boolean;
  day14StartAuthorizedAtUtc?: string | null;
}

export interface SignedAuthorizationEnvelope {
  payload: AuthorizationPayload;
  signatureBase64: string;
}

export interface CompensatingControlSnapshot {
  keycloakImageDigest: string;
  sambaBaseImageDigest: string;
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
  trustedPublicKeyPem: string | null;
  trustedApprovers: readonly string[];
  revokedExceptionIds?: readonly string[];
  intendedActivity: string;
  currentBranch: string;
  controls: CompensatingControlSnapshot;
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

const STRICT_ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const ALLOWED_SYNTHETIC_HOST_PATTERNS = [
  /^127\.0\.0\.1(?::\d+)?$/,
  /^localhost(?::\d+)?$/,
  /^\[::1\](?::\d+)?$/,
  /^directory(?::\d+)?$/,
  /^issuer(?::\d+)?$/,
  /^[a-z0-9.-]+\.example\.test(?::\d+)?$/i,
  /^172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}(?::\d+)?$/,
];

export function canonicalizePayload(payload: AuthorizationPayload): string {
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
  return Number.isFinite(parsed) ? parsed : null;
}

function isSyntheticEndpoint(endpoint: string): boolean {
  const trimmed = endpoint.trim();
  if (!trimmed) return false;
  let hostPort = trimmed;
  try {
    if (trimmed.includes('://')) {
      const url = new URL(trimmed);
      hostPort = url.port ? `${url.hostname}:${url.port}` : url.hostname;
    }
  } catch {
    return false;
  }
  return ALLOWED_SYNTHETIC_HOST_PATTERNS.some(pattern => pattern.test(hostPort));
}

export function verifySignedEnvelope(
  envelope: SignedAuthorizationEnvelope,
  trustedPublicKeyPem: string,
): boolean {
  try {
    const publicKey = createPublicKey(trustedPublicKeyPem);
    const message = Buffer.from(canonicalizePayload(envelope.payload), 'utf8');
    const signature = Buffer.from(envelope.signatureBase64, 'base64');
    if (signature.length === 0) return false;
    return cryptoVerify(null, message, publicKey, signature);
  } catch {
    return false;
  }
}

export function evaluateDay14Preflight(context: PreflightContext): PreflightResult {
  const nowMs = context.nowUtcMs ?? Date.now();
  const checkedAtUtc = new Date(nowMs).toISOString();
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

  if (payload.revoked || context.revokedExceptionIds?.includes(payload.exceptionId)) {
    reasons.push('Exception has been revoked.');
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

  if (!payload.day14StartAuthorized) {
    reasons.push('Separate Day 14 start authorization is missing or false.');
  } else if (payload.day14StartAuthorizedAtUtc !== undefined && payload.day14StartAuthorizedAtUtc !== null) {
    const startAuthMs = parseStrictUtcMs(payload.day14StartAuthorizedAtUtc);
    if (startAuthMs === null || startAuthMs > nowMs) {
      reasons.push('Separate Day 14 start authorization timestamp is malformed or in the future.');
    }
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

  if (!context.controls.internalNetworkOnly) {
    reasons.push('Compensating control failed: internal Docker network isolation is not verified.');
  }
  if (!context.controls.noPublishedPorts) {
    reasons.push('Compensating control failed: container port publishing is not restricted.');
  }
  if (!context.controls.egressIsolationVerified) {
    reasons.push('Compensating control failed: IPv4/IPv6/DNS egress isolation is not verified.');
  }
  if (!context.controls.syntheticDataOnly) {
    reasons.push('Compensating control failed: environment is not verified as synthetic-data-only.');
  }
  if (!context.controls.noProductionSecrets) {
    reasons.push('Compensating control failed: production secrets exclusion is not verified.');
  }
  if (!context.controls.containerPrivilegeRestrictionsIntact) {
    reasons.push('Compensating control failed: container privilege restrictions are not intact.');
  }
  if (!context.controls.teardownVerified) {
    reasons.push('Compensating control failed: synthetic teardown verification is missing.');
  }

  if (!Array.isArray(context.controls.targetEndpoints) || context.controls.targetEndpoints.length === 0) {
    reasons.push('Compensating control failed: explicit synthetic target endpoints must be declared.');
  } else {
    for (const endpoint of context.controls.targetEndpoints) {
      if (!isSyntheticEndpoint(endpoint)) {
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

export function inspectRepositoryControls(repoRoot: string): CompensatingControlSnapshot {
  const composePath = path.join(repoRoot, 'infra/synthetic-enterprise/compose.yml');
  const fedComposePath = path.join(repoRoot, 'infra/synthetic-enterprise/federation.compose.yml');
  const sambaDockerfilePath = path.join(repoRoot, 'infra/synthetic-enterprise/Samba.Dockerfile');
  const fedScriptPath = path.join(repoRoot, 'infra/synthetic-enterprise/federation.sh');

  const composeText = existsSync(composePath) ? readFileSync(composePath, 'utf8') : '';
  const fedComposeText = existsSync(fedComposePath) ? readFileSync(fedComposePath, 'utf8') : '';
  const sambaText = existsSync(sambaDockerfilePath) ? readFileSync(sambaDockerfilePath, 'utf8') : '';
  const fedScriptText = existsSync(fedScriptPath) ? readFileSync(fedScriptPath, 'utf8') : '';

  const keycloakMatch = composeText.match(/^\s*image:\s*(\S+)\s*$/m);
  const sambaMatch = sambaText.match(/^FROM\s+(\S+)\s*$/m);

  const combinedCompose = `${composeText}\n${fedComposeText}`;
  const internalNetworkOnly = /internal:\s*true/.test(composeText);
  const noPublishedPorts = !/^\s*ports\s*:/m.test(combinedCompose);
  const containerPrivilegeRestrictionsIntact =
    /cap_drop:\s*\[ALL\]/.test(composeText) &&
    /no-new-privileges:true/.test(composeText) &&
    /no-new-privileges:true/.test(fedComposeText) &&
    !/privileged:\s*true/.test(combinedCompose) &&
    !/network_mode:\s*host/.test(combinedCompose);
  const egressIsolationVerified =
    fedScriptText.includes('192.0.2.1') &&
    fedScriptText.includes('2001:db8::1') &&
    fedScriptText.includes('ENETUNREACH');
  const teardownVerified = fedScriptText.includes('dc down --volumes --remove-orphans');

  return {
    keycloakImageDigest: keycloakMatch?.[1] ?? '',
    sambaBaseImageDigest: sambaMatch?.[1] ?? '',
    internalNetworkOnly,
    noPublishedPorts,
    egressIsolationVerified,
    syntheticDataOnly: true,
    targetEndpoints: ['https://127.0.0.1:38443', 'https://127.0.0.1:38444', 'ldaps://directory:636'],
    noProductionSecrets: true,
    containerPrivilegeRestrictionsIntact,
    teardownVerified,
  };
}

export function runLivePreflight(intendedActivity: string, env: NodeJS.ProcessEnv = process.env): PreflightResult {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  let currentBranch = env.AIIT_GIT_BRANCH ?? '';
  if (!currentBranch) {
    try {
      currentBranch = execFileSync('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf8' }).trim();
    } catch {
      currentBranch = '';
    }
  }

  let envelope: SignedAuthorizationEnvelope | null = null;
  const recordPath = env.AIIT_EXCEPTION_APPROVAL_FILE?.trim();
  if (recordPath && existsSync(recordPath)) {
    try {
      envelope = JSON.parse(readFileSync(recordPath, 'utf8')) as SignedAuthorizationEnvelope;
    } catch {
      envelope = null;
    }
  }

  let trustedPublicKeyPem: string | null = null;
  const pubKeyPath = env.AIIT_EXCEPTION_PUBLIC_KEY_FILE?.trim();
  if (pubKeyPath && existsSync(pubKeyPath)) {
    trustedPublicKeyPem = readFileSync(pubKeyPath, 'utf8');
  } else if (env.AIIT_EXCEPTION_PUBLIC_KEY_PEM?.trim()) {
    trustedPublicKeyPem = env.AIIT_EXCEPTION_PUBLIC_KEY_PEM;
  }

  const trustedApprovers = (env.AIIT_EXCEPTION_TRUSTED_APPROVERS ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  const controls = inspectRepositoryControls(repoRoot);
  const githubProtectedEnvironmentVerified =
    env.GITHUB_ACTIONS === 'true' && env.AIIT_PROTECTED_ENV_ATTESTED === 'AIIT-SYNTH-EXC-001';

  return evaluateDay14Preflight({
    envelope,
    trustedPublicKeyPem,
    trustedApprovers,
    intendedActivity,
    currentBranch,
    controls,
    clockTrustMode: env.GITHUB_ACTIONS === 'true' ? 'ci-runner-utc' : 'local-signed-attestation',
    githubProtectedEnvironmentVerified,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const activity = process.argv[2] ?? 'day14-synthetic-simulation';
  const result = runLivePreflight(activity);
  console.log(JSON.stringify(result, null, 2));
  if (!result.allowed) {
    process.exitCode = 1;
  }
}
