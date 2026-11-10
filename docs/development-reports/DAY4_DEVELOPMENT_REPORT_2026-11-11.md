# AIIT — Day 4 local development and security report

Milestone date: **11 November 2026**. Implementation/verification performed **10 November 2026**, under the owner's explicit continuation authorization. December 10 is a production-readiness planning target, not an acceptance claim.

## Executive summary

**LOCAL ENGINEERING PASS. FORMAL ACCEPTANCE BLOCKED. PRODUCTION NOT READY.** The remaining Day 3 escalation bypass is fixed on its original branch. Day 4 implements optional enterprise OIDC Code+PKCE authentication in the existing native HTTP application, real issuer-key signature validation, safe application identity mapping, opaque server-side sessions, current role/SBU enforcement, CSRF/origin protections, frontend integration and comprehensive controlled-issuer tests. Existing explicit development sign-in and original workflows remain functional. JSON remains the default live store. No prerequisite PR was merged to continue work.

Real Keycloak was unavailable and was **not** tested. The executed integration uses actual HTTP discovery/authorization/code exchange/JWKS and signed tokens from a controlled loopback issuer, with the production adapter/library doing validation. No AD federation, corporate mail/provisioning, live AI executor, production deployment/cutover or Day 5 implementation occurred.

## Audit, source and dependency chain

Initial branch `codex/day3-transactional-postgres`, clean at `41f267eb1f52476706bac5e3c87edcd575f4838b`; fetched origin and confirmed divergence 0/0. PR #2 → #3 → #4 dependencies remain open/unmerged, with #4 targeting `audit/day1-day2-full-functional-review`. No AGENTS.md was found in the workspace inventory. Read current reports, real API/auth/store/validation/shared policy/frontend, schema/migrations/importer, existing API/DB/browser tests and Keycloak blueprint before implementation. Existing `openid-client` 6.8.9 was inspected locally and reused; no framework or dependency replacement.

Fresh starting baseline: all ten commands exit 0, **102 native / 25 overlapping security / 28 overlapping DB / 17 browser**, no failures/skips; `evidence/day4/baseline/`. These are executed baseline results, not reused historical claims.

Day 3 policy code commit: `b3c4412`; verified report/evidence head **`e8145e258e848e5c98e8a6e9b769259040a27f70`**. The new `codex/day4-enterprise-auth-security` branch was created directly from that verified head. Day 4 adapter/test commit: **`71427fff17bf0b51e6838b720f28215e175d8dfb`**. Final tested implementation/hardening commit: **`b17bf01ccc72ec576057cad5521a93114aa2f51e`**. Subsequent report/evidence commits change no application behavior.

## Day 3 policy closure

Confirmed generic `/transition` could escalate without the dedicated reason/severity policy. Both routes now invoke one escalation handler and use shared reason validation requiring five non-whitespace characters, trimming/redaction, CRITICAL severity, existing IT/CTO and state-graph guards, dedicated event/audit and CTO notification. Failed required notification intent rolls back the complete JSON escalation transaction. The PostgreSQL repository uses the same reason helper. Ten new isolated API tests cover both routes, success/denial, invalid reasons, CTO review, history/audit/notifications and failure rollback.

The Day 3 full verifier passed **112 native / 25 security / 28 DB / 17 browser**, all ten commands exit 0, zero failures/skips. Code/reports/logs are pushed on the original branch and PR #4 was updated. The prior open generic-route conflict is closed in source; older findings remain historical. No shared Git history was rewritten.

## Authentication implementation

`apps/api/src/enterprise-auth.ts` provides the Code+S256 PKCE adapter and asynchronous authentication persistence interface. Discovery is from the configured exact issuer identifier. Metadata must match issuer, advertise code/RS256/S256, and provide authorization/token/JWKS endpoints on that issuer's origin. Network calls reject redirects and have a five-second per-request timeout. Production requires HTTPS; a development/test-only explicit flag allows loopback HTTP. Issuer strings, including meaningful trailing slashes, are preserved rather than silently normalized.

State, nonce, PKCE and a separate random HttpOnly flow cookie bind the browser response. Pending login records are consumed once, expire after five minutes and are capped at 1024 per process. Library `enableNonRepudiationChecks` explicitly verifies ID-token signatures against the trusted JWKS; RS256 is the accepted algorithm. Issuer, client audience, nonce, signature, missing ID token, expiration/not-before and unreasonable future issued-at are rejected. The application implements no custom JWT signature verifier. Controlled fixtures sign their own synthetic test tokens only.

