/** OIDC Code+PKCE adapter. No token verification is implemented locally. */
import crypto from "node:crypto";
import * as oidc from "openid-client";
import type { User } from "../../../packages/shared/src/index.ts";
import type { EnterpriseDataStore } from "./store.ts";

export interface EnterpriseSession {
  id: string;
  userId: string;
  expiresAt: number;
  kind: "oidc";
  issuer: string;
  subject: string;
}
/** Implement atomically with business-side persistence; no implicit DB cutover. */
export interface AuthenticationRepository {
  resolveIdentity(issuer: string, subject: string): Promise<User | null>;
  findSession(digest: string): Promise<EnterpriseSession | null>;
  establish(session: EnterpriseSession, previousDigest?: string): Promise<void>;
  revoke(digest: string): Promise<void>;
}
export class JsonAuthenticationRepository implements AuthenticationRepository {
  private store: EnterpriseDataStore;
  constructor(store: EnterpriseDataStore) {
    this.store = store;
  }
  async resolveIdentity(issuer: string, subject: string) {
    const matches = this.store
      .getState()
      .users.filter(
        (u) => u.oidcIssuer === issuer && u.oidcSubject === subject,
      );
    return matches.length === 1 &&
      matches[0].isActive &&
      matches[0].roleName !== "SYSTEM_SERVICE"
      ? matches[0]
      : null;
  }
  async findSession(digest: string) {
    const row = this.store
      .getState()
      .authSessions?.find((s) => s.id === digest);
    return row?.kind === "oidc" ? (row as EnterpriseSession) : null;
  }
  async establish(session: EnterpriseSession, previousDigest?: string) {
    const state = this.store.getState();
    state.authSessions = (state.authSessions || []).filter(
      (s) => s.id !== previousDigest,
    );
    state.authSessions.push(session);
  }
  async revoke(digest: string) {
    const state = this.store.getState();
    state.authSessions = (state.authSessions || []).filter(
      (s) => s.id !== digest,
    );
  }
}
export const sessionDigest = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");
export const csrfForSession = (token: string) =>
  crypto.createHmac("sha256", token).update("AIIT-CSRF-v1").digest("base64url");
