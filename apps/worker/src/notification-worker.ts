import type { PrismaClient } from '@prisma/client';
import type { EmailTransportAdapter } from '../../../packages/connectors/src/index.ts';
import { PostgresOutbox } from '../../api/src/postgres-outbox.ts';

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
}