Identity resolution requires exact verified issuer+subject to a single active, already bound AIIT user. Email and provider/request-body role/SBU values are never identity proof or grants. Unknown, disabled, duplicate/conflicting and service identities fail. Current application role/SBU and binding are reloaded on each request; revocation/rebinding/disablement takes effect without trusting stale token roles. No auto-provisioning or new organization/membership policy was introduced.

## Session, cookie and frontend behavior

Enterprise session tokens are fresh opaque 256-bit values; only SHA-256 digest, application user ID, issuer/subject binding, mode and expiry persist. Upstream access/refresh/ID tokens are discarded and are not returned to JavaScript. Session/audit commit is atomic; failed persistence releases no success cookie. Re-login rotates the token and revokes the prior browser session. Independent concurrent sessions are permitted, and logout revokes the current one only. Default absolute lifetime 1800 seconds is configurable within 60–28800 and capped by verified ID-token expiration. No refresh/sliding expiry is implemented.

Cookies are HttpOnly and host-only. Session is SameSite=Strict/Path=/; short-lived flow cookie is SameSite=Lax/scoped to `/api/auth/oidc`. HTTPS cookies are Secure, and production cannot enable the HTTP exception. Enterprise writes require exact configured public Origin plus session-bound timing-safe CSRF validation. Anonymous/expired/revoked/modified sessions and enterprise bearer headers are rejected. Local logout does not terminate the identity provider's global SSO session; RP/back-channel logout remains future work.

Frontend discovers authentication mode, hides development controls for enterprise, follows sign-in, restores through the cookie, supplies CSRF headers, clears private views on expiry, reports errors and preserves role navigation. Development browser flow now also uses its HttpOnly cookie rather than an in-memory bearer header. CLI development token compatibility remains explicitly nonproduction. Original landing/employee/customer/IT/CTO/ticket/approval/asset/notification/logout workflows pass.

## Changed files — Day 4 relative to verified base

