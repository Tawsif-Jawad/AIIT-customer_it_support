import { Prisma, type PrismaClient } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { ticketAccessScope, type User } from '../../../packages/shared/src/index.ts';
import type { DatabaseState, RequestScope, RequestStore, TicketPageFilters } from './store.ts';

type Tx = Prisma.TransactionClient;
type Row = { id: string };

export function applicationUser({ role, sbu, oidcIssuer, oidcSubject, adDistinguishedName, createdAt, updatedAt, ...user }: Prisma.UserGetPayload<{ include: { role: true; sbu: true } }>): User {
  return {
    ...user, roleName: role.name, sbuCode: sbu.code,
    oidcSubject: oidcSubject ?? '',
    ...(oidcIssuer ? { oidcIssuer } : {}),
    ...(adDistinguishedName ? { adDistinguishedName } : {}),
    createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(),
  };
}

const newest = [{ createdAt: 'desc' }, { id: 'desc' }] as const;
const oldest = [{ createdAt: 'asc' }, { id: 'asc' }] as const;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const nullableJson = (value: unknown) => value == null ? Prisma.DbNull : json(value);

function splitChanges<T extends Row>(before: T[], after: T[]) {
  const existing = new Map(before.map(row => [row.id, row]));
  return {
    inserted: after.filter(row => !existing.has(row.id)),
    updated: after.filter(row => existing.has(row.id) && !isDeepStrictEqual(existing.get(row.id), row)),
  };
}

function project<T>(value: unknown): T {
  // Prisma rows use Dates; the HTTP workflow consumes ISO strings and plain JSON.
  return JSON.parse(JSON.stringify(value)) as T;
}

function unversion<T extends Row>(rows: (T & { version: number })[]) {
  return rows.map(({ version, ...row }) => { void version; return row; });
}

async function readState(tx: Tx, { pathname, method, developmentSessionDigest }: RequestScope): Promise<DatabaseState> {
  const ticketDetail = /^\/api\/tickets\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);
  let ticketKey: string | undefined;
  try { if (ticketDetail) ticketKey = decodeURIComponent(ticketDetail[1]); } catch { /* HTTP validation handles malformed input */ }
  const ticketWhere = ticketKey ? { OR: [{ id: ticketKey }, { ticketNumber: ticketKey }] } : undefined;
  const scopedRead = method === 'GET' && ['/api/tickets', '/api/analytics/summary'].includes(pathname);
  const listing = pathname.startsWith('/api/approvals');
  const creating = method === 'POST' && pathname === '/api/tickets';
  const detail = !!ticketKey && method === 'GET' && !ticketDetail?.[2];
  const ticketFilter = ticketKey ? { ticket: ticketWhere } : undefined;
  const notificationRead = /^\/api\/notifications\/([^/]+)\/read$/.exec(pathname);
  let notificationId: string | undefined;
  try { if (notificationRead) notificationId = decodeURIComponent(notificationRead[1]); } catch { /* HTTP validation handles malformed input */ }
  const [users, sbus, roles, categories, tickets, events, comments, assets, approvals, notifications, aiLogs, audits, articles, sessions, counter] = await Promise.all([
    !scopedRead || developmentSessionDigest
      ? tx.user.findMany({
        where: scopedRead ? { sessions: { some: { id: developmentSessionDigest, kind: null } } } : undefined,
        include: { role: true, sbu: true }, orderBy: [...oldest],
      }) : [],
    scopedRead ? [] : tx.sBU.findMany({ orderBy: [...oldest] }),
    pathname === '/api/auth/me' ? tx.role.findMany() : [],
    creating || detail || pathname === '/api/catalog' ? tx.serviceCategory.findMany({ orderBy: [...oldest] }) : [],
    (listing && !creating) || ticketWhere ? tx.ticket.findMany({ where: ticketWhere, orderBy: [...newest] }) : [],
    detail ? tx.ticketEvent.findMany({ where: ticketFilter, orderBy: [...oldest] }) : [],
    detail ? tx.ticketComment.findMany({ where: ticketFilter, orderBy: [...oldest] }) : [],
    pathname.startsWith('/api/assets') ? tx.asset.findMany({ orderBy: [...oldest] }) : [],
    detail || pathname.startsWith('/api/approvals')
      ? tx.approval.findMany({ where: ticketFilter, orderBy: [...newest] }) : [],
    pathname === '/api/notifications' || notificationId
      ? tx.notification.findMany({ where: notificationId ? { id: notificationId } : undefined, orderBy: [...newest] }) : [],
    detail ? tx.aIActionLog.findMany({ where: ticketFilter, orderBy: [...newest] }) : [],
    pathname === '/api/audit-logs' ? tx.auditLog.findMany({ orderBy: [...newest], take: 100 }) : [],
    creating || pathname === '/api/kb' ? tx.knowledgeArticle.findMany({ orderBy: [...oldest] }) : [],
    developmentSessionDigest
      ? tx.authSession.findMany({ where: { id: developmentSessionDigest, kind: null } }) : [],
    creating ? tx.ticketCounter.findUniqueOrThrow({ where: { id: 'tickets' } }) : null,
  ]);
  return {
    users: users.map(applicationUser), sbus: project(sbus), roles: project(roles),
    serviceCategories: project(categories), tickets: project(unversion(tickets)),
    ticketEvents: project(events), ticketComments: project(comments), assets: project(unversion(assets)),
    approvals: project(unversion(approvals)), notifications: project(notifications), aiActionLogs: project(aiLogs),
    auditLogs: project(audits), knowledgeArticles: project(articles),
    authSessions: sessions.map(({ id, userId, expiresAt }) => ({ id, userId, expiresAt: expiresAt.getTime() })),
    ticketNumberHighWatermark: counter?.value,
  };
}

