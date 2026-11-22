/** Controlled synthetic OIDC fixture, not Keycloak or a production issuer. */
import http from "node:http";
import crypto from "node:crypto";
export interface DemoIssuer {
  redirect: string;
  clientId: string;
  accounts: ReadonlyMap<string, { subject: string; active: boolean }>;
  password: string;
}

export async function startTestIssuer(demo?: DemoIssuer) {
  const demoCallback = demo ? new URL(demo.redirect) : undefined;
  if (demoCallback && (demoCallback.protocol !== "http:" || demoCallback.hostname !== "127.0.0.1" ||
      !demoCallback.port || demoCallback.username || demoCallback.password ||
      demoCallback.pathname !== "/api/auth/oidc/callback" || demoCallback.search || demoCallback.hash)) {
    throw new Error("Synthetic issuer requires an exact loopback callback");
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const rogue = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "fixture-key",
    use: "sig",
    alg: "RS256",
  };
  let issuer = "";
  let mode = "valid";
  let subject = "fixture-subject";
  let tokenRequests = 0;
  let jwksRequests = 0;
  let discoveryRequests = 0;
  let redirectHits = 0;
  const codes = new Map<
    string,
    { nonce: string; challenge: string; redirect: string; clientId: string; subject: string }
  >();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", issuer || "http://localhost");
    const json = (value: unknown, status = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    if (url.pathname === "/redirect-trap") {
      redirectHits++;
      json({ error: "unexpected_redirect" }, 400);
      return;
    }
    if (url.pathname === "/.well-known/openid-configuration") {
      if (mode === "redirect-discovery") {
        res.writeHead(302, { Location: issuer + "/redirect-trap" });
        res.end();
        return;
      }
      discoveryRequests++;
      if (mode === "stall-discovery") return;
      if (mode === "unavailable") {
        json({ error: "temporarily_unavailable" }, 503);
        return;
      }
      json({
        issuer: mode === "bad-discovery" ? issuer + "/wrong" : issuer,
        authorization_endpoint:
          mode === "unsafe-endpoint"
            ? "http://example.invalid/authorize"
            : issuer + "/authorize",
        token_endpoint: issuer + "/token",
        jwks_uri: issuer + "/jwks",
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      });
      return;
    }
    if (url.pathname === "/jwks") {
      jwksRequests++;
      json({ keys: [jwk] });
      return;
    }
    if (url.pathname === "/authorize") {
      if (
        url.searchParams.get("response_type") !== "code" ||
        url.searchParams.get("code_challenge_method") !== "S256" ||
        !url.searchParams.get("nonce") ||
        !url.searchParams.get("state")
      ) {
        json({ error: "invalid_request" }, 400);
        return;
      }
      let selected = subject;
      if (demo) {
        if (url.searchParams.get("redirect_uri") !== demo.redirect || url.searchParams.get("client_id") !== demo.clientId) {
          json({ error: "invalid_client" }, 400);
          return;
        }
        if (req.method === "GET") {
          const query = url.search.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Content-Security-Policy": `default-src 'none'; form-action 'self' ${demoCallback!.origin}; frame-ancestors 'none'`,
          });
          res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Synthetic office sign-in</title><main><h1>SYNTHETIC ENVIRONMENT — FICTIONAL DATA</h1><form action="/authorize${query}" method="post"><p><label>Fictional email <input name="email" type="email" required></label></p><p><label>Demo password <input name="password" type="password" required></label></p><button>Sign in</button></form></main></html>`);
          return;
        }
        if (req.method !== "POST") {
          json({ error: "invalid_request" }, 405);
          return;
        }
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 4096) {
            json({ error: "invalid_request" }, 413);
            return;
          }
        }
        const form = new URLSearchParams(body);
        const account = demo.accounts.get(form.get("email") ?? "");
        if (!account?.active || form.get("password") !== demo.password) {
          json({ error: "access_denied" }, 403);
          return;
        }
        selected = account.subject;
      }
      if (codes.size >= 1024) codes.delete(codes.keys().next().value!);
      const code = crypto.randomBytes(24).toString("base64url");
      codes.set(code, {
        nonce: url.searchParams.get("nonce")!,
        challenge: url.searchParams.get("code_challenge")!,
        redirect: url.searchParams.get("redirect_uri")!,
        clientId: url.searchParams.get("client_id")!,
        subject: selected,
      });
      const callback = new URL(url.searchParams.get("redirect_uri")!);
      callback.searchParams.set("code", code);
      callback.searchParams.set("state", url.searchParams.get("state")!);
      res.writeHead(302, { Location: callback.href });
      res.end();
      return;
    }
    if (url.pathname === "/token" && req.method === "POST") {
      tokenRequests++;
      let body = "";
      for await (const chunk of req) body += chunk;
      const form = new URLSearchParams(body);
      const code = form.get("code") || "";
      const row = codes.get(code);
      codes.delete(code);
      if (
        !row ||
        form.get("grant_type") !== "authorization_code" ||
        form.get("redirect_uri") !== row.redirect ||
        form.get("client_id") !== row.clientId ||
        crypto
          .createHash("sha256")
          .update(form.get("code_verifier") || "")
          .digest("base64url") !== row.challenge
      ) {
        json({ error: "invalid_grant" }, 400);
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        iss: mode === "wrong-issuer" ? issuer + "/wrong" : issuer,
        sub: row.subject,
        aud: mode === "wrong-audience" ? "wrong-client" : row.clientId,
        iat: mode === "future-iat" ? now + 3600 : now,
        exp: mode === "expired" ? now - 3600 : now + 3600,
        nbf: mode === "future-nbf" ? now + 3600 : now - 1,
        nonce: mode === "wrong-nonce" ? "wrong" : row.nonce,
        email: "not-identity-proof@example.test",
        email_verified: false,
        role: "CTO",
        sbuId: "forged-sbu",
      };
      const header = Buffer.from(
        JSON.stringify({
          alg: mode === "wrong-alg" ? "HS256" : "RS256",
          kid: "fixture-key",
          typ: "JWT",
        }),
      ).toString("base64url");
      const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
      const signature = crypto
        .sign(
          "RSA-SHA256",
          Buffer.from(header + "." + payload),
          mode === "bad-signature" ? rogue.privateKey : privateKey,
        )
        .toString("base64url");
      json({
        access_token: "SYNTHETIC_ACCESS_NOT_FOR_FRONTEND",
        refresh_token: "SYNTHETIC_REFRESH_NOT_FOR_STORAGE",
        token_type: "Bearer",
        expires_in: 3600,
        ...(mode === "no-id-token"
          ? {}
          : { id_token: header + "." + payload + "." + signature }),
      });
      return;
    }
    json({ error: "not_found" }, 404);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  issuer = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  return {
    issuer,
    server,
    setMode: (value: string) => {
      mode = value;
    },
    setSubject: (value: string) => {
      subject = value;
    },
    stats: () => ({ tokenRequests, jwksRequests, discoveryRequests, redirectHits }),
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
