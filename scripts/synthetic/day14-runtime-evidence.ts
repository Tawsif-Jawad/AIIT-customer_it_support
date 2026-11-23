import { execFile, spawn } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { CompensatingControlSnapshot } from './day14-preflight.ts';

type Mount = {
  Type: string;
  Source: string;
  Destination: string;
  RW: boolean;
};

export interface ContainerObservation {
  Id: string;
  Image: string;
  State: { Running: boolean };
  HostConfig: {
    Privileged: boolean;
    NetworkMode: string;
    PidMode: string;
    IpcMode: string;
    UsernsMode: string;
    CapAdd: string[] | null;
    CapDrop: string[] | null;
    SecurityOpt: string[] | null;
    Memory: number;
    Devices: unknown[] | null;
    PortBindings: Record<string, unknown> | null;
  };
  Config: { Env: string[] };
  Mounts: Mount[];
  NetworkSettings: {
    Networks: Record<string, { NetworkID: string }>;
    Ports: Record<string, unknown> | null;
  };
}

export interface RuntimeEvidenceSource {
  inspectContainer(id: string, signal: AbortSignal): Promise<ContainerObservation>;
  inspectNetwork(id: string, signal: AbortSignal): Promise<{ Id: string; Internal: boolean; Driver: string; Containers: Record<string, unknown> }>;
  // Probe inside each running container against dedicated synthetic isolation targets.
  probe(id: string, family: 'ipv4' | 'ipv6' | 'dns', signal: AbortSignal): Promise<'blocked' | 'reachable' | 'indeterminate'>;
}

export function dockerEvidenceSource(
  executable: string, socket: string, cwd: string, probe: RuntimeEvidenceSource['probe'],
): RuntimeEvidenceSource {
  if (!executable.startsWith('/') || !socket.startsWith('/')) throw new Error('Absolute Docker paths required');
  async function inspect<T>(kind: 'container' | 'network', id: string, signal: AbortSignal): Promise<T> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Full Docker object ID required');
    return new Promise<T>((resolve, reject) => {
      execFile(executable, ['--host', `unix://${socket}`, kind, 'inspect', id], {
        cwd, env: {}, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 5_000, killSignal: 'SIGKILL', signal,
      }, (error, stdout) => {
        if (error) return reject(new Error('Docker inspection failed'));
        try {
          const entries = JSON.parse(stdout);
          if (!Array.isArray(entries) || entries.length !== 1 || entries[0]?.Id !== id) {
            throw new Error('Unexpected Docker inspection object');
          }
          resolve(entries[0] as T);
        } catch {
          reject(new Error('Invalid Docker inspection response'));
        }
      });
    });
  }
  return {
    inspectContainer: (id, signal) => inspect('container', id, signal),
    inspectNetwork: (id, signal) => inspect('network', id, signal),
    probe,
  };
}

export interface RuntimeEvidencePlan {
  networkId: string;
  containers: readonly {
    id: string;
    role: 'keycloak' | 'samba';
    expectedMounts: readonly Mount[];
    expectedEnvironment: readonly string[];
  }[];
  keycloakImageDigest: string;
  sambaBaseImageDigest: string;
  fixtureBytes: Uint8Array;
  expectedFixtureSha256: string;
  targetEndpoints: string[];
  teardownReady: boolean;
}

function matchesSet(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && new Set(actual).size === actual.length &&
    actual.every(value => expected.includes(value));
}

function mountIdentity(mount: Mount): string {
  return JSON.stringify([mount.Type, mount.Source, mount.Destination, mount.RW]);
}

