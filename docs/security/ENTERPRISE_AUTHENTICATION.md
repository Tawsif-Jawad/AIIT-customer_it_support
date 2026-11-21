# Enterprise authentication foundation — Day 4

Implemented locally on 10 November 2026 for the 11 November milestone. This document describes source behavior, not a certified production deployment. Default application storage remains JSON. The user's existing localhost server is not restarted or rebound by tests.

## Modes and endpoints

- `AUTH_MODE=dev_oidc` only works with explicit `NODE_ENV=development|test`. Existing seeded development identities and CLI-only development bearer compatibility remain. Production never accepts this sign-in method.
- `AUTH_MODE=oidc` enables the enterprise adapter only when all required settings validate. Missing settings, invalid discovery, transport failure or invalid tokens fail closed, with no development fallback. Other modes are unconfigured.
- `GET /api/auth/config` advertises development/enterprise/unconfigured and configuration readiness. Ready means settings parsed, not that Keycloak reachability or federation is certified.
- `GET /api/auth/oidc/login` discovers the configured issuer and redirects to its authorization endpoint. It accepts no arbitrary return URL or discovery URL from a request.
- `GET /api/auth/oidc/callback` consumes the browser-bound pending login and performs code exchange; success redirects to `/app` after durable session/audit commit.
- `GET /api/auth/me` restores current application identity and returns a session-bound CSRF token in enterprise mode. No upstream ID/access/refresh token is returned.
- `POST /api/auth/logout` invalidates the current application session and expires its cookie. It is local application logout; IdP-wide/RP-initiated/back-channel logout is not implemented. Another deliberate sign-in may reuse the provider's SSO session.

The frontend requests the configured mode, hides development identity controls in enterprise mode, follows enterprise sign-in, restores through the HttpOnly cookie and uses CSRF headers for enterprise writes. It stops sending in-memory development bearer tokens. Expired/invalid sessions clear private views and show sign-in feedback. Existing role navigation/layout and original development workflows are retained.

## Protocol validation

`apps/api/src/enterprise-auth.ts` uses the already pinned `openid-client` 6.8.9; no new dependency or custom production JWT verifier was introduced. Local installed library declarations/source were reviewed. Code Flow uses S256 PKCE, cryptographically random state/nonce and a separate random HttpOnly browser-flow cookie. Pending flows are one-time, five-minute and bounded to 1024 per process. Restart or a different API instance cannot resume a pending login; it fails closed. Multi-instance deployment needs sticky flow routing or shared protected flow persistence before rollout.

Discovery uses the issuer identifier, not a caller-supplied metadata URL. Issuer metadata must match and advertise code/RS256/S256 with authorization/token/JWKS endpoints on the same issuer origin. HTTPS is required. Redirects during issuer HTTP calls are rejected; each request has a five-second timeout. Same-origin endpoint restriction is an intentional Keycloak-oriented deployment constraint, not general multi-origin IdP support.

Accepted ID-token signing algorithm is explicitly RS256. `enableNonRepudiationChecks` is enabled so the code-exchange ID token is actually verified against trusted issuer JWKS, including over HTTPS. The library validates protocol responses, issuer/audience, nonce, signature and validity; the adapter also requires usable issuer/subject/expiration and rejects future issued-at beyond 30 seconds. Expiration is checked strictly. State, browser binding, PKCE and one-time consumption prevent cross-browser substitution and replay. Errors returned to clients are generic and never include codes, provider tokens, secrets or raw library exception text.

The synthetic test issuer uses ephemeral RSA keys and actual HTTP discovery/authorization/token/JWKS endpoints. It signs fixture tokens only; application signature verification remains entirely in the library. This is controlled protocol integration evidence, not a Keycloak conformance suite or a real corporate identity integration.

## Trusted identity and authorization

An existing application's user may have optional `oidcIssuer`. Enterprise login requires an exact match of verified issuer plus `oidcSubject` to exactly one active application user. Legacy subjects are not auto-bound to an issuer. Email (verified or otherwise), provider roles/groups, request-body roles and SBU claims cannot create or grant an identity. Unknown/disabled/service identities are denied. There is no registration/JIT provisioning endpoint.

Effective role, SBU and account status are reloaded from current application records on every request. Clearing/rebinding issuer/subject invalidates existing enterprise sessions; role/SBU changes take effect immediately. Customer/employee ownership and applicable same-SBU rules, organization-wide IT/CTO grants and CTO-only review restrictions remain the shared policies. Expanded organization/membership policy is not invented here. Existing global subject uniqueness is retained; multi-issuer account linking is not implemented.

