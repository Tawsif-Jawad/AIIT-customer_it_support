import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApiServer, type AppInstance } from "../apps/api/src/app.ts";
async function fixture(fn: (app: AppInstance) => Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiit-remediation-json-"));
  try {
    await fn(createApiServer(path.join(dir, "db.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const login = async (app: AppInstance, role: string) => {
  const user = app.store.getState().users.find((row) => row.roleName === role)!;
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    body: { email: user.email },
  });
  assert.equal(response.status, 200);
  return response.data.token as string;
};
test("Day3 remediation JSON dedicated escalation retains reason, severity and governance behavior", () =>
  fixture(async (app) => {
    const admin = await login(app, "IT_ADMIN"),
      cto = await login(app, "CTO");
    for (const [index, token] of [admin, cto].entries()) {
      const created = await app.inject({
        method: "POST",
        url: "/api/tickets",
        token,
        body: {
          title: `Synthetic escalation fixture ${index}`,
          description:
            "Synthetic group membership review requiring human approval",
          serviceCategoryId: "cat-ad-account", customFormPayload: { targetAdGroup: 'Synthetic readers', businessJustification: 'Synthetic review access' },
        },
      });
      assert.equal(created.status, 201);
      const ticket = created.data.ticket;
      const before = JSON.stringify(app.store.getState());
      for (const reason of [undefined, "  ", "abcd", "  abcd  "]) {
        const rejected = await app.inject({
          method: "POST",
          url: `/api/tickets/${ticket.id}/escalate-cto`,
          token,
          body: { reason },
        });
        assert.equal(rejected.status, 400);
        assert.equal(JSON.stringify(app.store.getState()), before);
      }
      const response = await app.inject({
        method: "POST",
        url: `/api/tickets/${ticket.id}/escalate-cto`,
        token,
        body: { reason: "Reviewed outage password=TEST_ONLY" },
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.ticket.severity, "CRITICAL");
      assert.equal(response.data.ticket.status, "ESCALATED_TO_CTO");
      assert.equal(
        response.data.ticket.escalationReason,
        "Reviewed outage password=[REDACTED_SECRET]",
      );
      const audit = app.store
        .getState()
        .auditLogs.find(
          (row) =>
            row.resourceId === ticket.id &&
            row.action === "TICKET_ESCALATED_TO_CTO",
        )!;
      assert.equal(audit.resource, "Ticket");
    }
  }));
test("Day3 remediation JSON requester escalation remains forbidden and CTO review remains required", () =>
  fixture(async (app) => {
    const employee = await login(app, "EMPLOYEE"),
      customer = await login(app, "CUSTOMER"),
      admin = await login(app, "IT_ADMIN");
    for (const token of [employee, customer]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/tickets/ticket-seed-1002/escalate-cto",
        token,
        body: { reason: "Unprivileged request" },
      });
      assert.equal(res.status, 403);
    }
    const res = await app.inject({
      method: "POST",
      url: "/api/tickets/ticket-seed-1003/transition",
      token: admin,
      body: { status: "IN_PROGRESS", notes: "Must await CTO" },
    });
    assert.equal(res.status, 403);
    assert.equal(
      app.store.getState().tickets.find((row) => row.id === "ticket-seed-1003")!
        .status,
      "ESCALATED_TO_CTO",
    );
  }));
test("Day3 remediation JSON decisions retain Approval audit attribution and redacted rationale", () =>
  fixture(async (app) => {
    const admin = await login(app, "IT_ADMIN"),
      cto = await login(app, "CTO");
    for (const [id, token, decision] of [
      ["approval-seed-001", admin, "APPROVED"],
      ["approval-seed-002", cto, "REJECTED"],
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: `/api/approvals/${id}/decide`,
        token,
        body: { decision, decisionNotes: "Reviewed password=TEST_ONLY" },
      });
      assert.equal(response.status, 200);
      const row = app.store
        .getState()
        .approvals.find((item) => item.id === id)!;
      const audit = app.store
        .getState()
        .auditLogs.find(
          (item) =>
            item.resourceId === id && item.action === `APPROVAL_${decision}`,
        )!;
      assert.equal(audit.resource, "Approval");
      assert.equal(audit.actorId, row.approverId);
      assert.deepEqual(audit.details, {
        ticketId: row.ticketId,
        actionType: row.actionType,
        decisionNotes: "Reviewed password=[REDACTED_SECRET]",
      });
      const replay = await app.inject({
        method: "POST",
        url: `/api/approvals/${id}/decide`,
        token,
        body: { decision, decisionNotes: "Replay" },
      });
      assert.equal(replay.status, 409);
    }
  }));
