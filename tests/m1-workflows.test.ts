import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApiServer, type AppInstance } from "../apps/api/src/app.ts";
import { ticketNumberFor } from "../apps/api/src/ticket-workflow.ts";

async function fixture(run: (app: AppInstance, file: string) => Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiit-m1-"));
  const file = path.join(dir, "db.json");
  try {
    await run(createApiServer(file), file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function login(app: AppInstance, role: string) {
  const user = app.store
    .getState()
    .users.find((user) => user.roleName === role)!;
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    body: { email: user.email },
  });
  assert.equal(response.status, 200);
  return response.data.token;
}

test("M1 disabled CTO blocks escalation atomically", () =>
  fixture(async (app) => {
    const token = await login(app, "IT_ADMIN");
    app.store
      .getState()
      .users.find((user) => user.roleName === "CTO")!.isActive = false;
    app.store.persist();
    const before = structuredClone(app.store.getState());
    const response = await app.inject({
      method: "POST",
      url: "/api/tickets/ticket-seed-1002/escalate-cto",
      token,
      body: { reason: "Needs executive review" },
    });
    assert.equal(response.status, 409);
    assert.deepEqual(app.store.getState(), before);
  }));

test("M1 direct AD request requires its catalog fields", () =>
  fixture(async (app) => {
    const token = await login(app, "EMPLOYEE");
    const response = await app.inject({
      method: "POST",
      url: "/api/tickets",
      token,
      body: {
        title: "Synthetic AD group request",
        description: "Please review synthetic group access",
        serviceCategoryId: "cat-ad-account",
        customFormPayload: {},
      },
    });
    assert.equal(response.status, 400);
  }));

test("M1 numbering advances past sparse historical numbers and survives deletion and restart", () =>
  fixture(async (app, file) => {
    const token = await login(app, "EMPLOYEE");
    const historical = app.store.getState().tickets[1];
    historical.ticketNumber = "REQ-2024-9999";
    app.store.persist();
    const body = {
      title: "Synthetic Outlook request",
      description: "Help configure Outlook TLS",
      serviceCategoryId: "cat-outlook-config",
      customFormPayload: { osPlatform: "macOS" },
    };
    const first = await app.inject({
      method: "POST",
      url: "/api/tickets",
      token,
      body,
    });
    assert.equal(first.status, 201);
    const year = new Date().getUTCFullYear();
    assert.equal(first.data.ticket.ticketNumber, `REQ-${year}-10000`);
    const state = app.store.getState();
    const id = first.data.ticket.id;
    state.ticketEvents = state.ticketEvents.filter(
      (row) => row.ticketId !== id,
    );
    state.aiActionLogs = state.aiActionLogs.filter(
      (row) => row.ticketId !== id,
    );
    state.notifications = state.notifications.filter(
      (row) => row.ticketId !== id,
    );
    state.tickets = state.tickets.filter((row) => row.id !== id);
    app.store.persist();
    const restarted = createApiServer(file);
    const second = await restarted.inject({
      method: "POST",
      url: "/api/tickets",
      token,
      body,
    });
    assert.equal(second.status, 201);
    assert.equal(second.data.ticket.ticketNumber, `REQ-${year}-10001`);
    assert.equal(
      restarted.store
        .getState()
        .tickets.find((ticket) => ticket.id === historical.id)?.ticketNumber,
      "REQ-2024-9999",
    );
  }));

test("M1 UTC calendar boundary preserves the prefix and global sequence", () => {
  assert.equal(
    ticketNumberFor(
      "hardware-incident",
      2000,
      new Date("2026-12-31T23:59:59Z"),
    ),
    "INC-2026-2000",
  );
  assert.equal(
    ticketNumberFor(
      "outlook-configuration",
      2001,
      new Date("2027-01-01T00:00:00Z"),
    ),
    "REQ-2027-2001",
  );
});

test("M1 empty history starts at 1001 and rolls back allocation on an intent failure", () =>
  fixture(async (app) => {
    const token = await login(app, "EMPLOYEE");
    const state = app.store.getState();
    Object.assign(state, {
      tickets: [],
      ticketEvents: [],
      approvals: [],
      aiActionLogs: [],
      notifications: [],
    });
    app.store.persist();
    const body = {
      title: "Synthetic mailbox request",
      description: "Create a synthetic mailbox for fixture tests",
      serviceCategoryId: "cat-email-provisioning",
      customFormPayload: {
        desiredEmailPrefix: "synthetic.mailbox",
        managerEmail: "manager@example.test",
      },
    };
    const create = () =>
      app.inject({ method: "POST", url: "/api/tickets", token, body });
    const before = structuredClone(app.store.getState());
    const enqueue = app.queueProcessor.enqueueNotification;
    app.queueProcessor.enqueueNotification = async () => {
      throw new Error("Injected intent failure");
    };
    try {
      assert.equal((await create()).status, 500);
      assert.deepEqual(app.store.getState(), before);
    } finally {
      app.queueProcessor.enqueueNotification = enqueue;
    }
    const results = await Promise.all([create(), create()]);
    assert.deepEqual(
      results.map((result) => result.status),
      [201, 201],
    );
    assert.deepEqual(
      results.map((result) =>
        result.data.ticket.ticketNumber.split("-").at(-1),
      ),
      ["1001", "1002"],
    );
    assert.equal(app.store.getState().approvals.length, 2);
  }));

test("M1 escalation rolls back when JSON notification intent cannot be created", () =>
  fixture(async (app) => {
    const token = await login(app, "IT_ADMIN");
    const before = structuredClone(app.store.getState());
    app.queueProcessor.enqueueNotification = async () => {
      throw new Error("Injected intent failure");
    };
    const result = await app.inject({
      method: "POST",
      url: "/api/tickets/ticket-seed-1002/escalate-cto",
      token,
      body: { reason: "Needs executive review" },
    });
    assert.equal(result.status, 500);
    assert.deepEqual(app.store.getState(), before);
  }));
