import { createApiServer } from './app.ts';
import { connectPostgres, createPostgresApiServer, storageMode } from './postgres-runtime.ts';

let client: Awaited<ReturnType<typeof connectPostgres>> | undefined;
try {
  const port = Number(process.env.API_PORT || 4000);
  const mode = storageMode();
  client = mode === 'postgres' ? await connectPostgres() : undefined;
  const app = client ? await createPostgresApiServer(client) : createApiServer();

  app.server.once('error', () => {
    console.error(JSON.stringify({ event: 'API_LISTEN_FAILED', storageMode: mode }));
    process.exitCode = 1;
    void client?.$disconnect();
  });
  app.server.listen(port, '127.0.0.1', () => {
    console.log(JSON.stringify({
      service: 'it-support-api', event: 'SERVER_LISTENING', storageMode: mode,
      environment: process.env.NODE_ENV || 'unset', port: (app.server.address() as { port: number }).port,
    }));
  });
  const close = () => app.server.close(() => void client?.$disconnect());
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
} catch (error) {
  await client?.$disconnect().catch(() => {});
  console.error(JSON.stringify({ event: 'API_STARTUP_FAILED', code: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'STARTUP_FAILED' }));
  process.exitCode = 1;
}
