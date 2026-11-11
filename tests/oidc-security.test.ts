import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  startOidcApplication,
  oidcLogin,
  cookieFrom,
} from "./support/oidc-application.ts";
import {
  EnterpriseAuthAdapter,
  readEnterpriseSettings,
} from "../apps/api/src/enterprise-auth.ts";
const fixture = async (
  fn: (f: Awaited<ReturnType<typeof startOidcApplication>>) => Promise<void>,
) => {
  const f = await startOidcApplication();
  try {
    await fn(f);
  } finally {
    await f.close();
  }
};
const me = async (
  f: Awaited<ReturnType<typeof startOidcApplication>>,
  cookie: string,
) => fetch(f.publicUrl + "/api/auth/me", { headers: { cookie } });
test("OIDC code PKCE nonce and trusted JWKS establish an opaque session without upstream tokens", () =>
  fixture(async (f) => {
    const auth = await oidcLogin(f);
    assert.equal(auth.response.status, 303);
    assert.match(auth.cookie, /^itsupport_session=[A-Za-z0-9_-]{43}$/);
    assert.match(
      auth.response.headers.getSetCookie()[0],
      /HttpOnly.*SameSite=Strict/,
    );
    const response = await me(f, auth.cookie);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.user.roleName, "EMPLOYEE");
    assert.equal(data.user.sbuId, "sbu-tech-001");
    assert.equal(typeof data.csrfToken, "string");
    assert.equal(auth.response.headers.get("location"), "/app");
    assert.ok(f.issuer.stats().jwksRequests > 0);
    const source = fs.readFileSync(f.file, "utf8");
    assert.ok(!source.includes(auth.cookie.split("=")[1]));
    assert.ok(!source.includes("SYNTHETIC_ACCESS"));
    assert.ok(!source.includes("SYNTHETIC_REFRESH"));
    assert.equal((await fetch(f.publicUrl + "/api/tickets")).status, 401);
    assert.equal(
      (
        await fetch(f.publicUrl + "/api/auth/me", {
          headers: { authorization: "Bearer " + auth.cookie.split("=")[1] },
        })
      ).status,
      401,
    );
  }));
for (const mode of [
  "wrong-issuer",
  "wrong-audience",
  "wrong-nonce",
  "bad-signature",
  "wrong-alg",
  "expired",
  "future-nbf",
  "future-iat",
  "no-id-token",
])
  test(`OIDC rejects ${mode} without establishing a session or success audit`, () =>
    fixture(async (f) => {
      f.issuer.setMode(mode);
      const before = fs.readFileSync(f.file, "utf8");
      const auth = await oidcLogin(f);
      assert.equal(auth.response.status, 400);
      assert.equal(auth.cookie, "");
      const body = await auth.response.text();
      assert.ok(!body.includes("SYNTHETIC_"));
      assert.ok(!body.includes("id_token"));
      assert.equal(fs.readFileSync(f.file, "utf8"), before);
    }));
for (const mode of ["bad-discovery", "unsafe-endpoint", "unavailable"])
  test(`OIDC fails closed for ${mode} with no development fallback`, () =>
    fixture(async (f) => {
      f.issuer.setMode(mode);
      const start = await fetch(f.publicUrl + "/api/auth/oidc/login", {
        redirect: "manual",
      });
      assert.equal(start.status, 503);
      assert.equal(
        (await fetch(f.publicUrl + "/api/auth/identities")).status,
        503,
      );
      assert.equal(
        (
          await fetch(f.publicUrl + "/api/auth/login", {
            method: "POST",
            headers: {
              origin: f.publicUrl,
              "content-type": "application/json",
            },
            body: JSON.stringify({ email: "not-proof@example.test" }),
          })
        ).status,
        503,
      );
    }));
