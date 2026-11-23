import { createHash } from 'node:crypto';
import { addAbortListener } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import {
  canonicalizePayload, evaluateDay14Preflight, EXCEPTION_ID, verifyDay14Authorization,
  type CompensatingControlSnapshot, type PreflightContext,
} from './day14-preflight.ts';

export interface ExecutionRequest {
  commit: string;
  activity: string;
  id: string;
}

export type AuthorizationEvidence = Omit<PreflightContext, 'controls' | 'execution' | 'intendedActivity' | 'trustedApprovers'> & {
  owner: string;
};

export interface ExecutionClaim {
  id: string;
  fingerprint: string;
  expiresAtUtc: string;
}

export interface OwnerAuthority {
  // The trusted composition root authenticates this service and its clock and context.
  read(request: Readonly<ExecutionRequest>, signal: AbortSignal): Promise<AuthorizationEvidence>;
  consume(claim: Readonly<ExecutionClaim>, signal: AbortSignal): Promise<boolean>;
}

export interface RuntimeSession {
  inspect(signal: AbortSignal): Promise<CompensatingControlSnapshot>;
  run(signal: AbortSignal): Promise<void>;
  stopAndRemove(): Promise<void>;
}

export interface SupervisionDependencies {
  authority: OwnerAuthority;
  // Create a cleanup handle without provisioning. Setup may partially fail.
  open(request: Readonly<ExecutionRequest>): RuntimeSession & { provision(signal: AbortSignal): Promise<void> };
  audit(event: { executionId: string; stage: string; outcome: string }): Promise<void>;
}

const POLL_MS = 1_000;
const IO_TIMEOUT_MS = 5_000;

export function authorizationFingerprint(context: AuthorizationEvidence): string {
  if (!context.envelope || !context.startEnvelope) throw new Error('Authorization records are missing');
  return createHash('sha256').update(JSON.stringify([
    context.owner, context.trustedPublicKeyPem, EXCEPTION_ID, context.scannedSambaImageId,
    canonicalizePayload(context.envelope.payload), canonicalizePayload(context.startEnvelope.payload),
  ])).digest('hex');
}

async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let listener: ReturnType<typeof addAbortListener> | undefined;
  try {
    const cancelled = new Promise<never>((_, reject) => {
      listener = addAbortListener(signal, () => reject(signal.reason));
    });
    return await Promise.race([cancelled, operation(signal)]);
  } finally {
    listener?.[Symbol.dispose]();
  }
}

export async function superviseDay14(
  requested: ExecutionRequest,
  dependencies?: SupervisionDependencies,
): Promise<{ allowed: boolean; outcome: string; cleanup: 'none' | 'verified' | 'failed' }> {
  if (!dependencies) return { allowed: false, outcome: 'authority-unconfigured', cleanup: 'none' };
  const request = Object.freeze({ ...requested });
  const { authority, audit } = dependencies;
  const controller = new AbortController();
  const { signal } = controller;
  let session: RuntimeSession | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let monitor: Promise<void> | undefined;
  let stage = 'authorization';
  let outcome = 'denied';
  let cleanup: 'none' | 'verified' | 'failed' = 'none';
  let fingerprint: string | undefined;
  let lastUtc = -Infinity;

  async function check() {
    const ioSignal = AbortSignal.any([signal, AbortSignal.timeout(IO_TIMEOUT_MS)]);
    const evidence = structuredClone(await bounded(io => authority.read(request, io), ioSignal));
    ioSignal.throwIfAborted();
    const context = {
      ...evidence, trustedApprovers: [evidence.owner], execution: { commit: request.commit, id: request.id },
      intendedActivity: request.activity,
    };
    const now = context.nowUtcMs;
    const result = verifyDay14Authorization(context);
    if (!result.allowed || !result.expiresAtUtc || !result.remainingMs || !context.envelope ||
        !context.startEnvelope || !context.scannedSambaImageId ||
        !/^sha256:[a-f0-9]{64}$/.test(context.scannedSambaImageId) || now === undefined || now < lastUtc) {
      throw new Error('authorization-denied');
    }
    lastUtc = now;
    const identity = authorizationFingerprint(evidence);
    if (fingerprint && fingerprint !== identity) throw new Error('authorization-changed');
    return { context, identity, expiresAtUtc: result.expiresAtUtc, remainingMs: result.remainingMs };
  }

  try {
    const startedAt = performance.now();
    const initial = await check();
    fingerprint = initial.identity;
    const remaining = initial.remainingMs - (performance.now() - startedAt);
    if (remaining <= 0) throw new Error('authorization-expired');
    timer = setTimeout(() => controller.abort('authorization-expired'), remaining);

    stage = 'claim';
    const claimSignal = AbortSignal.any([signal, AbortSignal.timeout(IO_TIMEOUT_MS)]);
    const consumed = await bounded(io => authority.consume({
      id: request.id, fingerprint: initial.identity, expiresAtUtc: initial.expiresAtUtc,
    }, io), claimSignal);
    claimSignal.throwIfAborted();
    if (consumed !== true) throw new Error('execution-already-used-or-unregistered');
    await bounded(() => audit({ executionId: request.id, stage, outcome: 'consumed' }), claimSignal);
    await check();
    signal.throwIfAborted();
    monitor = (async () => {
      try {
        while (!signal.aborted) {
          await delay(POLL_MS, undefined, { signal });
          await check();
        }
      } catch {
        if (!signal.aborted) controller.abort('authorization-recheck-failed');
      }
    })();

    stage = 'provision';
    const opened = dependencies.open(request);
    session = opened;
    await opened.provision(signal);
    signal.throwIfAborted();

    stage = 'runtime-controls';
    const controls = await opened.inspect(signal);
    const current = await check();
    if (!evaluateDay14Preflight({ ...current.context, controls }).allowed) {
      throw new Error('runtime-controls-denied');
    }
    await bounded(() => audit({ executionId: request.id, stage, outcome: 'verified' }),
      AbortSignal.any([signal, AbortSignal.timeout(IO_TIMEOUT_MS)]));
    // External audit and inspection can take time. Recheck just before launch.
    await check();
    signal.throwIfAborted();
    stage = 'workload';
    await opened.run(signal);
    signal.throwIfAborted();
    outcome = 'completed';
  } catch (error) {
    outcome = signal.aborted ? String(signal.reason) : stage + '-failed';
    if (error instanceof Error && error.message === 'runtime-controls-denied') outcome = error.message;
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
    if (session) {
      cleanup = 'failed';
      try {
        await session.stopAndRemove();
        cleanup = 'verified';
      } catch {
        outcome = 'teardown-failed';
      }
    }
    await monitor;
    try {
      await bounded(() => audit({ executionId: request.id, stage: 'final', outcome }), AbortSignal.timeout(IO_TIMEOUT_MS));
    } catch {
      if (cleanup !== 'failed') outcome = 'audit-failed';
    }
  }
  return { allowed: outcome === 'completed', outcome, cleanup };
}
