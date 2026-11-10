import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { createApiServer } from "../../apps/api/src/app.ts";
import { createWebServer } from "../../apps/web/src/server.ts";
import { EnterpriseDataStore } from "../../apps/api/src/store.ts";
import { startTestIssuer } from "./oidc-issuer.ts";
export async function startOidcApplication() {
  const issuer = await startTestIssuer();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiit-oidc-"));
  const keys = [
    "NODE_ENV",
    "AUTH_MODE",
    "MAIL_PROVIDER",
    "OIDC_ISSUER_URL",
    "OIDC_CLIENT_ID",
    "OIDC_CLIENT_SECRET",
    "APP_PUBLIC_URL",
    "OIDC_ALLOW_INSECURE_LOOPBACK",
    "OIDC_SESSION_SECONDS",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  const listener = net.createServer();
  await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>((r) => listener.close(() => r()));
  const publicUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    NODE_ENV: "test",
    AUTH_MODE: "oidc",
    MAIL_PROVIDER: "mock",
    OIDC_ISSUER_URL: issuer.issuer,
    OIDC_CLIENT_ID: "aiit-fixture",
    APP_PUBLIC_URL: publicUrl,
    OIDC_ALLOW_INSECURE_LOOPBACK: "true",
    OIDC_SESSION_SECONDS: "1800",
  });
  delete process.env.OIDC_CLIENT_SECRET;
  const file = path.join(dir, "db.json");
  const store = new EnterpriseDataStore(file);
  for (const user of store.getState().users) user.oidcIssuer = issuer.issuer;
  const defaultSubject = store.getState().users[0].oidcSubject;
  issuer.setSubject(defaultSubject);
  store.persist();
  const app = createApiServer(file);
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  const web = createWebServer(
    "http://127.0.0.1:" + (app.server.address() as net.AddressInfo).port,
  );
  await new Promise<void>((r) => web.listen(port, "127.0.0.1", r));
  return {
    issuer,
    app,
    web,
    publicUrl,
    file,
    chooseRole: (role: string) => {
      const user = app.store.getState().users.find((u) => u.roleName === role)!;
      issuer.setSubject(user.oidcSubject);
      return user;
    },
    close: async () => {
      await new Promise<void>((r) => web.close(() => r()));
      await new Promise<void>((r) => app.server.close(() => r()));
      await issuer.close();
      fs.rmSync(dir, { recursive: true, force: true });
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    },
  };
}
export const cookieFrom = (response: Response, name: string) =>
  response.headers
    .getSetCookie()
    .find((value) => value.startsWith(name + "="))
    ?.split(";")[0] || "";
export async function oidcLogin(
  f: Awaited<ReturnType<typeof startOidcApplication>>,
  previousCookie = "",
) {
  const start = await fetch(f.publicUrl + "/api/auth/oidc/login", {
    redirect: "manual",
    headers: previousCookie ? { cookie: previousCookie } : {},
  });
  const flow = cookieFrom(start, "aiit_oidc_flow");
  const authorization = start.headers.get("location");
  if (!authorization) throw new Error("Fixture login initiation failed");
  const approved = await fetch(authorization, { redirect: "manual" });
  const callback = approved.headers.get("location");
  if (!callback) throw new Error("Fixture authorization failed");
  const response = await fetch(callback, {
    redirect: "manual",
    headers: { cookie: flow },
  });
  return {
    start,
    flow,
    authorization,
    callback,
    response,
    cookie: cookieFrom(response, "itsupport_session"),
  };
}