test("OIDC callback is bound to browser cookie, state, PKCE, one-time consumption and expiry", () =>
  fixture(async (f) => {
    const start = await fetch(f.publicUrl + "/api/auth/oidc/login", {
      redirect: "manual",
    });
    const flow = cookieFrom(start, "aiit_oidc_flow");
    const url = new URL(start.headers.get("location")!);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    url.searchParams.set("code_challenge", "invalid-challenge");
    const auth = await fetch(url, { redirect: "manual" });
    const callback = auth.headers.get("location")!;
    assert.equal((await fetch(callback, { redirect: "manual" })).status, 400);
    assert.equal(
      (await fetch(callback, { redirect: "manual", headers: { cookie: flow } }))
        .status,
      400,
    );
    assert.equal(f.app.store.getState().authSessions?.length || 0, 0);
    const second = await fetch(f.publicUrl + "/api/auth/oidc/login", {
      redirect: "manual",
    });
    const secondCookie = cookieFrom(second, "aiit_oidc_flow");
    const redirect = await fetch(second.headers.get("location")!, {
      redirect: "manual",
    });
    const wrongState = new URL(redirect.headers.get("location")!);
    wrongState.searchParams.set("state", "forged");
    const calls = f.issuer.stats().tokenRequests;
    assert.equal(
      (
        await fetch(wrongState, {
          redirect: "manual",
          headers: { cookie: secondCookie },
        })
      ).status,
      400,
    );
    assert.equal(f.issuer.stats().tokenRequests, calls);
    const good = await oidcLogin(f);
    assert.equal(good.response.status, 303);
    assert.equal(
      (
        await fetch(good.callback, {
          redirect: "manual",
          headers: { cookie: good.flow },
        })
      ).status,
      400,
    );
    const expiring = await fetch(f.publicUrl + "/api/auth/oidc/login", {
      redirect: "manual",
    });
    const flowCookie = cookieFrom(expiring, "aiit_oidc_flow");
    const approved = await fetch(expiring.headers.get("location")!, {
      redirect: "manual",
    });
    const originalNow = Date.now;
    try {
      Date.now = () => originalNow() + 301000;
      assert.equal(
        (
          await fetch(approved.headers.get("location")!, {
            redirect: "manual",
            headers: { cookie: flowCookie },
          })
        ).status,
        400,
      );
    } finally {
      Date.now = originalNow;
    }
  }));
test("OIDC refuses unknown disabled service and conflicting identity associations without email provisioning", () =>
  fixture(async (f) => {
    f.issuer.setSubject("unknown-subject");
    assert.equal((await oidcLogin(f)).response.status, 400);
    const user = f.app.store.getState().users[0];
    f.issuer.setSubject(user.oidcSubject);
    user.isActive = false;
    f.app.store.persist();
    assert.equal((await oidcLogin(f)).response.status, 400);
    const current = f.app.store.getState().users[0];
    current.isActive = true;
    current.roleId = "role-system";
    current.roleName = "SYSTEM_SERVICE";
    f.app.store.persist();
    assert.equal((await oidcLogin(f)).response.status, 400);
    const state = f.app.store.getState();
    const duplicate = {
      ...state.users[0],
      id: "duplicate-binding",
      email: "duplicate@example.test",
      roleId: "role-employee",
      roleName: "EMPLOYEE" as const,
    };
    state.users.push(duplicate);
    assert.throws(() => f.app.store.persist(), /Duplicate enterprise identity/);
  }));
test("OIDC sessions persist across API reload, expire, revoke and immediately observe role/SBU changes", () =>
  fixture(async (f) => {
    f.chooseRole("IT_ADMIN");
    const auth = await oidcLogin(f);
    assert.equal(auth.response.status, 303);
    assert.equal(
      (
        await fetch(f.publicUrl + "/api/approvals", {
          headers: { cookie: auth.cookie },
        })
      ).status,
      200,
    );
    const state = f.app.store.getState(),
      user = state.users.find((u) => u.roleName === "IT_ADMIN")!;
    user.roleName = "EMPLOYEE";
    user.roleId = "role-employee";
    f.app.store.persist();
    assert.equal(
      (
        await fetch(f.publicUrl + "/api/approvals", {
          headers: { cookie: auth.cookie },
        })
      ).status,
      403,
    );
    const { createApiServer } = await import("../apps/api/src/app.ts");
    const restarted = createApiServer(f.file);
    assert.equal(
      (
        await restarted.inject({
          method: "GET",
          url: "/api/auth/me",
          headers: { cookie: auth.cookie },
        })
      ).status,
      200,
    );
    const meResponse = await me(f, auth.cookie);
    const csrf = (await meResponse.json()).csrfToken;
    for (const headers of [
      { cookie: auth.cookie },
      { cookie: auth.cookie, origin: "https://attacker.example" },
      { cookie: auth.cookie, origin: f.publicUrl },
    ] as Record<string, string>[])
      assert.equal(
        (
          await fetch(f.publicUrl + "/api/auth/logout", {
            method: "POST",
            headers,
          })
        ).status,
        403,
      );
    assert.equal(
      (
        await fetch(f.publicUrl + "/api/auth/logout", {
          method: "POST",
          headers: {
            cookie: auth.cookie,
            origin: f.publicUrl,
            "x-csrf-token": csrf,
          },
        })
      ).status,
      200,
    );
    assert.equal((await me(f, auth.cookie)).status, 401);
    f.chooseRole("EMPLOYEE");
    const expired = await oidcLogin(f);
    const s = f.app.store
      .getState()
      .authSessions!.find(
        (row) =>
          row.id ===
          crypto
            .createHash("sha256")
            .update(expired.cookie.split("=")[1])
            .digest("hex"),
      )!;
    s.expiresAt = Date.now() - 1;
    f.app.store.persist();
    assert.equal((await me(f, expired.cookie)).status, 401);
  }));
