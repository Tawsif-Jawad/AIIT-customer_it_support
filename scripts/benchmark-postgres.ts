/** Local rehearsal. Creates its own cluster and uses reserved synthetic identities. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import type { PrismaClient } from '@prisma/client';
import { connectPostgres } from '../apps/api/src/postgres-runtime.ts';
import { DevelopmentEmailTransport } from '../packages/connectors/src/index.ts';
import { NotificationWorker } from '../apps/worker/src/notification-worker.ts';
import { disposablePostgres, runtimeFixture } from '../tests/support/disposable-postgres.ts';
import { startApiProcess } from '../tests/support/api-process.ts';
import { importJsonSnapshot } from './json-import.ts';

const samples = 120;
const datasets = [1000, 10000, 50000];
const source = runtimeFixture();

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) => Number(sorted[Math.ceil(fraction * sorted.length) - 1].toFixed(2));
  return { samples: sorted.length, p50: at(.5), p95: at(.95), p99: at(.99) };
}

async function seed(client: PrismaClient, from: number, to: number) {
  const employees = source.users.slice(0, 2);
  const admin = source.users[3];
  const category = source.serviceCategories[0];
  const category2 = source.serviceCategories[1];
  await client.$executeRaw`
    INSERT INTO "Ticket" (id, "ticketNumber", title, description, status, severity, "sbuId", "requesterId",
      "assigneeId", "serviceCategoryId", "slaDueAt", "createdAt", "updatedAt")
    SELECT 'day6-ticket-' || n, 'BENCH-2026-' || (100000 + n),
      CASE WHEN n % 7 = 0 THEN 'Outlook credential setup rehearsal' ELSE 'Synthetic device support rehearsal' END,
      'Synthetic office support request with placeholder device and sanitized context.',
      (ARRAY['ASSIGNED_TO_IT','IN_PROGRESS','CLOSED','RESOLVED_PENDING_CONFIRMATION','ESCALATED_TO_CTO']::"TicketStatus"[])[1 + n % 5],
      (ARRAY['LOW','MEDIUM','HIGH','CRITICAL']::"TicketSeverity"[])[1 + n % 4],
      u."sbuId", u.id, ${admin.id},
      CASE WHEN n % 7 = 0 THEN ${category.id} ELSE ${category2.id} END,
      now() + interval '1 day', now() - (${to} - n) * interval '1 minute', now()
    FROM generate_series(${from}::int, ${to}::int) n
    JOIN "User" u ON u.id = CASE WHEN n % 11 = 0 THEN ${employees[0].id}
      WHEN n % 11 = 1 THEN ${employees[1].id} ELSE 'day6-user-' || (1 + n % 120) END`;
  await client.$executeRaw`
    INSERT INTO "TicketEvent" ("ticketId", "actorId", "eventType", "toStatus", "createdAt")
    SELECT t.id, t."requesterId", e.kind, t.status, t."createdAt"
    FROM generate_series(${from}::int, ${to}::int) n
    JOIN "Ticket" t ON t.id = 'day6-ticket-' || n
    CROSS JOIN (VALUES ('TICKET_CREATED'), ('TICKET_TRIAGED')) e(kind)`;
  await client.$executeRaw`
    INSERT INTO "Approval" ("ticketId", "actionType", "requiredRole", "requestedById", justification)
    SELECT t.id, 'SYNTHETIC_APPROVAL', 'IT_ADMIN', t."requesterId", 'Rehearsal approval'
    FROM generate_series(${from}::int, ${to}::int) n
    JOIN "Ticket" t ON t.id = 'day6-ticket-' || n WHERE n % 6 = 0`;
  await client.$executeRaw`
    INSERT INTO "AuditLog" ("actorId", "actorRole", "sbuId", action, resource, "resourceId")
    SELECT t."requesterId", 'EMPLOYEE', t."sbuId", 'TICKET_CREATED', 'Ticket', t.id
    FROM generate_series(${from}::int, ${to}::int) n JOIN "Ticket" t ON t.id = 'day6-ticket-' || n`;
  await client.$executeRaw`
    WITH intents AS (
      INSERT INTO "Notification" (id, "ticketId", "recipientId", "recipientEmail", subject, body)
      SELECT 'day6-job-' || n, t.id, u.id, u.email, 'Rehearsal update', 'Synthetic update'
      FROM generate_series(${from}::int, ${to}::int) n
      JOIN "Ticket" t ON t.id = 'day6-ticket-' || n JOIN "User" u ON u.id = t."requesterId"
      WHERE n % 5 = 0 RETURNING id
    )
    INSERT INTO "NotificationJob" (id, "notificationId") SELECT id, id FROM intents`;
  await client.$executeRaw`ANALYZE`;
}

interface Plan {
  'Node Type': string;
  'Index Name'?: string;
  'Actual Rows': number;
  Plans?: Plan[];
}
type Explain = { 'QUERY PLAN': { Plan: Plan; 'Planning Time': number; 'Execution Time': number }[] }[];
function planSummary(result: Explain) {
  const [plan] = result[0]['QUERY PLAN'];
  function nodes(node: Plan): unknown[] {
    return [{ node: node['Node Type'], index: node['Index Name'], rows: node['Actual Rows'] }, ...(node.Plans ?? []).flatMap(nodes)];
  }
  return { executionMs: plan['Execution Time'], planningMs: plan['Planning Time'], nodes: nodes(plan.Plan) };
}

const cluster = await disposablePostgres();
const env = {
  NODE_ENV: 'test', AUTH_MODE: 'dev_oidc', MAIL_PROVIDER: 'mock', STORAGE_MODE: 'postgres',
  DATABASE_URL: cluster.url + '&connection_limit=8', API_RATE_LIMIT: '100000',
  API_TRUSTED_PROXY_IPS: '', API_PUBLIC_ORIGIN: undefined,
};
const apps: Awaited<ReturnType<typeof startApiProcess>>[] = [];
let client: PrismaClient | undefined;
try {
  const db = client = await connectPostgres(env);
  await importJsonSnapshot(db, source);
  const role = source.users[0].roleId;
  await db.$executeRaw`
    INSERT INTO "User" (id, email, "displayName", "sbuId", "roleId")
    SELECT 'day6-user-' || n, 'rehearsal-' || n || '@example.test', 'Synthetic employee ' || n,
      (ARRAY[${source.sbus[0].id}, ${source.sbus[1].id}, ${source.sbus[2].id}])[1 + n % 3], ${role}
    FROM generate_series(1, 120) n`;
  for (let i = 0; i < 2; i++) apps.push(await startApiProcess(env));
  const login = async (email: string) => {
    const response = await fetch(apps[0].url + '/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).token as string;
  };
  const admin = await login(source.users[3].email);
  const employee = await login(source.users[0].email);
  const read = async (index: number, route: string, token: string) => {
    const start = performance.now();
    const response = await fetch(apps[index % 2].url + route, { headers: { authorization: 'Bearer ' + token } });
    assert.equal(response.status, 200, route);
    await response.json();
    return performance.now() - start;
  };
  const runs = [];
  let previous = 0;
  for (const size of datasets) {
    await seed(db, previous + 1, size);
    previous = size;
    const worker = new NotificationWorker(db, new DevelopmentEmailTransport({
      mode: 'mock', smtpHost: 'localhost', smtpPort: 1025, fromAddress: 'fixture@example.test', retainMockMessages: false,
    }));
    const routes = [
      { name: 'latest-page', path: '/api/tickets?pageSize=25', token: admin },
      { name: 'owned-category-search', path: '/api/tickets?pageSize=25&category=' + source.serviceCategories[0].slug + '&search=outlook', token: employee },
      { name: 'analytics', path: '/api/analytics/summary', token: admin },
    ];
    for (const route of routes) for (let i = 0; i < 5; i++) await read(i, route.path, route.token);
    const workerRun = (async () => {
      const started = performance.now();
      for (let i = 0; i < 150; i++) assert.equal(await worker.runOnce(), true);
      return { jobs: 150, durationMs: performance.now() - started };
    })();
    const latencies: Record<string, ReturnType<typeof summarize>> = {};
    for (const route of routes) {
      const measurements: number[] = [];
      for (let i = 0; i < samples; i += 8) measurements.push(...await Promise.all(
        Array.from({ length: 8 }, (_, slot) => read(slot, route.path, route.token)),
      ));
      latencies[route.name] = summarize(measurements);
    }
    const workerMetrics = await workerRun;
    const createStart = performance.now();
    let conflicts = 0;
    const created = await Promise.all(Array.from({ length: 20 }, async (_, i) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const response = await fetch(apps[i % 2].url + '/api/tickets', {
          method: 'POST', headers: { authorization: 'Bearer ' + employee, 'content-type': 'application/json' },
          body: JSON.stringify({
            title: 'Concurrent synthetic support request ' + i,
            description: 'Synthetic Outlook configuration request for Day 6.',
            serviceCategoryId: 'cat-outlook-config', customFormPayload: { osPlatform: 'macOS' },
          }),
        });
        if (response.status === 409) { conflicts++; await response.text(); continue; }
        assert.equal(response.status, 201);
        return (await response.json()).ticket.ticketNumber as string;
      }
      throw new Error('Concurrent creation exceeded its retry budget');
    }));
    assert.equal(new Set(created).size, 20);
    const createMs = performance.now() - createStart;
    const latest = planSummary(await db.$queryRaw<Explain>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT t.* FROM "Ticket" t ORDER BY t."createdAt" DESC, t.id DESC LIMIT 25`);
    const legacyProjection = planSummary(await db.$queryRaw<Explain>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT t.* FROM "Ticket" t ORDER BY t."createdAt" DESC, t.id DESC`);
    const analytics = planSummary(await db.$queryRaw<Explain>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT t.status, s.code, count(*)::int FROM "Ticket" t JOIN "SBU" s ON s.id = t."sbuId" GROUP BY t.status, s.code`);
    const suffixScan = planSummary(await db.$queryRaw<Explain>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT MAX(substring("ticketNumber" from '-([0-9]+)$')::numeric) FROM "Ticket"`);
    const counter = planSummary(await db.$queryRaw<Explain>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT value FROM "TicketCounter" WHERE id = 'tickets'`);
    const scopedSearch = planSummary(await db.$queryRaw<Explain>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT count(*)::int FROM "Ticket" t
      WHERE t."requesterId" = ${source.users[0].id} AND t."sbuId" = ${source.users[0].sbuId}
      AND t."serviceCategoryId" = ${source.serviceCategories[0].id}
      AND strpos(lower(t."ticketNumber" || ' ' || t.title || ' ' || t.description), 'outlook') > 0`);
    const pendingApprovals = planSummary(await db.$queryRaw<Explain>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT count(*)::int FROM "Approval" a
      JOIN "Ticket" t ON t.id = a."ticketId" WHERE a.status = 'PENDING'
      AND t."requesterId" = ${source.users[0].id} AND t."sbuId" = ${source.users[0].sbuId}`);
    const [connections] = await db.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM pg_stat_activity WHERE datname = current_database()`;
    const processes = apps.map(app => execFileSync('ps', ['-o', 'rss=,time=', '-p', String(app.pid)], { encoding: 'utf8' }).trim());
    const data = {
      seededTickets: size, totalTickets: await db.ticket.count(), users: await db.user.count(),
      events: await db.ticketEvent.count(), approvals: await db.approval.count(),
      audits: await db.auditLog.count(), jobs: await db.notificationJob.count(),
      latenciesMs: latencies, creates: { count: created.length, conflicts, durationMs: createMs },
      worker: { ...workerMetrics, jobsPerSecond: workerMetrics.jobs * 1000 / workerMetrics.durationMs },
      dbConnectionsAfterTraffic: connections.total, apiProcessRssKiBAndCpuTime: processes,
      plans: { latest, legacyProjection, analytics, scopedSearch, pendingApprovals, suffixScan, counter },
    };
    runs.push(data);
    console.error('Completed synthetic rehearsal at ' + size + ' seeded tickets');
  }
  console.log(JSON.stringify({
    environment: {
      postgres: cluster.version, node: process.version, platform: process.platform,
      kernel: os.release(), cpu: os.cpus()[0].model, logicalCores: os.cpus().length, memoryBytes: os.totalmem(),
      apiProcesses: 2, connectionsPerPrismaClient: 8, readConcurrency: 8,
      harnessResourceUsage: process.resourceUsage(),
    },
    runs,
  }, null, 2));
} finally {
  await Promise.all(apps.map(app => app.close()));
  await client?.$disconnect();
  cluster.close();
}
