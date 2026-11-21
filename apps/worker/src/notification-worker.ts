import type { PrismaClient } from '@prisma/client';
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
    const ticket = await this.client.ticket.findFirst({
      where: {
        slaEscalatedAt: null,
        slaBreached: false,
        status: { notIn: ['CLOSED', 'RESOLVED_PENDING_CONFIRMATION'] },
        slaResolutionDueAt: { lt: now },
      },
      orderBy: [{ slaResolutionDueAt: 'asc' }, { id: 'asc' }],
    });
    if (!ticket) return false;
    const existing = await this.client.slaJob.findUnique({
      where: { ticketId_breachType: { ticketId: ticket.id, breachType: 'RESOLUTION' } },
    });
    if (existing?.state === 'COMPLETED') return false;
    const recipient = await this.client.user.findFirst({
      where: { role: { name: ticket.severity === 'CRITICAL' ? 'CTO' : 'IT_ADMIN' }, isActive: true },
      include: { role: true },
    });
    await this.client.$transaction(async tx => {
      await tx.slaJob.upsert({
        where: { ticketId_breachType: { ticketId: ticket.id, breachType: 'RESOLUTION' } },
        create: { id: crypto.randomUUID(), ticketId: ticket.id, breachType: 'RESOLUTION', state: 'COMPLETED', processedAt: now },
        update: { state: 'COMPLETED', processedAt: now, leaseUntil: null, leaseToken: null, lastError: null },
      });
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          slaBreached: true,
          slaBreachedAt: now,
          slaEscalatedAt: now,
          status: 'ESCALATED_TO_CTO',
          version: { increment: 1 },
        },
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
          },
        });
        await tx.notificationJob.create({
          data: { id: crypto.randomUUID(), notificationId: (await tx.notification.findFirstOrThrow({
            where: { ticketId: ticket.id, subject: `[${ticket.ticketNumber}] SLA resolution breach` },
            orderBy: [{ createdAt: 'desc' }],
            select: { id: true },
          })).id },
        });
      }
    });
    return true;
  }
}
