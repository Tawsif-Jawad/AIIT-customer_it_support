/**
 * Background Notification & SLA Queue Processor
 * Compatible with BullMQ/Redis in production and provides deterministic local queue processing
 * with DevelopmentEmailTransport (Mock / Mailpit).
 */

import type { DevelopmentEmailTransport } from '../../../packages/connectors/src/index.ts';
import type { EnterpriseDataStore } from './store.ts';

export class NotificationQueueProcessor {
  private isProcessing = false;
  private simulateRedisOutage = false;
  private readonly store: EnterpriseDataStore;
  private readonly emailTransport: DevelopmentEmailTransport;

  constructor(
    store: EnterpriseDataStore,
    emailTransport: DevelopmentEmailTransport
  ) {
    this.store = store;
    this.emailTransport = emailTransport;
  }

  public setSimulateRedisOutage(outage: boolean) {
    this.simulateRedisOutage = outage;
  }

  public getQueueHealth() {
    if (this.simulateRedisOutage) {
      return {
        status: 'DEGRADED_FALLBACK' as const,
        details: 'Simulated broker outage: local JSON notifications remain QUEUED. No real Redis/BullMQ connection or durable retry is configured.',
      };
    }
    return {
      status: 'MOCK MODE' as const,
      details: 'Local notification queue only. Redis connectivity and worker heartbeat are not verified.',
    };
  }

  public async enqueueNotification(params: {
    ticketId: string | null;
    recipientId: string;
    recipientEmail: string;
    subject: string;
    body: string;
  }) {
    const state = this.store.getState();
    const notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ticketId: params.ticketId,
      recipientId: params.recipientId,
      recipientEmail: params.recipientEmail,
      channel: 'EMAIL_AND_IN_APP' as const,
      subject: params.subject,
      body: params.body,
      status: 'QUEUED' as const,
      errorDetails: null,
      readAt: null,
      sentAt: null,
      createdAt: new Date().toISOString(),
    };
    state.notifications.unshift(notification);
    this.store.persist();

    // If Redis/Queue is healthy, trigger immediate background processing
    if (!this.simulateRedisOutage) {
      await this.processPendingJobs();
    }

    return notification;
  }

  public async processPendingJobs(): Promise<{ processedCount: number; sentCount: number; failedCount: number }> {
    if (this.isProcessing || this.simulateRedisOutage) {
      return { processedCount: 0, sentCount: 0, failedCount: 0 };
    }
    this.isProcessing = true;
    let processedCount = 0;
    let sentCount = 0;
    let failedCount = 0;

    try {
      const state = this.store.getState();
      const pending = state.notifications.filter((n) => n.status === 'QUEUED' || n.status === 'FAILED');

      for (const notif of pending) {
        processedCount++;
        notif.status = 'PROCESSING';

        let delivery;
        try { delivery = await this.emailTransport.sendEmail({
          to: notif.recipientEmail,
          subject: notif.subject,
          textBody: notif.body,
          ticketNumber: notif.ticketId || undefined,
        }); } catch {
          notif.status = 'FAILED'; notif.errorDetails = 'Transport raised an error; local notification retained for explicit processing retry.'; failedCount++; continue;
        }

        if (delivery.delivered) {
          notif.status = 'SENT';
          notif.sentAt = new Date().toISOString();
          notif.errorDetails = null;
          sentCount++;
        } else {
          notif.status = 'FAILED';
          notif.errorDetails = delivery.error || 'Unknown transport error';
          failedCount++;
        }
      }

      if (processedCount > 0) {
        this.store.persist();
      }
    } finally {
      this.isProcessing = false;
    }

    return { processedCount, sentCount, failedCount };
  }
}