export async function collectRuntimeEvidence(
  source: RuntimeEvidenceSource, plan: RuntimeEvidencePlan, signal: AbortSignal,
): Promise<CompensatingControlSnapshot> {
  signal.throwIfAborted();
  if (plan.containers.length !== 2 || new Set(plan.containers.map(item => item.role)).size !== 2 ||
      new Set(plan.containers.map(item => item.id)).size !== 2) throw new Error('Unexpected container plan');
  const network = await source.inspectNetwork(plan.networkId, signal);
  const inspections = await Promise.all(plan.containers.map(async expected => {
    const observed = await source.inspectContainer(expected.id, signal);
    if (observed.Id !== expected.id || !observed.State.Running) throw new Error('Unexpected container identity or state');
    const host = observed.HostConfig;
    const networks = Object.values(observed.NetworkSettings.Networks);
    const ports = Object.values(observed.NetworkSettings.Ports ?? {});
    const probes = await Promise.all((['ipv4', 'ipv6', 'dns'] as const).map(family => source.probe(expected.id, family, signal)));
    return {
      role: expected.role,
      image: observed.Image,
      network: networks.length === 1 && networks[0]?.NetworkID === network.Id,
      ports: Object.keys(host.PortBindings ?? {}).length === 0 && ports.every(binding => binding === null),
      privileges: host.Privileged === false && ![host.NetworkMode, host.PidMode, host.IpcMode, host.UsernsMode].includes('host') &&
        [host.NetworkMode, host.PidMode, host.IpcMode].every(mode => !mode.startsWith('container:')) &&
        (host.CapAdd ?? []).length === 0 && (host.Devices ?? []).length === 0 &&
        (host.SecurityOpt ?? []).some(option => ['no-new-privileges:true', 'no-new-privileges'].includes(option)) &&
        (host.SecurityOpt ?? []).every(option => ['no-new-privileges:true', 'no-new-privileges'].includes(option)) &&
        (expected.role !== 'keycloak' || ((host.CapDrop ?? []).includes('ALL') && host.Memory > 0 && host.Memory <= 1536 * 1024 ** 2)),
      secrets: matchesSet(observed.Config.Env, expected.expectedEnvironment) &&
        matchesSet(observed.Mounts.map(mountIdentity), expected.expectedMounts.map(mountIdentity)),
      egress: probes.every(result => result === 'blocked'),
    };
  }));
  signal.throwIfAborted();
  const fixtureHash = createHash('sha256').update(plan.fixtureBytes).digest();
  const expectedHash = Buffer.from(plan.expectedFixtureSha256, 'hex');
  return {
    keycloakImageDigest: plan.keycloakImageDigest,
    sambaBaseImageDigest: plan.sambaBaseImageDigest,
    keycloakRuntimeImageId: inspections.find(item => item.role === 'keycloak')!.image,
    sambaRuntimeImageId: inspections.find(item => item.role === 'samba')!.image,
    internalNetworkOnly: network.Id === plan.networkId && network.Internal === true && network.Driver === 'bridge' &&
      matchesSet(Object.keys(network.Containers), plan.containers.map(item => item.id)) && inspections.every(item => item.network),
    noPublishedPorts: inspections.every(item => item.ports),
    egressIsolationVerified: inspections.every(item => item.egress),
    syntheticDataOnly: /^[a-f0-9]{64}$/.test(plan.expectedFixtureSha256) && timingSafeEqual(fixtureHash, expectedHash),
    targetEndpoints: [...plan.targetEndpoints],
    noProductionSecrets: inspections.every(item => item.secrets),
    containerPrivilegeRestrictionsIntact: inspections.every(item => item.privileges),
    teardownVerified: plan.teardownReady === true,
  };
}

// Use for a single supervised process. The runtime provider owns its container/process tree.
export async function runIsolatedProcess(
  executable: string, args: readonly string[], cwd: string, signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  if (!executable.startsWith('/')) throw new Error('An absolute executable path is required');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env: {}, shell: false, stdio: 'ignore', signal, killSignal: 'SIGKILL' });
    let spawnError: Error | undefined;
    child.once('error', error => { spawnError = error; });
    child.once('close', code => {
      if (spawnError || code !== 0) reject(spawnError ?? new Error('Supervised process failed'));
      else resolve();
    });
  });
}
