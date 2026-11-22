import { createServer, type AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createWebServer } from '../../apps/web/src/server.ts';
import { connectPostgres, createPostgresApiServer } from '../../apps/api/src/postgres-runtime.ts';
import { NotificationWorker } from '../../apps/worker/src/notification-worker.ts';
import { createRehearsalSmtp } from '../../apps/worker/src/rehearsal-smtp.ts';
import { disposablePostgres } from '../../tests/support/disposable-postgres.ts';
import { rehearsalCertificate, startRehearsalSink } from '../../tests/support/staging-transport.ts';
import { startTestIssuer } from '../../tests/support/oidc-issuer.ts';
import { importJsonSnapshot, verifyImportedSnapshot } from '../json-import.ts';
import { officeDataset } from './dataset.ts';
import { createOfficeNetwork } from './network.ts';

export const demoPassword = 'fictional-office-demo';
const loopback = '127.0.0.1';
const listen = async (server: ReturnType<typeof createServer> | Server, port: number) => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, loopback, () => { server.removeListener('error', reject); resolve(); });
  });
  return (server.address() as AddressInfo).port;
};
const closeServer = async (server: ReturnType<typeof createServer> | Server) => {
  if ('closeAllConnections' in server) server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
};

export async function startOffice(preferredPort = 0, autoWorker = false) {
  const cleanup: Array<() => unknown | Promise<unknown>> = [];
  const close = async () => {
    // Drain the worker, then shut down everything it can reach.
    const errors: unknown[] = [];
    for (const release of cleanup.splice(0).reverse()) {
      try { await release(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Synthetic shutdown failed');
  };
  try {
    if (!preferredPort) {
      const reservation = createServer();
      preferredPort = await listen(reservation, 0);
      await closeServer(reservation);
    }
    const publicUrl = `http://${loopback}:${preferredPort}`;
    const fixture = officeDataset();
    const accounts = new Map(fixture.snapshot.users.map(user => [user.email, { subject: user.oidcSubject, active: user.isActive }]));
    const issuer = await startTestIssuer({ redirect: publicUrl + '/api/auth/oidc/callback', clientId: 'synthetic-office', accounts, password: demoPassword });
    cleanup.push(() => issuer.close());
    const cluster = await disposablePostgres();
    cleanup.push(() => cluster.close());
    const cert = rehearsalCertificate(cluster.dir);
    const sink = await startRehearsalSink(cert);
    cleanup.push(() => sink.close());
    const settings = {
      NODE_ENV: 'test', AUTH_MODE: 'oidc', MAIL_PROVIDER: 'mock', STORAGE_MODE: 'postgres',
      DATABASE_URL: cluster.url, OIDC_ISSUER_URL: issuer.issuer, OIDC_CLIENT_ID: 'synthetic-office',
      OIDC_ALLOW_INSECURE_LOOPBACK: 'true', APP_PUBLIC_URL: publicUrl, AIIT_REHEARSAL_SMTP_PORT: String(sink.port),
      AIIT_REHEARSAL_SMTP_CA: cert.caFile, OIDC_CLIENT_SECRET: undefined,
    };
    const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
    const setEnv = (values: NodeJS.ProcessEnv) => {
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    };
    setEnv(settings);
    cleanup.push(() => setEnv(previous));
    const client = await connectPostgres(settings);
    cleanup.push(() => client.$disconnect());
    const { snapshot } = officeDataset(issuer.issuer);
    const counts = await importJsonSnapshot(client, snapshot);
    await verifyImportedSnapshot(client, snapshot);
    const api = await createPostgresApiServer(client);
    cleanup.push(() => closeServer(api.server));
    const apiPort = await listen(api.server, 0);
    const web = createWebServer(`http://${loopback}:${apiPort}`, true);
    cleanup.push(() => closeServer(web));
    await listen(web, preferredPort);
    const worker = new NotificationWorker(client, createRehearsalSmtp(settings)!);
    if (autoWorker) {
      const controller = new AbortController();
      const run = (async () => {
        while (!controller.signal.aborted) {
          try { if (await worker.runOnce()) continue; } catch { console.error('Synthetic worker retrying after an operational error'); }
          await delay(250, undefined, { signal: controller.signal }).catch(() => {});
        }
      })();
      cleanup.push(async () => { controller.abort(); await run; });
    }
    const setDirectoryActive = async (email: string, isActive: boolean) => {
      const account = accounts.get(email);
      const user = snapshot.users.find(row => row.email === email);
      if (!account || !user) throw new Error('Unknown synthetic directory account');
      await client.$transaction(async tx => {
        await tx.user.update({ where: { id: user.id }, data: { isActive } });
        await tx.auditLog.create({ data: {
          action: isActive ? 'SYNTHETIC_DIRECTORY_ENABLED' : 'SYNTHETIC_DIRECTORY_DISABLED',
          resource: 'User', resourceId: user.id, sbuId: user.sbuId,
          details: { source: 'synthetic-directory' },
        } });
      });
      account.active = isActive;
    };
    return { publicUrl, counts, issuer, client, sink, worker, network: createOfficeNetwork(),
      close, snapshot, version: cluster.version, setDirectoryActive,
      async connectRestoredSnapshot() {
        return connectPostgres({ ...settings, DATABASE_URL: cluster.restoreBackup() });
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
