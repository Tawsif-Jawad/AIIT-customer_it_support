import { test as base, expect } from "@playwright/test";
import { startOidcApplication } from "../support/oidc-application.ts";
const test = base.extend<{
  oidc: Awaited<ReturnType<typeof startOidcApplication>>;
}>({
  oidc: async ({}, use) => {
    const fixture = await startOidcApplication();
    try {
      await use(fixture);
    } finally {
      await fixture.close();
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
  const state = oidc.app.store.getState();
  for (const session of state.authSessions || [])
    session.expiresAt = Date.now() - 1;
  oidc.app.store.persist();
  await page.click("#refresh-tickets-btn");
  await expect(page.locator("#workspace-section")).toBeHidden();
  await expect(page.locator("#login-section")).toBeVisible();
  await expect(page.locator("#global-feedback")).toContainText(
    "Session expired or invalid",
  );
});