`AuthenticationRepository` is asynchronous and defines exact identity resolution, session lookup/establishment and revocation. Its JSON implementation operates within the API's existing transaction; a future PostgreSQL implementation must use its caller's transaction for session and audit atomicity. No partial PostgreSQL authentication cutover occurs in Day 4.

## Sessions, cookies, CSRF and persistence

Enterprise cookies contain a fresh random 256-bit opaque session token. Only its SHA-256 digest, user ID, issuer/subject binding, mode and expiry are persisted. Upstream access/refresh/ID tokens are discarded after validation. Default absolute lifetime is 1800 seconds, configurable from 60 to 28800 and capped server-side by ID-token expiration. There is no refresh-token or sliding-session implementation.

A successful re-login rotates the cookie and revokes the browser's previous session. Separate concurrent sessions are allowed; logout revokes the current one only. Disabled/service conversion and identity rebinding deny all affected sessions at request time. Existing legacy sessions are not reset or reissued by migrations.

Application session cookie: HttpOnly, Path=/, SameSite=Strict, no Domain attribute, Secure for HTTPS. The short-lived login-flow cookie is HttpOnly, scoped to `/api/auth/oidc`, SameSite=Lax to permit top-level provider return, and Secure for HTTPS. Production configuration always requires HTTPS. HTTP exception requires explicit local development/test mode, `OIDC_ALLOW_INSECURE_LOOPBACK=true` and loopback issuer/application URLs; it never applies with NODE_ENV=production.

Enterprise writes require the exact configured public Origin and a session-bound CSRF header derived from the opaque session token. It is compared with timing-safe equality; it is not an authentication credential. Cross-origin requests, missing Origin, missing/invalid CSRF and anonymous protected operations are denied server-side. Enterprise sessions do not authenticate bearer headers. Login callbacks use state/nonce/browser-flow protections and GET query responses.

API responses and cookies are buffered until the JSON transaction commits. Callback session establishment and success audit are atomic; commit failure releases no success cookie. Logical schema migration `20261111000000_enterprise_identity_sessions` adds nullable issuer/session-binding fields without changing IDs or existing values. Source validation accepts legacy rows, enforces complete enterprise session bindings and rejects duplicate issuer/subject bindings. Disposable import, populated upgrade, checksum and full backup/restore tests include both legacy and enterprise sessions.

## Configuration

| Variable | Meaning |
|---|---|
| `AUTH_MODE=oidc` | Explicit enterprise mode |
| `OIDC_ISSUER_URL` | Exact trusted issuer identifier, with no credentials/query/fragment |
| `OIDC_CLIENT_ID` | Registered Code+PKCE client |
| `OIDC_CLIENT_SECRET` | Optional secret for a configured confidential client (`client_secret_post`); omit for public PKCE client |
| `APP_PUBLIC_URL` | Exact browser-facing origin, no path/query; callback is fixed under `/api/auth/oidc/callback` |
| `OIDC_SESSION_SECONDS` | Absolute session TTL, default 1800 |
| `OIDC_ALLOW_INSECURE_LOOPBACK` | False by default; explicit development/test-only HTTP exception |

`.env.example` documents the opt-in; operational `.env` is not edited. No secret, existing user or issuer binding is inferred. A configured IdP must support RS256/S256 and same-origin issuer endpoints. Deployment requires reviewed issuer/client settings, HTTPS/TLS/proxy configuration, protected storage, separate runtime/migration grants, monitoring/rate limits, clock synchronization, consent/retention decisions, shared flow strategy, actual Keycloak testing, hosted CI and independent review.

## Current verification limits

The complete local regression suite and real HTTP/Chromium controlled-issuer flows are tested. No available explicitly configured local Keycloak was found; port 8080 had no listener. Actual Keycloak, AD federation, real directory/mail actions, production TLS, IdP-wide logout, refresh, high-load/multi-host operation and PostgreSQL-backed API/session execution remain pending. No Docker/paid service was installed or started.

OIDC browser tests disable trace/screenshots to avoid retaining cookie/protocol data in failure artifacts. Evidence includes safe counts, outcomes, hashes and logs, not raw tokens, session files or SQL dumps. [Isolated Keycloak setup](KEYCLOAK_LOCAL_SETUP.md) is preparation only.