async function commitChanges(tx: Tx, before: DatabaseState, after: DatabaseState) {
  const tickets = splitChanges(before.tickets, after.tickets);
  if (tickets.inserted.length) await tx.ticket.createMany({ data: tickets.inserted.map(ticket => ({
    ...ticket, customFormPayload: json(ticket.customFormPayload),
  })) });
  for (const { id, status, severity, assigneeId, escalationReason, updatedAt, resolvedAt, closedAt } of tickets.updated) {
    await tx.ticket.update({
      where: { id },
      data: { status, severity, assigneeId, escalationReason, updatedAt, resolvedAt, closedAt, version: { increment: 1 } },
    });
  }

  const approvals = splitChanges(before.approvals, after.approvals);
  if (approvals.inserted.length) await tx.approval.createMany({ data: approvals.inserted });
  for (const { id, status, approverId, decisionNotes, decidedAt } of approvals.updated) {
    await tx.approval.update({ where: { id, status: 'PENDING' }, data: { status, approverId, decisionNotes, decidedAt, version: { increment: 1 } } });
  }
  for (const { id, status, handoverAckStatus, updatedAt, history } of splitChanges(before.assets, after.assets).updated) {
    await tx.asset.update({ where: { id }, data: { status, handoverAckStatus, updatedAt, history: json(history), version: { increment: 1 } } });
  }

  const events = splitChanges(before.ticketEvents, after.ticketEvents).inserted;
  if (events.length) await tx.ticketEvent.createMany({ data: events.map(row => ({ ...row, metadata: nullableJson(row.metadata) })) });
  const comments = splitChanges(before.ticketComments, after.ticketComments).inserted;
  if (comments.length) await tx.ticketComment.createMany({ data: comments.map(row => ({ ...row, attachments: nullableJson(row.attachments) })) });
  const aiLogs = splitChanges(before.aiActionLogs, after.aiActionLogs).inserted;
  if (aiLogs.length) await tx.aIActionLog.createMany({ data: aiLogs.map(row => ({ ...row, toolOutput: nullableJson(row.toolOutput) })) });
  const audits = splitChanges(before.auditLogs, after.auditLogs).inserted;
  if (audits.length) await tx.auditLog.createMany({ data: audits.map(row => ({ ...row, details: nullableJson(row.details) })) });

  const notifications = splitChanges(before.notifications, after.notifications);
  if (notifications.inserted.length) {
    await tx.notification.createMany({ data: notifications.inserted });
    await tx.notificationJob.createMany({ data: notifications.inserted.map(row => ({ id: row.id, notificationId: row.id })) });
  }

  for (const { id, readAt } of notifications.updated) {
    await tx.notification.update({ where: { id }, data: { readAt } });
  }

  const sessions = after.authSessions ?? [];
  const remaining = new Set(sessions.map(row => row.id));
  const removed = (before.authSessions ?? []).filter(row => !remaining.has(row.id)).map(row => row.id);
  if (removed.length) await tx.authSession.deleteMany({ where: { id: { in: removed }, kind: null } });
  const inserted = splitChanges(before.authSessions ?? [], sessions).inserted;
  if (inserted.length) await tx.authSession.deleteMany({ where: { kind: null, expiresAt: { lte: new Date() } } });
  for (const row of inserted) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${row.userId} FOR UPDATE`;
    await tx.authSession.create({ data: { ...row, expiresAt: new Date(row.expiresAt) } });
  }
}

function visibleTicketSql(user: User) {
  const scope = ticketAccessScope(user);
  if (scope === 'all') return Prisma.sql`TRUE`;
  if (scope === 'none') return Prisma.sql`FALSE`;
  return Prisma.sql`t."requesterId" = ${user.id} AND t."sbuId" = ${user.sbuId}`;
}

class RollbackResponse extends Error {}

/** Request-scoped relational projection. Writes use targeted DML in the same
 * serializable transaction as the route, including its audit and outbox intent. */
export class PostgresRequestStore implements RequestStore {
  private state?: DatabaseState;
  private tx?: Tx;

  private readonly client: PrismaClient;

  constructor(client: PrismaClient) { this.client = client; }

  get transactionClient() {
    if (!this.tx) throw new Error('POSTGRES_TRANSACTION_REQUIRED');
    return this.tx;
  }

  getState() {
    if (!this.state) throw new Error('POSTGRES_TRANSACTION_REQUIRED');
    return this.state;
  }

  persist() { void this.transactionClient; }

  async ticketPage(user: User, { status, severity, sbuId, category, search, page, pageSize }: TicketPageFilters) {
    const tx = this.transactionClient;
    const filters = [visibleTicketSql(user)];
    if (status) filters.push(Prisma.sql`t.status::text = ${status}`);
    if (severity) filters.push(Prisma.sql`t.severity::text = ${severity}`);
    if (sbuId) filters.push(Prisma.sql`t."sbuId" = ${sbuId}`);
    if (category) filters.push(Prisma.sql`t."serviceCategoryId" IN (SELECT id FROM "ServiceCategory" WHERE id = ${category} OR slug = ${category})`);
    if (search) filters.push(Prisma.sql`strpos(lower(t."ticketNumber" || ' ' || t.title || ' ' || t.description), ${search}) > 0`);
    const where = Prisma.join(filters, ' AND ');
    const [{ total }] = await tx.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM "Ticket" t WHERE ${where}`;
    const offset = (page - 1) * pageSize;
    if (offset >= total) return { items: [], total };
    const items = await tx.$queryRaw<Record<string, unknown>[]>`
      SELECT t.*, u."displayName" AS "requesterName", u.email AS "requesterEmail",
             s.code AS "sbuCode", c.name AS "categoryName"
      FROM (
        SELECT t.* FROM "Ticket" t WHERE ${where}
        ORDER BY t."createdAt" DESC, t.id DESC LIMIT ${pageSize} OFFSET ${offset}
      ) t
      JOIN "User" u ON u.id = t."requesterId"
      JOIN "SBU" s ON s.id = t."sbuId"
      JOIN "ServiceCategory" c ON c.id = t."serviceCategoryId"
      ORDER BY t."createdAt" DESC, t.id DESC`;
    return { items: items.map(({ version, ...item }) => { void version; return item; }), total };
  }

  async ticketAnalytics(user: User) {
    const tx = this.transactionClient;
    const where = visibleTicketSql(user);
    const groups = await tx.$queryRaw<{ status: string; code: string; count: number }[]>`
      SELECT t.status, s.code, count(*)::int AS count
      FROM "Ticket" t JOIN "SBU" s ON s.id = t."sbuId"
      WHERE ${where} GROUP BY t.status, s.code`;
    const [{ pendingApprovals }] = await tx.$queryRaw<{ pendingApprovals: number }[]>`
      SELECT count(*)::int AS "pendingApprovals"
      FROM "Approval" a JOIN "Ticket" t ON t.id = a."ticketId"
      WHERE a.status = 'PENDING' AND ${where}`;
    const byStatus: Record<string, number> = Object.create(null);
    const bySbu: Record<string, number> = Object.create(null);
    let totalAccessibleTickets = 0;
    for (const { status, code, count } of groups) {
      totalAccessibleTickets += count;
      byStatus[status] = (byStatus[status] ?? 0) + count;
      bySbu[code] = (bySbu[code] ?? 0) + count;
    }
    return {
      totalAccessibleTickets,
      aiResolvedPendingConfirmation: byStatus.RESOLVED_PENDING_CONFIRMATION ?? 0,
      assignedToIT: (byStatus.ASSIGNED_TO_IT ?? 0) + (byStatus.IN_PROGRESS ?? 0),
      escalatedToCTO: byStatus.ESCALATED_TO_CTO ?? 0,
      pendingApprovals, byStatus, bySbu,
    };
  }

  async isHealthy() {
    try { await this.client.$queryRaw`SELECT 1`; return true; }
    catch {
      await this.client.$disconnect().catch(() => {});
      return false;
    }
  }

  async transaction(operation: () => Promise<boolean>, scope: RequestScope = { pathname: '/', method: 'GET' }) {
    try {
      await this.client.$transaction(async tx => {
        this.tx = tx;
        try {
          const before = await readState(tx, scope);
          this.state = structuredClone(before);
          if (!await operation()) throw new RollbackResponse();
          await commitChanges(tx, before, this.state);
        } finally {
          this.state = undefined;
          this.tx = undefined;
        }
      }, { isolationLevel: 'Serializable', timeout: 15000 });
    } catch (error) {
      if (error instanceof RollbackResponse) return;
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (['P2034', 'P2002', 'P2025'].includes(error.code) ||
          (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code)))) {
          throw new Error('PERSISTENCE_CONFLICT');
        }
        if (['P1001', 'P1002', 'P1017'].includes(error.code)) {
          // Drop stale pooled connections. Prisma reconnects on the next request.
          await this.client.$disconnect().catch(() => {});
        }
      }
      throw new Error('POSTGRES_TRANSACTION_FAILED');
    }
  }
}
