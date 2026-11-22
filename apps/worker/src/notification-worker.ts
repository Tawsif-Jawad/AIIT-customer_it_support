import type { Prisma, PrismaClient } from '@prisma/client';
import type { EmailTransportAdapter } from '../../../packages/connectors/src/index.ts';
import { PostgresOutbox } from '../../api/src/postgres-outbox.ts';
import crypto from 'node:crypto';

export class NotificationWorker {
  private readonly outbox: PostgresOutbox;
  private readonly client: PrismaClient;
  private readonly transport: Pick<EmailTransportAdapter, 'sendEmail'>;

  constructor(
    client: PrismaClient,
    transport: Pick<EmailTransportAdapter, 'sendEmail'>,
  ) {
    this.client = client;
    this.transport = transport;
    this.outbox = new PostgresOutbox(client);
  }

  async runOnce(): Promise<boolean> {
    if (await this.processSlaOnce()) return true;
    const job = await this.outbox.claim();
    if (!job?.leaseToken) return false;

    const notification = await this.client.notification.findUniqueOrThrow({ where: { id: job.notificationId } });
    let delivered = notification.channel === 'IN_APP_ONLY';
    if (notification.channel === 'EMAIL_AND_IN_APP') {
      try {
        const result = await this.transport.sendEmail({
          deliveryId: job.id,
          to: notification.recipientEmail,
          subject: notification.subject,
          textBody: notification.body,
          ticketNumber: notification.ticketId ?? undefined,
        });
        delivered = result.delivered;
      } catch {
        // The outbox records a bounded, sanitized failure code.
      }
    }

    if (delivered) await this.outbox.complete(job.id, job.leaseToken);
    else await this.outbox.retry(job.id, job.leaseToken);
    return true;
  }

  async processSlaOnce(): Promise<boolean> {
    const now = new Date();
    const eligible: Prisma.TicketWhereInput = {
      slaEscalatedAt: null,
      slaBreached: false,
      status: { notIn: ['CLOSED', 'RESOLVED_PENDING_CONFIRMATION'] },
      slaResolutionDueAt: { lt: now },
    };
    const ticket = await this.client.ticket.findFirst({
      where: eligible,
      orderBy: [{ slaResolutionDueAt: 'asc' }, { id: 'asc' }],
    });
    if (!ticket) return false;
    const jobKey = { ticketId_breachType: { ticketId: ticket.id, breachType: 'RESOLUTION' } };
    const existing = await this.client.slaJob.findUnique({ where: jobKey });
    if (existing?.state === 'COMPLETED') return false;
    return this.client.$transaction(async tx => {
      const claimed = await tx.ticket.updateMany({
        where: { ...eligible, id: ticket.id, version: ticket.version },
        data: {
          slaBreached: true,
          slaBreachedAt: now,
          slaEscalatedAt: now,
          status: 'ESCALATED_TO_CTO',
          version: { increment: 1 },
        },
      });
      if (claimed.count === 0) return false;
      await tx.slaJob.upsert({
        where: jobKey,
        create: { id: crypto.randomUUID(), ticketId: ticket.id, breachType: 'RESOLUTION', state: 'COMPLETED', processedAt: now },
        update: { state: 'COMPLETED', processedAt: now, leaseUntil: null, leaseToken: null, lastError: null },
      });
      await tx.ticketEvent.create({
        data: {
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          eventType: 'SLA_RESOLUTION_BREACH_ESCALATION',
          fromStatus: ticket.status,
          toStatus: 'ESCALATED_TO_CTO',
          metadata: { source: 'durable-sla-worker', duplicatePrevented: true },
          createdAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          sbuId: ticket.sbuId,
          action: 'SLA_RESOLUTION_BREACH_ESCALATION',
          resource: 'Ticket',
          resourceId: ticket.id,
          details: { source: 'durable-sla-worker' },
          createdAt: now,
        },
      });
      const recipient = await tx.user.findFirst({
        where: { role: { name: 'CTO' }, isActive: true },
        orderBy: { id: 'asc' },
      });
      if (recipient) {
        await tx.notification.create({
          data: {
            id: crypto.randomUUID(),
            ticketId: ticket.id,
            recipientId: recipient.id,
            recipientEmail: recipient.email,
            channel: 'EMAIL_AND_IN_APP',
            subject: `[${ticket.ticketNumber}] SLA resolution breach`,
            body: `Ticket ${ticket.ticketNumber} breached its resolution deadline and was escalated automatically.`,
            status: 'QUEUED',
            createdAt: now,
            job: { create: { id: crypto.randomUUID() } },
          },
        });
      }
      return true;
    });
  }
}
