/**
 * Enterprise IT Support API Entrypoint
 */
import { createApiServer } from './app.ts';

const port = Number(process.env.API_PORT || 4000);
const app = createApiServer();

app.server.listen(port, '127.0.0.1', () => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'it-support-api',
      event: 'SERVER_LISTENING',
      url: `http://localhost:${port}`,
      healthEndpoint: `http://localhost:${port}/api/health`,
      openApiSpec: `http://localhost:${port}/api/openapi.json`,
    })
  );
});