test("OIDC rotating login prevents fixation, allows independent sessions, and rejects modified cookies", () =>
  fixture(async (f) => {
    const first = await oidcLogin(f),
      other = await oidcLogin(f);
    assert.equal(first.response.status, 303);
    assert.equal(other.response.status, 303);
    const rotated = await oidcLogin(f, first.cookie);
    assert.notEqual(first.cookie, rotated.cookie);
    assert.equal((await me(f, first.cookie)).status, 401);
    assert.equal((await me(f, other.cookie)).status, 200);
    const altered =
      rotated.cookie.slice(0, -1) + (rotated.cookie.endsWith("A") ? "B" : "A");
    assert.equal((await me(f, altered)).status, 401);
    const csrf = (await (await me(f, rotated.cookie)).json()).csrfToken;
    await fetch(f.publicUrl + "/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: rotated.cookie,
        origin: f.publicUrl,
        "x-csrf-token": csrf,
      },
    });
    assert.equal((await me(f, other.cookie)).status, 200);
  }));
test("OIDC production requires HTTPS, complete configuration and secure cookies", () => {
  const settings = {
    AUTH_MODE: "oidc",
    NODE_ENV: "production",
    OIDC_ISSUER_URL: "http://127.0.0.1:8080/realm",
    OIDC_CLIENT_ID: "fixture",
    APP_PUBLIC_URL: "http://localhost:3000",
    OIDC_ALLOW_INSECURE_LOOPBACK: "true",
  };
  assert.throws(() => readEnterpriseSettings(settings));
  assert.throws(() => readEnterpriseSettings({ AUTH_MODE: "oidc" }));
  assert.equal(
    readEnterpriseSettings({
      ...settings,
      OIDC_ISSUER_URL: "https://issuer.example.test/realm/",
      APP_PUBLIC_URL: "https://app.example.test",
    }).issuer,
    "https://issuer.example.test/realm/",
  );
  const adapter = new EnterpriseAuthAdapter(
    readEnterpriseSettings({
      ...settings,
      OIDC_ISSUER_URL: "https://issuer.example.test/realm",
      APP_PUBLIC_URL: "https://app.example.test",
    }),
  );
  assert.match(
    adapter.sessionCookie("synthetic"),
    /HttpOnly.*SameSite=Strict.*Secure/,
  );
  assert.match(adapter.flowCookie("synthetic"), /SameSite=Lax.*Secure/);
});

test("OIDC requester scope and trusted application role/SBU defeat body and issuer role escalation", () =>
  fixture(async (f) => {
    const auth = await oidcLogin(f);
    const data = await (await me(f, auth.cookie)).json();
    const headers = {
      cookie: auth.cookie,
      origin: f.publicUrl,
      "x-csrf-token": data.csrfToken,
      "content-type": "application/json",
    };
    const create = await fetch(f.publicUrl + "/api/tickets", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "OIDC synthetic scoped request",
        description: "Synthetic isolated Outlook setup request",
        serviceCategoryId: "cat-outlook-config", customFormPayload: { osPlatform: 'macOS' },
        role: "CTO",
        requesterId: "user-it-kamal",
        sbuId: "sbu-corp-003",
      }),
    });
    assert.equal(create.status, 201);
    const ticket = (await create.json()).ticket;
    assert.equal(ticket.requesterId, "user-emp-tawsif");
    assert.equal(ticket.sbuId, "sbu-tech-001");
    assert.equal(
      (
        await fetch(f.publicUrl + "/api/approvals/approval-seed-001/decide", {
          method: "POST",
          headers,
          body: JSON.stringify({
            decision: "APPROVED",
            decisionNotes: "Unprivileged rationale",
            role: "CTO",
          }),
        })
      ).status,
      403,
    );
    const nadia = f.app.store
      .getState()
      .users.find((u) => u.id === "user-emp-nadia")!;
    f.issuer.setSubject(nadia.oidcSubject);
    const other = await oidcLogin(f);
    assert.equal(
      (
        await fetch(f.publicUrl + "/api/tickets/" + ticket.id, {
          headers: { cookie: other.cookie },
        })
      ).status,
      403,
    );
    const assets = await (
      await fetch(f.publicUrl + "/api/assets", {
        headers: { cookie: other.cookie },
      })
    ).json();
    assert.ok(
      assets.items.every(
        (asset: { sbuId: string; assignedUserId: string }) =>
          asset.sbuId === nadia.sbuId && asset.assignedUserId === nadia.id,
      ),
    );
    const peer = {
      ...nadia,
      id: "oidc-peer-customer",
      email: "peer@example.test",
      roleId: "role-customer",
      roleName: "CUSTOMER" as const,
      oidcSubject: "peer-customer-subject",
    };
    f.app.store.getState().users.push(peer);
    f.app.store.persist();
    f.issuer.setSubject(peer.oidcSubject);
    const peerAuth = await oidcLogin(f);
    f.chooseRole("CUSTOMER");
    const customer = await oidcLogin(f);
    const customerMe = await (await me(f, customer.cookie)).json();
    const created = await fetch(f.publicUrl + "/api/tickets", {
      method: "POST",
      headers: {
        cookie: customer.cookie,
        origin: f.publicUrl,
        "x-csrf-token": customerMe.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "OIDC customer own request",
        description: "Synthetic customer request requires Outlook help",
        serviceCategoryId: "cat-outlook-config", customFormPayload: { osPlatform: 'macOS' },
      }),
    });
    assert.equal(created.status, 201);
    const own = (await created.json()).ticket;
    assert.equal(
      (
        await fetch(f.publicUrl + "/api/tickets/" + own.id, {
          headers: { cookie: peerAuth.cookie },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(f.publicUrl + "/api/tickets/" + own.id, {
          headers: { cookie: customer.cookie },
        })
      ).status,
      200,
    );
    const moved = f.app.store
      .getState()
      .users.find((u) => u.id === "user-emp-tawsif")!;
    moved.sbuId = "sbu-fin-002";
    moved.sbuCode = "SBU-FIN";
    f.app.store.persist();
    assert.equal(
      (
        await fetch(f.publicUrl + "/api/tickets/" + ticket.id, {
          headers: { cookie: auth.cookie },
        })
      ).status,
      403,
    );
  }));
