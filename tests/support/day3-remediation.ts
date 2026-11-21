import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import type { TestContext } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PostgresRepository } from "../../apps/api/src/postgres-repository.ts";
import { PostgresOutbox } from "../../apps/api/src/postgres-outbox.ts";

export async function exerciseDay3Remediation(
  t: TestContext,
  client: PrismaClient,
  url: string,
) {
  const repo = new PostgresRepository(client);
  const employee = "user-emp-tawsif",
    customer = "user-cust-rahim",
    other = "user-emp-nadia",
    admin = "user-it-kamal",
    cto = "user-cto-farhana";
  const create = (actor = employee) =>
    repo.createTicket(actor, {
      title: "Remediation synthetic request",
      description: "Isolated policy parity regression fixture",
      serviceCategoryId: "cat-outlook-config", customFormPayload: { osPlatform: 'macOS' },
    severity: 'HIGH',
    });
  const snapshot = () =>
    Promise.all([
      client.ticket.findMany({ orderBy: { id: "asc" } }),
      client.ticketEvent.findMany({ orderBy: { id: "asc" } }),
      client.auditLog.findMany({ orderBy: { id: "asc" } }),
      client.notification.findMany({ orderBy: { id: "asc" } }),
      client.notificationJob.findMany({ orderBy: { id: "asc" } }),
      client.approval.findMany({ orderBy: { id: "asc" } }),
    ]);
  let counter = 0;
  const approval = async (requiredRole: "IT_ADMIN" | "CTO" = "IT_ADMIN") => {
    const ticket = await create();
    return client.approval.create({
      data: {
        id: `remediation-approval-${++counter}`,
        ticketId: ticket.id,
        actionType: "SYNTHETIC_REVIEW_ONLY",
        requiredRole,
        requestedById: employee,
        justification: "Nonexecuting synthetic test",
      },
    });
  };
  for (const actor of [admin, cto])
    await t.test(
      `remediation valid ${actor === admin ? "IT" : "CTO"} escalation is CRITICAL, redacted and atomic`,
      async () => {
        const ticket = await create();
        const updated = await repo.transition(
          actor,
          ticket.id,
          0,
          "ESCALATED_TO_CTO",
          "  Investigate outage password=TEST_ONLY  ",
        );
        assert.equal(updated.status, "ESCALATED_TO_CTO");
        assert.equal(updated.severity, "CRITICAL");
        assert.equal(updated.version, 1);
        assert.equal(
          updated.escalationReason,
          "Investigate outage password=[REDACTED_SECRET]",
        );
        const event = await client.ticketEvent.findFirstOrThrow({
          where: { ticketId: ticket.id, toStatus: "ESCALATED_TO_CTO" },
        });
        assert.equal(event.actorId, actor);
        assert.equal(event.fromStatus, "ASSIGNED_TO_IT");
        const audit = await client.auditLog.findFirstOrThrow({
          where: { resourceId: ticket.id, action: "TICKET_ESCALATED_TO_CTO" },
        });
        assert.equal(audit.actorId, actor);
        assert.equal(audit.resource, "Ticket");
        assert.ok(!JSON.stringify([event, audit]).includes("TEST_ONLY"));
        assert.equal(
          await client.notificationJob.count({
            where: { id: `job-${ticket.id}-v1` },
          }),
          1,
        );
        await assert.rejects(
          repo.transition(
            admin,
            ticket.id,
            1,
            "IN_PROGRESS",
            "IT cannot bypass CTO",
          ),
          /TRANSITION_NOT_ALLOWED/,
        );
      },
    );
  await t.test(
    "remediation escalation accepts exactly five trimmed reason characters",
    async () => {
      const ticket = await create();
      const updated = await repo.transition(
        admin,
        ticket.id,
        0,
        "ESCALATED_TO_CTO",
        "  valid  ",
      );
      assert.equal(updated.escalationReason, "valid");
      assert.equal(updated.severity, "CRITICAL");
    },
  );
  for (const [label, reason] of [
    ["missing", undefined],
    ["blank", "   "],
    ["short", "abc"],
    ["trimmed short", "  abcd  "],
  ] as const)
    await t.test(
      `remediation escalation rejects ${label} reason without writes`,
      async () => {
        const ticket = await create();
        const before = await snapshot();
        await assert.rejects(
          repo.transition(
            admin,
            ticket.id,
            0,
            "ESCALATED_TO_CTO",
            reason as string,
          ),
          /VALIDATION_ERROR/,
        );
        assert.deepEqual(await snapshot(), before);
      },
    );
  await t.test(
    "remediation requester escalation, cross-resource access and invalid state fail without writes",
    async () => {
      const ticket = await create();
      const customerTicket = await create(customer);
      const before = await snapshot();
      for (const [actor, target] of [
        [employee, ticket.id],
        [customer, customerTicket.id],
        [other, ticket.id],
        [customer, ticket.id],
      ])
        await assert.rejects(
          repo.transition(
            actor,
            target,
            0,
            "ESCALATED_TO_CTO",
            "Meaningful reason",
          ),
          /FORBIDDEN|TRANSITION_NOT_ALLOWED/,
        );
      assert.deepEqual(await snapshot(), before);
      const closed = await client.ticket.update({
        where: { id: ticket.id },
        data: { status: "CLOSED" },
      });
      const closedBefore = await snapshot();
      await assert.rejects(
        repo.transition(
          cto,
          ticket.id,
          closed.version,
          "ESCALATED_TO_CTO",
          "Meaningful reason",
        ),
        /TRANSITION_NOT_ALLOWED/,
      );
      assert.deepEqual(await snapshot(), closedBefore);
    },
  );
  await t.test(
    "remediation concurrent escalations preserve one complete version and intent",
    async () => {
      const ticket = await create();
      const independent = new PrismaClient({ datasources: { db: { url } } });
      try {
        const results = await Promise.allSettled([
          repo.transition(
            admin,
            ticket.id,
            0,
            "ESCALATED_TO_CTO",
            "IT review reason",
          ),
          new PostgresRepository(independent).transition(
            cto,
            ticket.id,
            0,
            "ESCALATED_TO_CTO",
            "CTO review reason",
          ),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        const final = await client.ticket.findUniqueOrThrow({
          where: { id: ticket.id },
        });
        assert.equal(final.version, 1);
        assert.equal(final.severity, "CRITICAL");
        assert.equal(
          await client.ticketEvent.count({
            where: { ticketId: ticket.id, toStatus: "ESCALATED_TO_CTO" },
          }),
          1,
        );
        assert.equal(
          await client.auditLog.count({
            where: { resourceId: ticket.id, action: "TICKET_ESCALATED_TO_CTO" },
          }),
          1,
        );
        assert.equal(
          await client.notificationJob.count({
            where: { id: `job-${ticket.id}-v1` },
          }),
          1,
        );
        const before = await snapshot();
        await assert.rejects(
          repo.transition(cto, ticket.id, 0, "IN_PROGRESS", "Stale update"),
          /CONFLICT/,
        );
        assert.deepEqual(await snapshot(), before);
      } finally {
        await independent.$disconnect();
      }
    },
  );
  for (const [actor, requiredRole, decision] of [
    [admin, "IT_ADMIN", "APPROVED"],
    [cto, "CTO", "APPROVED"],
    [cto, "IT_ADMIN", "REJECTED"],
  ] as const)
    await t.test(
      `remediation ${requiredRole} ${decision} audit names the Approval and preserves rationale`,
      async () => {
        const row = await approval(requiredRole);
        await repo.decideApproval(
          actor,
          row.id,
          decision,
          "  Reviewed password=TEST_ONLY  ",
        );
        const saved = await client.approval.findUniqueOrThrow({
          where: { id: row.id },
        });
        assert.equal(saved.status, decision);
        assert.equal(saved.version, 1);
        assert.equal(
          saved.decisionNotes,
          "Reviewed password=[REDACTED_SECRET]",
        );
        const audit = await client.auditLog.findFirstOrThrow({
          where: { resource: "Approval", resourceId: row.id },
        });
        assert.equal(audit.action, `APPROVAL_${decision}`);
        assert.equal(audit.actorId, actor);
        assert.equal(audit.actorRole, actor === admin ? "IT_ADMIN" : "CTO");
        assert.deepEqual(audit.details, {
          ticketId: row.ticketId,
          actionType: row.actionType,
          decision,
          decisionNotes: saved.decisionNotes,
        });
        const event = await client.ticketEvent.findFirstOrThrow({
          where: { ticketId: row.ticketId, eventType: `APPROVAL_${decision}` },
        });
        assert.deepEqual(event.metadata, {
          approvalId: row.id,
          actionType: row.actionType,
          decision,
          decisionNotes: saved.decisionNotes,
        });
        assert.equal(
          await client.auditLog.count({
            where: {
              resource: "Ticket",
              resourceId: row.ticketId,
              action: `APPROVAL_${decision}`,
            },
          }),
          0,
        );
        assert.equal(
          await client.notificationJob.count({
            where: { id: `job-${row.id}` },
          }),
          1,
        );
        const before = await snapshot();
        await assert.rejects(
          repo.decideApproval(actor, row.id, decision, "Replay"),
          /CONFLICT/,
        );
        assert.deepEqual(await snapshot(), before);
      },
    );
  await t.test(
    "remediation approval reloads current role and denies unauthorized identities",
    async () => {
      const it = await approval(),
        critical = await approval("CTO");
      const before = await snapshot();
      for (const actor of [employee, customer, other])
        await assert.rejects(
          repo.decideApproval(actor, it.id, "APPROVED", "Meaningful rationale"),
          /FORBIDDEN/,
        );
      await assert.rejects(
        repo.decideApproval(
          admin,
          critical.id,
          "APPROVED",
          "Meaningful rationale",
        ),
        /FORBIDDEN/,
      );
      const revoked = await client.user.create({
        data: {
          id: "remediation-revoked-reviewer",
          email: "revoked-reviewer@example.test",
          displayName: "Synthetic reviewer",
          sbuId: "sbu-corp-003",
          roleId: "role-it-admin",
        },
      });
      await client.user.update({
        where: { id: revoked.id },
        data: { roleId: "role-employee" },
      });
      await assert.rejects(
        repo.decideApproval(revoked.id, it.id, "APPROVED", "Role was revoked"),
        /FORBIDDEN/,
      );
      assert.deepEqual(await snapshot(), before);
    },
  );
  await t.test(
    "remediation invalid approval decision and absent rationale produce no successful history",
    async () => {
      const row = await approval();
      const before = await snapshot();
      for (const notes of [undefined, "", "   "])
        await assert.rejects(
          repo.decideApproval(admin, row.id, "APPROVED", notes as string),
          /VALIDATION_ERROR/,
        );
      await assert.rejects(
        repo.decideApproval(
          admin,
          row.id,
          "UNKNOWN" as never,
          "Meaningful rationale",
        ),
        /VALIDATION_ERROR/,
      );
      assert.deepEqual(await snapshot(), before);
    },
  );
  await t.test(
    "remediation opposing approvals produce exactly one correctly attributed audit",
    async () => {
      const row = await approval();
      const results = await Promise.allSettled([
        repo.decideApproval(admin, row.id, "APPROVED", "IT rationale"),
        repo.decideApproval(cto, row.id, "REJECTED", "CTO rationale"),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const saved = await client.approval.findUniqueOrThrow({
        where: { id: row.id },
      });
      const audits = await client.auditLog.findMany({
        where: { resource: "Approval", resourceId: row.id },
      });
      assert.equal(audits.length, 1);
      assert.equal(audits[0].actorId, saved.approverId);
      assert.equal(audits[0].action, `APPROVAL_${saved.status}`);
      assert.equal(
        await client.ticketEvent.count({
          where: {
            ticketId: row.ticketId,
            eventType: { startsWith: "APPROVAL_" },
          },
        }),
        1,
      );
    },
  );
  await t.test(
    "remediation injected notification failure rolls back escalation and approval with their complete histories",
    async () => {
      const ticket = await create();
      const row = await approval();
      await client.$executeRawUnsafe(
        `CREATE FUNCTION remediation_fail_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic late failure'; END $$`,
      );
      await client.$executeRawUnsafe(
        'CREATE TRIGGER remediation_fail BEFORE INSERT ON "NotificationJob" FOR EACH ROW EXECUTE FUNCTION remediation_fail_job()',
      );
      try {
        const before = await snapshot();
        await assert.rejects(
          repo.transition(
            admin,
            ticket.id,
            0,
            "ESCALATED_TO_CTO",
            "Meaningful reason",
          ),
        );
        assert.deepEqual(await snapshot(), before);
        await assert.rejects(
          repo.decideApproval(
            admin,
            row.id,
            "APPROVED",
            "Meaningful rationale",
          ),
        );
        assert.deepEqual(await snapshot(), before);
      } finally {
        await client.$executeRawUnsafe(
          'DROP TRIGGER remediation_fail ON "NotificationJob"',
        );
        await client.$executeRawUnsafe("DROP FUNCTION remediation_fail_job()");
      }
    },
  );
  await t.test(
    "remediation outbox rejects acknowledgment whose lease expires while waiting for a row lock",
    async () => {
      await client.notificationJob.updateMany({
        where: { state: "QUEUED" },
        data: { availableAt: new Date(Date.now() + 3600000) },
      });
      const notification = await client.notification.create({
        data: {
          id: "remediation-lease-notification",
          recipientId: employee,
          recipientEmail: "fixture@example.test",
          channel: "IN_APP_ONLY",
          subject: "Synthetic lease fixture",
          body: "No external delivery",
        },
      });
      await client.notificationJob.create({
        data: { id: "remediation-lease-job", notificationId: notification.id },
      });
      const outbox = new PostgresOutbox(client);
      const claim = await outbox.claim(1000);
      assert.equal(claim?.id, "remediation-lease-job");
      const blocker = new PrismaClient({ datasources: { db: { url } } });
      let release!: () => void, locked!: () => void;
      const gate = new Promise<void>((resolve) => {
          release = resolve;
        }),
        ready = new Promise<void>((resolve) => {
          locked = resolve;
        });
      const holding = blocker.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "NotificationJob" WHERE id=${claim!.id} FOR UPDATE`;
        locked();
        await gate;
      });
      try {
        await ready;
        const completion = outbox.complete(claim!.id, claim!.leaseToken!).then(
          () => ({ ok: true, error: "" }),
          (error) => ({ ok: false, error: (error as Error).message }),
        );
        await delay(1100);
        release();
        await holding;
        const outcome = await completion;
        assert.equal(outcome.ok, false);
        assert.equal(outcome.error, "LEASE_LOST");
        assert.equal(
          (
            await client.notificationJob.findUniqueOrThrow({
              where: { id: claim!.id },
            })
          ).state,
          "PROCESSING",
        );
        const reclaimed = await outbox.claim();
        assert.equal(reclaimed?.id, claim!.id);
        assert.notEqual(reclaimed?.leaseToken, claim!.leaseToken);
      } finally {
        release();
        await holding;
        await blocker.$disconnect();
      }
    },
  );
}