- `.env.example`: opt-in enterprise settings; actual `.env` unchanged.
- `package.json`: include OIDC negatives in the security test command; dependencies/lockfile unchanged.
- `apps/api/src/enterprise-auth.ts`: adapter, settings, cookies/CSRF and async JSON auth repository/interface.
- `apps/api/src/app.ts`: enterprise endpoints, cookie-session restore, origin/CSRF guards, logout, buffered multi-cookie redirects, truthful health mode and atomic callback audit.
- `apps/api/src/auth.ts`: correct development-only module description; development issuance/verification policy retained.
- `apps/api/src/store.ts`, `apps/api/src/persistence-schema.ts`, `packages/shared/src/index.ts`: optional identity/session binding types and validation, duplicate binding rejection.
- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261111000000_enterprise_identity_sessions/migration.sql`: additive nullable fields/check, existing three migrations untouched.
- `apps/web/src/server.ts`: enterprise sign-in/restoration, cookie-only frontend auth, CSRF headers, expiry and race-safe session state.
- `tests/oidc-security.test.ts`: 21 protocol/security tests against real fixture HTTP and cryptography.
- `tests/support/oidc-issuer.ts`, `tests/support/oidc-application.ts`: controlled issuer and disposable API/web/store fixtures.
- `tests/e2e/oidc.spec.ts`: three real Chromium enterprise flows; trace/screenshots disabled to avoid retaining authentication material.
- `tests/database.test.ts`: import/restore both legacy and enterprise sessions/bound users, dynamic actual migration count.
- `infra/keycloak/aiit-local-realm.json`: synthetic Code+S256 realm/client/account preparation, no credentials/federation; JSON validated but not imported.
- `docs/security/ENTERPRISE_AUTHENTICATION.md`, `docs/security/KEYCLOAK_LOCAL_SETUP.md`: complete contracts/configuration/limitations and isolated native Keycloak procedure.
- `docs/LOCAL_DEVELOPMENT_POLICY.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/ROADMAP.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/security/ROLE_PERMISSION_MATRIX.md`: current behavior and authorized workflow, historical statements retained below notices.
- `docs/development-reports/DAY4_{DEVELOPMENT_REPORT,TEST_REPORT,ACCEPTANCE}_2026-11-11.md`, `evidence/day4/`: current evidence and handoff. Day 3 changes/reports remain solely in the base branch.

## Executed tests and recovery

Final command `node scripts/verify-local.ts --output /tmp/aiit-day4-accepted` ran every required pinned command on `b17bf01`, with Node 26.8.1/pnpm 9.15.0 and DB_REQUIRED=true. **All ten command exits and final verifier exit are 0.** Native **134/134**, security subset **46/46**, DB subset **29/29**, Chromium **20/20**, zero failures/skips. Separate unit **7/7** and original integration **9/9** also pass on this source; these and security/DB counts overlap native totals. The 21 OIDC protocol/security cases and three OIDC browser cases are new for Day 4. Day 3 closure added ten cases relative to the 102-test starting baseline.

All four migrations, prefixed identifiers/FKs, version/concurrency/approval/audit guards, idempotent/concurrent imports, canonical fourteen-collection comparisons, populated UUID upgrade, zero Prisma diff and two pg_dump/psql restore drills pass on disposable PostgreSQL 18.6. Both legacy and new enterprise session data survive import/restore. No PostgreSQL API cutover is implied.

Final source review also identified SQL three-valued logic in the new, unpublished session constraint: NULL mode plus populated binding fields could pass. A real negative test reproduced the defect, then explicit non-NULL mode guarding fixed it in `b17bf01`. The new 29th DB case proves partial tuples are rejected while legacy/enterprise sessions remain valid; no Day 3/applied operational migration was edited. The pre-fix failure log is retained.

An initial browser run exited 1 with 18 pass/2 fail because the new tests used nonexistent navigation IDs. Selectors were corrected to actual existing data-tab buttons; assertions were retained. The raw failure log is preserved. A targeted compiler error in a heterogeneous test-header array was corrected with explicit string-record typing. No production test, existing assertion or required check was removed/weakened. Final command ledger and safe logs are in `evidence/day4/summary.json`.

## Security and operational preservation

Read-only HTTP checks of existing localhost `/` and `/app` return 200. That existing server remains running on ports 3000/4000 and was neither restarted nor used for mutating tests; it is not claimed to have hot-loaded new code. All authenticated browser/role/business/session tests run separate temporary loopback instances. Source and final task-wide hashes confirm **both operational JSON and `.env` unchanged**; verifier independently confirms preservation for the complete ten-command interval.

Evidence contains safe test results, collection hashes/counts, failure summaries and source metadata. No raw operational/test session files, access/refresh/ID tokens, private keys, cookie traces, SQL dumps or credentials are committed. SDK errors are returned generically. Existing mock AI/AD/mail boundaries remain. There was no production infrastructure contact or new paid/Docker dependency.

## Keycloak status, remaining risks and owner decisions

Real Keycloak integration is **PENDING**, not silently counted as a pass. No explicitly configured local instance was available (no port 8080 listener); the old realm blueprint is preparation, not availability evidence. The new synthetic realm is not imported or executed. [Local setup](../security/KEYCLOAK_LOCAL_SETUP.md) explains a separate 4300 fixture application, exact callback/issuer, manual synthetic subject binding and no corporate federation.

Before deployment: independently review actual issuer/client/bindings, TLS and proxy topology, public-vs-confidential client policy and secret storage, separate runtime/migration grants, session retention/expiry/concurrent-session policy, shared/sticky pending-flow storage, monitoring/rate limits, recovery and actual Keycloak behavior. Current same-origin metadata restriction and RS256-only policy are intentional constraints. Sessions remain JSON-backed and pending flows process-local; production multi-host/IdP-wide logout/refresh and generalized memberships are not implemented.

Hosted checks, eligible independent review and prerequisite PR integration remain release gates. Local development proceeds without weakening them. Recommend Day 5's separately authorized work integrate the async identity/session contract with the existing PostgreSQL transaction layer and one authoritative API store, retaining the same security regressions; **Day 5 work is not started here**. No production-readiness date is asserted achieved.

## Published PR and hosted/review handoff

Draft [PR #5](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/5) targets `codex/day3-transactional-postgres` at verified base `e8145e2`. The chain is PR #2 → #3 → #4 → #5; none was merged or retargeted to bypass gates. Code commits `71427ff` and `b17bf01` contain implementation/tests; `e8baf81` records local reports/evidence, followed by this documentation-only hosted handoff.

At `e8baf8179802d99d515cb75fad59b0172c41e736`, [run 42766950230](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42766950230) failed quality/tests/database/browser with no executed steps. Every independently read check annotation states: **The job was not started because your account is locked due to a billing issue.** [Structured evidence](evidence/day4/hosted-ci.json). This is pre-execution infrastructure failure, not failing application assertions. No rerun, billing/workflow/protection alteration or fabricated hosted PASS was used.

PR #5 has zero review submissions and remains draft/unmerged. Independent approval is outstanding. The only reviewer previously named by the owner is also the PR author and cannot supply independent approval; no self-approval or invented alternative reviewer is recorded. Local development remains authorized while required release gates are outstanding. No Day 5 work was started.