test("OIDC preserves organization IT grant and CTO-only review; disabled or rebound identity loses access", () =>
  fixture(async (f) => {
    f.chooseRole("IT_ADMIN");
    const admin = await oidcLogin(f);
    assert.equal(
      (
        await fetch(f.publicUrl + "/api/tickets/ticket-seed-1002", {
          headers: { cookie: admin.cookie },
        })
      ).status,
      200,
    );
    const adminCsrf = (await (await me(f, admin.cookie)).json()).csrfToken;
    const request = (cookie: string, csrf: string) =>
      fetch(f.publicUrl + "/api/tickets/ticket-seed-1003/transition", {
        method: "POST",
        headers: {
          cookie,
          origin: f.publicUrl,
          "x-csrf-token": csrf,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: "IN_PROGRESS",
          notes: "Synthetic CTO review",
        }),
      });
    assert.equal((await request(admin.cookie, adminCsrf)).status, 403);
    f.chooseRole("CTO");
    const cto = await oidcLogin(f);
    const csrf = (await (await me(f, cto.cookie)).json()).csrfToken;
    assert.equal((await request(cto.cookie, csrf)).status, 200);
    const state = f.app.store.getState();
    state.users.find((u) => u.id === "user-cto-farhana")!.isActive = false;
    f.app.store.persist();
    assert.equal((await me(f, cto.cookie)).status, 401);
    const active = f.app.store
      .getState()
      .users.find((u) => u.id === "user-it-kamal")!;
    active.oidcIssuer = "https://another-issuer.example.test";
    f.app.store.persist();
    assert.equal((await me(f, admin.cookie)).status, 401);
  }));
test("OIDC callback persistence failure never releases a cookie or partial success audit", () =>
  fixture(async (f) => {
    const start = await fetch(f.publicUrl + "/api/auth/oidc/login", {
      redirect: "manual",
    });
    const flow = cookieFrom(start, "aiit_oidc_flow");
    const authorization = await fetch(start.headers.get("location")!, {
      redirect: "manual",
    });
    const before = fs.readFileSync(f.file, "utf8");
    const rename = fs.renameSync;
    try {
      fs.renameSync = ((source: fs.PathLike, destination: fs.PathLike) => {
        if (String(destination) === f.file)
          throw new Error("Synthetic isolated commit failure");
        return rename(source, destination);
      }) as typeof fs.renameSync;
      const response = await fetch(authorization.headers.get("location")!, {
        redirect: "manual",
        headers: { cookie: flow },
      });
      assert.equal(response.status, 503);
      assert.equal(cookieFrom(response, "itsupport_session"), "");
    } finally {
      fs.renameSync = rename;
    }
    assert.equal(fs.readFileSync(f.file, "utf8"), before);
  }));
