import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PostgresRepository } from "../../apps/api/src/postgres-repository.ts";
import { PostgresOutbox } from "../../apps/api/src/postgres-outbox.ts";
export async function exerciseDay3(
  t: TestContext,
  client: PrismaClient,
  url: string,
) {
  const repo = new PostgresRepository(client);
  const employee = "user-emp-tawsif",
    other = "user-emp-nadia",
    admin = "user-it-kamal",
    cto = "user-cto-farhana";
  const input = {
    title: "Synthetic persistence request",
    description: "Synthetic isolated database fixture",
    serviceCategoryId: "cat-outlook-config", customFormPayload: { osPlatform: 'macOS' },
    severity: 'HIGH',
  };
  const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if ((error as { code?: string }).code !== "CONFLICT" || attempt >= 9)
          throw error;
      }
    }
  };
  let ticketId = "";
  await t.test(
    "Day3 create/read, schema validation, references, IDs and atomic initial history",
    async () => {
      const ticket = await repo.createTicket(employee, input);
      ticketId = ticket.id;
      assert.match(ticket.id, /^ticket-/);
      assert.match(ticket.ticketNumber, new RegExp(`^REQ-${new Date().getUTCFullYear()}-\\d+$`));
      assert.ok(Number(ticket.ticketNumber.split("-").at(-1)) > 9100);
      assert.equal(
        (await repo.getTicket(employee, ticket.id)).title,
        input.title,
      );
      assert.equal(await client.ticketEvent.count({ where: { ticketId } }), 4);
      assert.equal(
        await client.auditLog.count({ where: { resourceId: ticketId } }),
        1,
      );
      assert.equal(
        await client.notificationJob.count({
          where: { notification: { ticketId } },
        }),
        1,
      );
      await assert.rejects(
        repo.createTicket(employee, { ...input, title: "x" }),
      );
      await assert.rejects(
        repo.createTicket(employee, { ...input, serviceCategoryId: "absent" }),
        /INVALID_REFERENCE/,
      );
      await assert.rejects(
        repo.transition(admin, ticketId, -1, "TRIAGED", "invalid"),
        /VALIDATION_ERROR/,
      );
      await assert.rejects(
        repo.transition(admin, ticketId, 0, "UNSUPPORTED" as never, "invalid"),
        /TRANSITION_NOT_ALLOWED/,
      );
      await assert.rejects(
        client.ticket.update({
          where: { id: ticketId },
          data: { sbuId: "sbu-fin-002" },
        }),
      );
      await assert.rejects(
        client.ticketEvent.create({
          data: {
            id: "invalid-actor",
            ticketId,
            actorId: "missing",
            eventType: "INVALID",
          },
        }),
      );
      await assert.rejects(
        client.auditLog.create({
          data: {
            id: "invalid-sbu",
            sbuId: "missing",
            action: "INVALID",
            resource: "Ticket",
          },
        }),
      );
      const original = await client.ticket.findUniqueOrThrow({
        where: { id: ticketId },
      });
      const { customFormPayload: _payload, ...data } = original;
      await assert.rejects(
        client.ticket.create({ data: { ...data, customFormPayload: {} } }),
      );
    },
  );
  await t.test(
    "Day3 cross-user/SBU, disabled identity, internal comment and CTO restrictions",
    async () => {
      await assert.rejects(repo.getTicket(other, ticketId), /FORBIDDEN/);
      const sameSbu = await client.user.create({
        data: {
          id: "synthetic-peer",
          email: "peer@example.test",
          displayName: "Synthetic Peer",
          sbuId: "sbu-tech-001",
          roleId: "role-employee",
        },
      });
      await assert.rejects(repo.getTicket(sameSbu.id, ticketId), /FORBIDDEN/);
      await assert.rejects(
        repo.addComment(employee, ticketId, "private", true),
        /FORBIDDEN/,
      );
      await assert.rejects(
        repo.transition(employee, ticketId, 0, "IN_PROGRESS", "invalid"),
        /TRANSITION_NOT_ALLOWED/,
      );
      await assert.rejects(
        repo.transition(admin, "ticket-seed-1003", 0, "IN_PROGRESS", "review"),
        /TRANSITION_NOT_ALLOWED/,
      );
      await assert.rejects(
        repo.decideApproval(
          employee,
          "approval-seed-001",
          "APPROVED",
          "denied",
        ),
        /FORBIDDEN/,
      );
      await assert.rejects(
        repo.decideApproval(admin, "approval-seed-002", "APPROVED", "denied"),
        /FORBIDDEN/,
      );
      await client.user.update({
        where: { id: sameSbu.id },
        data: { isActive: false },
      });
      await assert.rejects(repo.createTicket(sameSbu.id, input), /FORBIDDEN/);
    },
  );
  await t.test(
    "Day3 simultaneous stale-version updates yield one commit and one conflict",
    async () => {
      const results = await Promise.allSettled([
        repo.transition(admin, ticketId, 0, "IN_PROGRESS", "begin"),
        repo.transition(admin, ticketId, 0, "AWAITING_USER", "clarify"),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const rejected = results.find(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult;
      assert.equal(rejected.reason.code, "CONFLICT");
      assert.equal(
        (await client.ticket.findUniqueOrThrow({ where: { id: ticketId } }))
          .version,
        1,
      );
    },
  );
  await t.test(
    "Day3 concurrent comments retain every event and audit; ticket allocation is unique",
    async () => {
      const before = await client.ticketEvent.count({ where: { ticketId } });
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          retry(() =>
            repo.addComment(employee, ticketId, `Synthetic comment ${i}`),
          ),
        ),
      );
      assert.equal(
        await client.ticketComment.count({ where: { ticketId } }),
        5,
      );
      assert.equal(
        await client.ticketEvent.count({ where: { ticketId } }),
        before + 5,
      );
      const tickets = await Promise.all(
        Array.from({ length: 5 }, () =>
          retry(() => repo.createTicket(employee, input)),
        ),
      );
      assert.equal(new Set(tickets.map((row) => row.ticketNumber)).size, 5);
    },
  );
  await t.test(
    "Day3 opposing approval decisions commit once and historical records reject mutation",
    async () => {
      const decisions = await Promise.allSettled([
        repo.decideApproval(
          admin,
          "approval-seed-001",
          "APPROVED",
          "synthetic approve",
        ),
        repo.decideApproval(
          cto,
          "approval-seed-001",
          "REJECTED",
          "synthetic reject",
        ),
      ]);
      assert.equal(decisions.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (
          await client.approval.findUniqueOrThrow({
            where: { id: "approval-seed-001" },
          })
        ).version,
        1,
      );
      await assert.rejects(
        client.approval.update({
          where: { id: "approval-seed-001" },
          data: { decisionNotes: "overwrite" },
        }),
      );
      const audit = await client.auditLog.findFirstOrThrow();
      await assert.rejects(
        client.auditLog.update({
          where: { id: audit.id },
          data: { action: "overwrite" },
        }),
      );
      await assert.rejects(client.auditLog.delete({ where: { id: audit.id } }));
      await assert.rejects(client.$executeRawUnsafe('TRUNCATE "AuditLog"'));
    const event = await client.ticketEvent.findFirstOrThrow();
      await assert.rejects(
        client.ticketEvent.delete({ where: { id: event.id } }),
      );
      const ai = await client.aIActionLog.findFirstOrThrow();
      await assert.rejects(
        client.aIActionLog.update({
          where: { id: ai.id },
          data: { classification: "overwrite" },
        }),
      );
    },
  );
  await t.test(
    "Day3 escalation and requester reopen preserve workflow routing",
    async () => {
      const fresh = await repo.createTicket(employee, input);
      const escalated = await repo.transition(
        admin,
        fresh.id,
        0,
        "ESCALATED_TO_CTO",
        "Synthetic governance review",
      );
      assert.equal(escalated.escalationReason, "Synthetic governance review");
      await assert.rejects(
        repo.transition(admin, fresh.id, 1, "IN_PROGRESS", "invalid"),
        /TRANSITION_NOT_ALLOWED/,
      );
      const resolved = await repo.transition(
        cto,
        fresh.id,
        1,
        "RESOLVED_PENDING_CONFIRMATION",
        "Synthetic resolution",
      );
      const reopened = await repo.transition(
        employee,
        fresh.id,
        resolved.version,
        "REOPENED",
        "Synthetic rejection",
      );
      assert.equal(reopened.status, "ASSIGNED_TO_IT");
      assert.equal(reopened.assigneeId, admin);
      assert.equal(reopened.resolvedAt, null);
    },
  );
  await t.test(
    "Day3 outbox insertion failure rolls back ticket, event, audit and counter",
    async () => {
      await client.$executeRawUnsafe(
        `CREATE FUNCTION day3_fail_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$`,
      );
      await client.$executeRawUnsafe(
        'CREATE TRIGGER day3_fail BEFORE INSERT ON "NotificationJob" FOR EACH ROW EXECUTE FUNCTION day3_fail_job()',
      );
      const counts = async () =>
        Promise.all([
          client.ticket.count(),
          client.ticketEvent.count(),
          client.auditLog.count(),
          client.notification.count(),
          client.ticketCounter.findMany(),
          client.approval.count(),
          client.aIActionLog.count(),
          client.notificationJob.count(),
        ]);
      const before = await counts();
      try {
        await assert.rejects(repo.createTicket(employee, { ...input, serviceCategoryId: "cat-ad-account", customFormPayload: { targetAdGroup: "Synthetic readers", businessJustification: "Rollback fixture" } }));
        assert.deepEqual(await counts(), before);
      } finally {
        await client.$executeRawUnsafe(
          'DROP TRIGGER day3_fail ON "NotificationJob"',
        );
        await client.$executeRawUnsafe("DROP FUNCTION day3_fail_job()");
      }
    },
  );
  await t.test(
    "Day3 invalid custody denied and valid acknowledgment is idempotent",
    async () => {
      const asset = await client.asset.findFirstOrThrow({
        where: { assignedUserId: employee },
      });
      await assert.rejects(
        repo.acknowledgeCustody(other, asset.id, 0),
        /FORBIDDEN/,
      );
      const available = await client.asset.create({
        data: {
          id: "synthetic-available",
          assetTag: "TEST-AVAILABLE",
          serialNumber: "TEST-SERIAL",
          category: "Laptop",
          modelName: "Synthetic",
          sbuId: "sbu-tech-001",
        },
      });
      await assert.rejects(
        repo.acknowledgeCustody(admin, available.id, 0),
        /ASSET_STATE_CONFLICT/,
      );
      await client.asset.update({
        where: { id: asset.id },
        data: {
          status: "HANDOVER_PENDING_ACK",
          handoverAckStatus: "PENDING_EMPLOYEE_ACK",
        },
      });
      await repo.acknowledgeCustody(employee, asset.id, 0);
      const saved = await client.asset.findUniqueOrThrow({
        where: { id: asset.id },
      });
      await repo.acknowledgeCustody(employee, asset.id, 0);
      assert.deepEqual(
        await client.asset.findUniqueOrThrow({ where: { id: asset.id } }),
        saved,
      );
      await assert.rejects(
        client.asset.update({ where: { id: asset.id }, data: { history: [] } }),
      );
      await assert.rejects(client.asset.delete({ where: { id: asset.id } }));
      await assert.rejects(
        client.asset.update({
          where: { id: asset.id },
          data: { assignedUserId: other },
        }),
      );
    },
  );
  await t.test(
    "Day3 independent client restart reloads committed records",
    async () => {
      const reopened = new PrismaClient({ datasources: { db: { url } } });
      try {
        const otherRepo = new PostgresRepository(reopened);
        assert.equal(
          (await otherRepo.getTicket(employee, ticketId)).id,
          ticketId,
        );
        assert.equal(
          await reopened.ticketComment.count({ where: { ticketId } }),
          5,
        );
      } finally {
        await reopened.$disconnect();
      }
    },
  );
  await t.test(
    "Day3 durable claims exclude workers, expire, fence old tokens and bound retries",
    async () => {
      // Keep this claim test deterministic while preserving all jobs for inspection.
      await client.notificationJob.updateMany({
        data: { availableAt: new Date(Date.now() + 3600000) },
      });
      const first = await client.notificationJob.findFirstOrThrow();
      await client.notificationJob.update({
        where: { id: first.id },
        data: { availableAt: new Date(0), maxAttempts: 2 },
      });
      const secondClient = new PrismaClient({ datasources: { db: { url } } });
      try {
        const outbox = new PostgresOutbox(client),
          otherBox = new PostgresOutbox(secondClient);
        const claims = await Promise.all([outbox.claim(), otherBox.claim()]);
        assert.equal(claims.filter(Boolean).length, 1);
        const claimed = claims.find(Boolean)!;
        await client.notificationJob.update({
          where: { id: claimed.id },
          data: { leaseUntil: new Date(0) },
        });
        const reclaimed = await otherBox.claim();
        assert.equal(reclaimed?.id, claimed.id);
        assert.notEqual(reclaimed?.leaseToken, claimed.leaseToken);
        assert.equal(reclaimed?.attempts, 2);
        await assert.rejects(
          outbox.complete(claimed.id, claimed.leaseToken!),
          /LEASE_LOST/,
        );
        await otherBox.retry(reclaimed!.id, reclaimed!.leaseToken!);
        assert.equal(
          (
            await client.notificationJob.findUniqueOrThrow({
              where: { id: claimed.id },
            })
          ).state,
          "FAILED",
        );
        assert.equal(await outbox.claim(), null);
        const expiring = await client.notificationJob.findFirstOrThrow({
          where: { state: "QUEUED" },
        });
        await client.notificationJob.update({
          where: { id: expiring.id },
          data: { availableAt: new Date(0), maxAttempts: 1 },
        });
        const expired = await outbox.claim();
        await client.notificationJob.update({
          where: { id: expired!.id },
          data: { leaseUntil: new Date(0) },
        });
        assert.equal(await outbox.claim(), null);
        assert.equal(
          (
            await client.notification.findUniqueOrThrow({
              where: { id: expired!.notificationId },
            })
          ).status,
          "FAILED",
        );

        const next = await client.notificationJob.findFirstOrThrow({
          where: { state: "QUEUED" },
        });
        await client.notificationJob.update({
          where: { id: next.id },
          data: { availableAt: new Date(0) },
        });
        const firstAttempt = await outbox.claim();
        await outbox.retry(firstAttempt!.id, firstAttempt!.leaseToken!);
        assert.equal(await outbox.claim(), null); // backoff prevents immediate redelivery
        const pending = await client.notificationJob.findUniqueOrThrow({
          where: { id: firstAttempt!.id },
        });
        assert.equal(pending.attempts, 1);
        assert.equal(pending.state, "QUEUED");
        assert.equal(pending.lastError, "DELIVERY_FAILED");
        await client.notificationJob.update({
          where: { id: pending.id },
          data: { availableAt: new Date(0) },
        });
        const success = await outbox.claim();
        await outbox.complete(success!.id, success!.leaseToken!);
        assert.equal(
          (
            await client.notification.findUniqueOrThrow({
              where: { id: success!.notificationId },
            })
          ).status,
          "SENT",
        );
      } finally {
        await secondClient.$disconnect();
      }
    },
  );
}
