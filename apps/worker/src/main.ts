import { setTimeout as delay } from 'node:timers/promises';
import { DevelopmentEmailTransport } from '../../../packages/connectors/src/index.ts';
import { connectPostgres } from '../../api/src/postgres-runtime.ts';

async function run() {
  const client = await connectPostgres();
  try {
    const { NotificationWorker } = await import('./notification-worker.ts');
    const worker = new NotificationWorker(client, new DevelopmentEmailTransport({
      mode: 'mock', smtpHost: 'localhost', smtpPort: 1025,
      fromAddress: 'noreply@local.dev.invalid', retainMockMessages: false,
    }));
    let stopping = false;
    const stop = () => { stopping = true; };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    let ready: boolean | undefined;
    while (!stopping) {
      try {
        const worked = await worker.runOnce();
        if (!ready) {
          const states = await client.notificationJob.groupBy({ by: ['state'], _count: { _all: true } });
          const counts = Object.fromEntries(states.map(row => [row.state, row._count._all]));
          console.log(JSON.stringify({
            event: 'WORKER_READY', storageMode: 'postgres', transport: 'mock', environment: process.env.NODE_ENV,
            queued: counts.QUEUED ?? 0, processing: counts.PROCESSING ?? 0, failed: counts.FAILED ?? 0,
          }));
          ready = true;
        }
        if (!worked) await delay(500);
      } catch {
        if (ready !== false) console.error(JSON.stringify({ event: 'WORKER_UNAVAILABLE', code: 'OUTBOX_OPERATION_FAILED' }));
        ready = false;
        await client.$disconnect().catch(() => {});
        await delay(1000);
      }
    }
  } finally {
    await client.$disconnect();
  }
}

try {
  await run();
} catch (error) {
  console.error(JSON.stringify({
    event: 'WORKER_STARTUP_FAILED',
    code: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'STARTUP_FAILED',
  }));
  process.exitCode = 1;
}