export function secureEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
export function cookieValue(header: string | undefined, name: string) {
  const match = header?.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  try {
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}
export interface EnterpriseAuthSettings {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  publicUrl: string;
  allowLoopbackHttp: boolean;
  sessionSeconds: number;
}
const loopback = (url: URL) =>
  ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
export function readEnterpriseSettings(
  env: NodeJS.ProcessEnv = process.env,
): EnterpriseAuthSettings {
  if (
    env.AUTH_MODE !== "oidc" ||
    !env.OIDC_ISSUER_URL ||
    !env.OIDC_CLIENT_ID ||
    !env.APP_PUBLIC_URL
  )
    throw new Error("OIDC_NOT_CONFIGURED");
  const issuer = new URL(env.OIDC_ISSUER_URL),
    publicUrl = new URL(env.APP_PUBLIC_URL);
  const allow =
    ["development", "test"].includes(env.NODE_ENV || "") &&
    env.OIDC_ALLOW_INSECURE_LOOPBACK === "true";
  for (const url of [issuer, publicUrl])
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(allow && url.protocol === "http:" && loopback(url)))
    )
      throw new Error("OIDC_UNSAFE_URL");
  if (publicUrl.pathname !== "/" || issuer.pathname.includes("/.well-known/"))
    throw new Error("OIDC_UNSAFE_URL");
  const sessionSeconds = Number(env.OIDC_SESSION_SECONDS || 1800);
  if (
    !Number.isInteger(sessionSeconds) ||
    sessionSeconds < 60 ||
    sessionSeconds > 28800
  )
    throw new Error("OIDC_INVALID_SESSION_TTL");
  return {
    issuer: env.OIDC_ISSUER_URL,
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET,
    publicUrl: publicUrl.origin,
    allowLoopbackHttp: allow,
    sessionSeconds,
  };
}
interface PendingLogin {
  state: string;
  nonce: string;
  verifier: string;
  expiresAt: number;
  previousDigest?: string;
}
export class EnterpriseAuthAdapter {
  private settings: EnterpriseAuthSettings;
  private configuration?: Promise<oidc.Configuration>;
  private pending = new Map<string, PendingLogin>();
  constructor(settings: EnterpriseAuthSettings) {
    this.settings = settings;
  }
  get issuer() {
    return this.settings.issuer;
  }
  get publicUrl() {
    return this.settings.publicUrl;
  }
  get secureCookies() {
    return this.settings.publicUrl.startsWith("https:");
  }
  private async config() {
    if (!this.configuration)
      this.configuration = this.discover().catch((error) => {
        this.configuration = undefined;
        throw error;
      });
    return this.configuration;
  }
  private async discover() {
    const issuer = new URL(this.settings.issuer);
    const guardedFetch: oidc.CustomFetch = async (url, options) => {
      const target = new URL(url);
      if (target.origin !== issuer.origin || target.username || target.password)
        throw new Error("OIDC_ENDPOINT_ORIGIN_DENIED");
      return fetch(url, { ...options, redirect: "error" });
    };
    const configuration = await oidc.discovery(
      issuer,
      this.settings.clientId,
      {
        id_token_signed_response_alg: "RS256",
        ...(this.settings.clientSecret
          ? { client_secret: this.settings.clientSecret }
          : {}),
      },
      this.settings.clientSecret
        ? oidc.ClientSecretPost(this.settings.clientSecret)
        : oidc.None(),
      {
        timeout: 5,
        [oidc.customFetch]: guardedFetch,
        execute: [
          ...(this.settings.allowLoopbackHttp
            ? [oidc.allowInsecureRequests]
            : []),
          oidc.enableNonRepudiationChecks,
        ],
      },
    );
    const metadata = configuration.serverMetadata();
    for (const endpoint of [
      metadata.authorization_endpoint,
      metadata.token_endpoint,
      metadata.jwks_uri,
    ]) {
      if (!endpoint) throw new Error("OIDC_REQUIRED_METADATA_MISSING");
      const target = new URL(endpoint);
      if (target.origin !== issuer.origin || target.username || target.password)
        throw new Error("OIDC_ENDPOINT_ORIGIN_DENIED");
    }
    if (
      !metadata.response_types_supported?.includes("code") ||
      !metadata.id_token_signing_alg_values_supported?.includes("RS256") ||
      !metadata.code_challenge_methods_supported?.includes("S256")
    )
      throw new Error("OIDC_REQUIRED_CAPABILITY_MISSING");
    return configuration;
  }
  async begin(previousToken?: string | null) {
    const config = await this.config();
    const now = Date.now();
    for (const [key, row] of this.pending)
      if (row.expiresAt <= now) this.pending.delete(key);
    if (this.pending.size >= 1024) throw new Error("OIDC_LOGIN_CAPACITY");
    const flow = crypto.randomBytes(32).toString("base64url"),
      state = oidc.randomState(),
      nonce = oidc.randomNonce(),
      verifier = oidc.randomPKCECodeVerifier();
    this.pending.set(sessionDigest(flow), {
      state,
      nonce,
      verifier,
      expiresAt: now + 300000,
      previousDigest: previousToken ? sessionDigest(previousToken) : undefined,
    });
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: this.settings.publicUrl + "/api/auth/oidc/callback",
      response_type: "code",
      scope: "openid",
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
      state,
      nonce,
    });
    return { url: url.href, flow };
  }
  async finish(
    currentUrl: string,
    flow: string | null,
    repository: AuthenticationRepository,
  ) {
    const key = flow ? sessionDigest(flow) : "";
    const pending = this.pending.get(key);
    this.pending.delete(key);
    if (!pending || pending.expiresAt <= Date.now())
      throw new Error("OIDC_FLOW_INVALID");
    const url = new URL(currentUrl);
    if (
      url.origin !== this.settings.publicUrl ||
      url.pathname !== "/api/auth/oidc/callback"
    )
      throw new Error("OIDC_CALLBACK_INVALID");
    const config = await this.config();
    const tokens = await oidc.authorizationCodeGrant(config, url, {
      expectedState: pending.state,
      expectedNonce: pending.nonce,
      pkceCodeVerifier: pending.verifier,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (
      !claims ||
      typeof claims.sub !== "string" ||
      !claims.sub ||
      claims.iss !== this.settings.issuer ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1000) ||
      !Number.isFinite(claims.iat) ||
      claims.iat > Math.floor(Date.now() / 1000) + 30
    )
      throw new Error("OIDC_IDENTITY_INVALID");
    const user = await repository.resolveIdentity(claims.iss, claims.sub);
    if (!user) throw new Error("OIDC_IDENTITY_NOT_BOUND");
    const token = crypto.randomBytes(32).toString("base64url");
    await repository.establish(
      {
        id: sessionDigest(token),
        userId: user.id,
        expiresAt: Math.min(
          Date.now() + this.settings.sessionSeconds * 1000,
          claims.exp * 1000,
        ),
        kind: "oidc",
        issuer: claims.iss,
        subject: claims.sub,
      },
      pending.previousDigest,
    );
    // Upstream access/refresh/ID tokens are intentionally not persisted or returned.
    return { token, user };
  }
  async authenticate(
    token: string | null,
    repository: AuthenticationRepository,
  ) {
    if (!token || !/^[-_A-Za-z0-9]{43}$/.test(token)) return null;
    const session = await repository.findSession(sessionDigest(token));
    if (
      !session ||
      session.expiresAt <= Date.now() ||
      session.issuer !== this.settings.issuer
    )
      return null;
    const user = await repository.resolveIdentity(
      session.issuer,
      session.subject,
    );
    return user?.id === session.userId ? user : null;
  }
  sessionCookie(token: string, maxAge = this.settings.sessionSeconds) {
    return `itsupport_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${this.secureCookies ? "; Secure" : ""}`;
  }
  flowCookie(flow: string, maxAge = 300) {
    return `aiit_oidc_flow=${flow}; HttpOnly; Path=/api/auth/oidc; SameSite=Lax; Max-Age=${maxAge}${this.secureCookies ? "; Secure" : ""}`;
  }
}
