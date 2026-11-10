/** Durable claims only; no network transport. At-least-once intent processing. */
import crypto from "node:crypto";
import type { PrismaClient, NotificationJob } from "@prisma/client";
import { RepositoryError } from "./postgres-repository.ts";
export interface NotificationOutbox {
  claim(leaseMilliseconds?: number): Promise<NotificationJob | null>;
  complete(id: string, token: string): Promise<void>;
  retry(id: string, token: string): Promise<void>;
}
export class PostgresOutbox implements NotificationOutbox {
  private client: PrismaClient;
  constructor(client: PrismaClient) {
    this.client = client;
  }
  async claim(leaseMilliseconds = 30000): Promise<NotificationJob | null> {
    if (
      !Number.isInteger(leaseMilliseconds) ||
      leaseMilliseconds < 100 ||
      leaseMilliseconds > 300000
    )
      throw new RepositoryError("VALIDATION_ERROR");
    const token = crypto.randomUUID();
    return this.client.$transaction(async (tx) => {
      // Expired final attempts are retained as FAILED, never reclaimed forever.
      const exhausted = await tx.$queryRaw<
        { notificationId: string }[]
      >`UPDATE "NotificationJob" SET state='FAILED', "leaseToken"=NULL, "leaseUntil"=NULL, "lastError"='LEASE_EXHAUSTED' WHERE state='PROCESSING' AND "leaseUntil"<=now() AND attempts>="maxAttempts" RETURNING "notificationId"`;
      if (exhausted.length)
        await tx.notification.updateMany({
          where: { id: { in: exhausted.map((job) => job.notificationId) } },
          data: { status: "FAILED", errorDetails: "LEASE_EXHAUSTED" },
        });
      const jobs = await tx.$queryRaw<NotificationJob[]>`WITH candidate AS (
        SELECT id FROM "NotificationJob" WHERE attempts<"maxAttempts" AND
        ((state='QUEUED' AND "availableAt"<=now()) OR (state='PROCESSING' AND "leaseUntil"<=now()))
        ORDER BY "availableAt", id FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE "NotificationJob" j SET state='PROCESSING', attempts=attempts+1,
      "leaseToken"=${token}, "leaseUntil"=now()+${leaseMilliseconds}*interval '1 millisecond'
      FROM candidate c WHERE j.id=c.id RETURNING j.*`;
      return jobs[0] || null;
    });
  }
  async complete(id: string, token: string) {
    await this.finish(id, token, true);
  }
  async retry(id: string, token: string) {
    await this.finish(id, token, false);
  }
  private async finish(id: string, token: string, success: boolean) {
    await this.client.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        NotificationJob[]
      >`SELECT * FROM "NotificationJob" WHERE id=${id} AND state='PROCESSING' AND "leaseToken"=${token} AND "leaseUntil">now() FOR UPDATE`;
      const job = rows[0];
      if (!job) throw new RepositoryError("LEASE_LOST");
      const state = success
        ? "SENT"
        : job.attempts >= job.maxAttempts
          ? "FAILED"
          : "QUEUED";
      await tx.notificationJob.update({
        where: { id },
        data: {
          state,
          leaseToken: null,
          leaseUntil: null,
          lastError: success ? null : "DELIVERY_FAILED",
          availableAt: new Date(
            Date.now() + Math.min(3600000, 1000 * 2 ** job.attempts),
          ),
        },
      });
      await tx.notification.update({
        where: { id: job.notificationId },
        data: {
          status: success ? "SENT" : state === "FAILED" ? "FAILED" : "QUEUED",
          sentAt: success ? new Date() : null,
          errorDetails: success ? null : "DELIVERY_FAILED",
        },
      });
    });
  }
}
