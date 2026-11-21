import { test as base, expect } from "@playwright/test";
import { connectPostgres } from "../../apps/api/src/postgres-runtime.ts";
import { disposablePostgres } from "../support/disposable-postgres.ts";
import { startOidcApplication } from "../support/oidc-application.ts";
const test = base.extend<{
  oidc: Pick<Awaited<ReturnType<typeof startOidcApplication>>, "issuer" | "publicUrl" | "expireSessions" | "chooseRole">;
}>({
  oidc: async ({}, use) => {
    const postgres = process.env.AIIT_E2E_POSTGRES === 'true';
    const cluster = postgres ? await disposablePostgres() : undefined;
    let client;
    try {
      if (cluster) client = await connectPostgres({ NODE_ENV: 'test', STORAGE_MODE: 'postgres', DATABASE_URL: cluster.url });
      const fixture = client ? await startOidcApplication(client) : await startOidcApplication();
      try {
        const ready = await fixture.app.inject({ method: 'GET', url: '/api/ready' });
        expect(ready.data.storageMode).toBe(postgres ? 'postgres' : 'json');
        await use(fixture);
      } finally {
        await fixture.close();
      }
    } finally {
      await client?.$disconnect();
      cluster?.close();
    }
  },
});
test.use({ trace: "off", screenshot: "off" });
test("enterprise sign-in restores a cookie session, creates an authorized request and logs out", async ({
  page,
  context,
  oidc,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(oidc.publicUrl + "/app");
  await expect(page.locator("#enterprise-login-btn")).toBeVisible();
  await expect(page.locator("#login-submit-btn")).toBeHidden();
  await expect(page.locator("#auth-mode-notice")).toContainText(
    "Enterprise sign-in",
  );
  await page.click("#enterprise-login-btn");
  await expect(page.locator("#workspace-section")).toBeVisible();
  await expect(page.getByTestId("active-user-badge")).toContainText("EMPLOYEE");
  await expect(page.locator("#tab-btn-approvals")).toBeHidden();
  const cookie = (await context.cookies()).find(
    (c) => c.name === "itsupport_session",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Strict");
  expect(
    await page.evaluate(() =>
      JSON.stringify({ local: localStorage, session: sessionStorage }),
    ),
  ).not.toContain("SYNTHETIC_ACCESS");
  await page.reload();
  await expect(page.locator("#workspace-section")).toBeVisible();
  await page.click('button[data-tab="create"]');
  await page.selectOption("#ticket-category", "cat-outlook-config");
    await page.selectOption('#ticket-service-osPlatform', 'macOS');
  await page.fill("#ticket-title", "OIDC browser isolated request");
  await page.fill(
    "#ticket-description",
    "Synthetic Outlook setup from an enterprise-authenticated browser",
  );
  await page.click("#submit-ticket-btn");
  await expect(page.getByTestId("detail-ticket-status")).toHaveText(
    "RESOLVED_PENDING_CONFIRMATION",
  );
  await page.click("#logout-btn");
  await expect(page.locator("#login-section")).toBeVisible();
  await page.reload();
  await expect(page.locator("#workspace-section")).toBeHidden();
  expect(errors).toEqual([]);
});
test("enterprise provider failure stays fail-closed and never offers development identity selection", async ({
  page,
  oidc,
}) => {
  oidc.issuer.setMode("bad-discovery");
  await page.goto(oidc.publicUrl + "/app");
  await expect(page.locator("#enterprise-login-btn")).toBeVisible();
  await page.click("#enterprise-login-btn");
  await expect(page.locator("body")).toContainText("OIDC_UNAVAILABLE");
  await page.goto(oidc.publicUrl + "/app");
  await expect(page.locator("#login-identity-select")).toBeHidden();
  await expect(page.locator("#login-submit-btn")).toBeHidden();
});
test("expired enterprise session clears private workspace and gives sign-in feedback", async ({
  page,
  oidc,
}) => {
  await page.goto(oidc.publicUrl + "/app");
  await page.click("#enterprise-login-btn");
  await expect(page.locator("#workspace-section")).toBeVisible();
  await page.click('button[data-tab="tickets"]');
  await oidc.expireSessions();
  await page.click("#refresh-tickets-btn");
  await expect(page.locator("#workspace-section")).toBeHidden();
  await expect(page.locator("#login-section")).toBeVisible();
  await expect(page.locator("#global-feedback")).toContainText(
    "Session expired or invalid",
  );
});


test("enterprise IT assignment requires the session's Origin and CSRF token", async ({ page, oidc }) => {
  oidc.chooseRole("IT_ADMIN");
  await page.goto(oidc.publicUrl + "/app");
  await page.click("#enterprise-login-btn");
  await expect(page.getByTestId("active-user-badge")).toContainText("IT_ADMIN");
  await page.click('button[data-tab="tickets"]');
  const ticketPath = oidc.publicUrl + "/api/tickets/ticket-seed-1002";
  await page.locator('[data-ticket-id="ticket-seed-1002"]').click();
  const detail = await (await page.request.get(ticketPath)).json();
  const session = await (await page.request.get(oidc.publicUrl + "/api/auth/me")).json();
  const command = {
    assigneeId: detail.ticket.assigneeId,
    expectedAssigneeId: detail.ticket.assigneeId,
    expectedRevision: detail.assignment.revision,
    reason: "Synthetic enterprise assignment check",
  };
  const assign = (origin: string, csrf: string, data: object | string = command) => page.request.post(ticketPath + "/assign", {
    headers: { origin, "x-csrf-token": csrf, "content-type": "application/json" }, data,
  });
  expect((await assign(oidc.publicUrl, "wrong-csrf")).status()).toBe(403);
  expect((await assign("https://untrusted.example.test", session.csrfToken)).status()).toBe(403);
  expect((await assign(oidc.publicUrl, session.csrfToken, "{")).status()).toBe(400);
  await page.getByLabel("Assignment reason").fill(command.reason);
  await page.getByRole("button", { name: "Save assignment" }).click();
  await expect(page.locator("#global-feedback")).toContainText("Ticket already assigned");
});
