import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { createApiServer, type AppInstance } from "../../apps/api/src/app.ts";
import { createWebServer } from "../../apps/web/src/server.ts";
import { EnterpriseDataStore } from "../../apps/api/src/store.ts";
import type { PrismaClient } from "@prisma/client";
import type { PostgresRequestStore } from "../../apps/api/src/postgres-store.ts";
import { createPostgresApiServer } from "../../apps/api/src/postgres-runtime.ts";
import { importJsonSnapshot } from "../../scripts/json-import.ts";
import { runtimeFixture } from "./disposable-postgres.ts";
import { startTestIssuer } from "./oidc-issuer.ts";
interface OidcFixture<Store extends EnterpriseDataStore | PostgresRequestStore> {
  issuer: Awaited<ReturnType<typeof startTestIssuer>>;
  app: AppInstance<Store>;
  web: ReturnType<typeof createWebServer>;
  publicUrl: string;
  file: string;
  chooseRole(role: string): ReturnType<EnterpriseDataStore["getState"]>["users"][number];
  expireSessions(): Promise<void>;
  close(): Promise<void>;
}

export function startOidcApplication(client: PrismaClient): Promise<OidcFixture<PostgresRequestStore>>;
export function startOidcApplication(): Promise<OidcFixture<EnterpriseDataStore>>;
export async function startOidcApplication(client?: PrismaClient): Promise<OidcFixture<EnterpriseDataStore | PostgresRequestStore>> {
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
  const store = client ? undefined : new EnterpriseDataStore(file);
  const fixture = store?.getState() ?? runtimeFixture();
  for (const user of fixture.users) user.oidcIssuer = issuer.issuer;
  const defaultSubject = fixture.users[0].oidcSubject;
  issuer.setSubject(defaultSubject);
  if (client) await importJsonSnapshot(client, fixture);
  else store?.persist();
  const app = client ? await createPostgresApiServer(client) : createApiServer(file);
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
      const user = fixture.users.find((u) => u.roleName === role)!;
      issuer.setSubject(user.oidcSubject);
      return user;
    },
    expireSessions: async () => {
      if (client) await client.authSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } });
      else if (store) {
        // The running API owns a separate store instance.
        const current = new EnterpriseDataStore(file);
        for (const session of current.getState().authSessions ?? []) session.expiresAt = Date.now() - 1;
        current.persist();
      }
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
  f: { publicUrl: string },
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
