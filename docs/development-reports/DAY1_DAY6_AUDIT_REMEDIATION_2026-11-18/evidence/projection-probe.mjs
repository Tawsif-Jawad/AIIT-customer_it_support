// Run from the checkout under measurement. Uses its disposable cluster helper.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(path.resolve('package.json'));
const local = file => import(pathToFileURL(path.resolve(file)).href);
const { PrismaClient } = require('@prisma/client');
const { disposablePostgres, runtimeFixture } = await local('tests/support/disposable-postgres.ts');
const { importJsonSnapshot } = await local('scripts/json-import.ts');
const { createPostgresApiServer } = await local('apps/api/src/postgres-runtime.ts');

Object.assign(process.env, { NODE_ENV: 'test', AUTH_MODE: 'dev_oidc', MAIL_PROVIDER: 'mock', API_RATE_LIMIT: '100000' });
const cluster = await disposablePostgres();
const db = new PrismaClient({ datasourceUrl: cluster.url, log: [{ emit: 'event', level: 'query' }] });
const events = [];
db.$on('query', event => events.push(event));

try {
  const source = runtimeFixture();
  await importJsonSnapshot(db, source);
  const api = await createPostgresApiServer(db);
  const login = async user => {
    const response = await api.inject({ method: 'POST', url: '/api/auth/login', body: { email: user.email } });
    assert.equal(response.status, 200);
    return response.data.token;
  };
  const [employee, other, , admin] = source.users;
  const employeeToken = await login(employee);
  const adminToken = await login(admin);
  const results = [];
  for (const [from, to] of [[1, 1000], [1001, 10000]]) {
    await db.$executeRaw`
      INSERT INTO "Notification" (id, "recipientId", "recipientEmail", subject, body, status)
      SELECT 'projection-' || n, u.id, u.email, 'Synthetic update', 'Body', 'SENT'
      FROM generate_series(${from}::int, ${to}::int) n
      JOIN "User" u ON u.id = CASE WHEN n % 20 = 0 THEN ${employee.id} ELSE ${other.id} END`;
    await db.$executeRaw`ANALYZE "Notification"`;
    for (const [name, token] of [['administrator', adminToken], ['employee', employeeToken]]) {
      // Prime the per-process abuse sweep, then count a single warm HTTP request.
      const request = () => api.inject({ method: 'GET', url: '/api/notifications', token });
      assert.equal((await request()).status, 200);
      events.length = 0;
      const response = await request();
      assert.equal(response.status, 200);
      if (name === 'administrator') assert.equal(response.data.items.length, 50);
      else assert.ok(response.data.items.every(item => item.recipientId === employee.id));
      const queryCount = events.length;
      const notificationQueries = events.filter(event => event.query.trimStart().startsWith('SELECT') && event.query.includes('"Notification"'));
      const plans = [];
      for (const event of notificationQueries) {
        const params = JSON.parse(event.params);
        const [result] = await db.$queryRawUnsafe('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + event.query, ...params);
        plans.push(result['QUERY PLAN'][0]);
      }
      results.push({ syntheticRows: to, name, queryCount, returned: response.data.items.length,
        deliveredTransportCount: response.data.deliveredTransportCount, plans });
    }
  }
  console.log(JSON.stringify({ postgres: cluster.version, results }, null, 2));
} finally {
  await db.$disconnect();
  cluster.close();
}
