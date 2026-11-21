# Day 4 local test report — milestone 11 November 2026

Executed **10 November 2026**. Final tested implementation **`b17bf01ccc72ec576057cad5521a93114aa2f51e`** (adapter `71427ff` plus SQL NULL-binding hardening); base **`e8145e258e848e5c98e8a6e9b769259040a27f70`**. LOCAL PASS, formal hosted/review acceptance BLOCKED. Controlled issuer is not real Keycloak.

## Required commands

Verifier: `node scripts/verify-local.ts --output /tmp/aiit-day4-accepted`. Each command below uses exact prefix `npm exec --yes --package=pnpm@9.15.0 -- pnpm`, Node 26.8.1, mock corporate transports and DB_REQUIRED=true. Actual ledger: [summary.json](evidence/day4/summary.json).

| Command | Exit | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| `install --frozen-lockfile --ignore-scripts` | 0 | — | — | — |
| `db:generate` | 0 | — | — | — |
| `typecheck` | 0 | — | — | — |
| `lint` | 0 | — | — | — |
| `build` | 0 | — | — | — |
| `test` | 0 | 134 | 0 | 0 |
| `test:security` | 0 | 46 | 0 | 0 |
| `test:db` | 0 | 29 | 0 | 0 |
| `test:e2e` | 0 | 20 | 0 | 0 |
| `audit --audit-level=moderate` | 0 | — | — | — |

Final verifier exit **0**. Dependency audit reports no known vulnerabilities in that registry snapshot, not a permanent guarantee. Security/DB counts overlap native; browser tests are separate. DB count is parent plus nested subtests, not 29 independent clusters. No coverage percentage is inferred.

Supplemental exact pinned `test:unit`: exit 0, **7 pass**, zero fail/skip; `test:integration`: exit 0, **9 pass**, zero fail/skip. Both are subsets of native coverage, not additional totals. Logs/commands: [supplemental-tests.json](evidence/day4/supplemental-tests.json).

Starting baseline at `41f267e`: all ten commands exit 0, **102 native/25 security/28 DB/17 browser**, no failures/skips; [baseline evidence](evidence/day4/baseline/summary.json). Verified Day 3 policy closure `b3c4412` adds ten native cases: **112/25/28/17**, all ten exit 0; evidence remains under `day3/policy-closure/`. Day 4 adds **21 OIDC protocol/security cases and three OIDC browser cases**, yielding current totals, plus one new database constraint regression. Security script now explicitly includes those 21 cases. Historical totals are not reused as current results.

## Authentication security evidence

`tests/oidc-security.test.ts` starts an explicit temporary JSON store, native API/web proxy and controlled loopback issuer. Actual Code+PKCE token exchange, nonce/state validation and RSA/JWKS verification use the real installed client library. Tests do not stub the verifier or claim that corporate/Keycloak integration ran.

Passing cases cover valid opaque login with actual JWKS fetch; bad issuer/audience/nonce/signature/algorithm; expired/not-yet-valid/future-issued and missing ID tokens; invalid discovery and foreign endpoints; provider unavailability/no development fallback; browser cookie/state/PKCE/replay/flow expiry; unknown/disabled/service/conflicting bindings; persistence/reload, current-role revocation, same-origin+CSRF logout, expired/revoked/modified sessions; rotating fixation-resistant login and independent concurrent sessions; production HTTPS/configuration/Secure cookie requirements; exact issuer strings; requester/customer/SBU boundaries and untrusted role/body claims; current SBU changes; organization-wide IT and CTO-only review; disabled/rebound identities; and commit-failure rollback without a released cookie or partial success audit.

Three enterprise Chromium tests verify configured sign-in controls and actual browser redirects; HttpOnly/SameSite cookies; reload restoration, employee navigation/ticket creation and logout; fail-closed provider error without development controls; and expired-session removal/feedback. The original 17 browser cases preserve development/customer/IT/CTO workflows, approvals/escalation, custody, notifications/audit, session restoration/logout, responsiveness and error recovery.

## Database, migration and recovery

A pre-publication negative regression caught and fixed the SQL NULL check loophole in the new migration: explicit non-NULL mode is now required for populated enterprise bindings. The new case rejects partial/empty tuples and proves one legacy plus one enterprise session remain valid. Its pre-fix failure log is retained.

Four migrations now apply; the new migration only adds nullable identity/session binding fields and a complete-binding check. Earlier migrations are unchanged. The existing fixture includes a bound synthetic user, a legacy session and an enterprise session. IDs/FKs, repeat/concurrent imports, fourteen-collection count/canonical checksum comparisons, late-conflict rollback, UUID upgrade and Prisma parity pass. Two actual pg_dump/psql restores verify imported source checksums and complete post-mutation tables (including bindings, versions, counter and outbox states). Existing append-only/approval/custody/concurrency/lease regressions remain active.

Machine-readable [database evidence](evidence/day4/database-evidence.json) reports PostgreSQL 18.6, migration count four, two source sessions and restore/parity flags. No external DATABASE_URL is used as a live test target. The tests clean only their own temporary cluster/directory. PostgreSQL 16 hosted execution, physical/power-loss disaster recovery and production RPO/RTO are not proven.

## Failures and evidence handling

Initial browser run: **exit 1, 18 pass/2 fail**, no skips; both failures were new test selectors pointing to nonexistent navigation IDs. Corrected selectors use the actual `data-tab` controls; no assertions were weakened. [Failure log](evidence/day4/initial-browser-failure.log) is retained. An early targeted compiler error in test header-array inference was fixed by typing the headers; final compiler/lint gates pass. There were no final failures/skips. Authentication browser trace/screenshots are disabled to avoid publishing protocol/session material; no raw trace ZIPs or session datasets are committed.

Read-only current-server checks `/` and `/app` return 200; authenticated mutations use isolated fixture instances only. Task-wide and final-verifier hashes confirm unchanged operational JSON and `.env`. Current server processes were not stopped/restarted or claimed PostgreSQL-backed. [Source/preservation evidence](evidence/day4/source-and-preservation.json).

## Unavailable integration and acceptance boundaries

No local Keycloak listener/explicit test realm was available. Real Keycloak/AD federation, production HTTPS/browser deployment, IdP global logout, shared flow storage/multi-host sessions, refresh-token behavior and live PostgreSQL API integration remain PENDING. A synthetic realm and documented setup are prepared, not executed. Hosted CI and independent approval are separate required gates; local PASS does not replace them. No production or Day 5 work occurred.

## Published PR and hosted/review handoff

Draft [PR #5](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/5) targets `codex/day3-transactional-postgres` at verified base `e8145e2`. The chain is PR #2 → #3 → #4 → #5; none was merged or retargeted to bypass gates. Code commits `71427ff` and `b17bf01` contain implementation/tests; `e8baf81` records local reports/evidence, followed by this documentation-only hosted handoff.

At `e8baf8179802d99d515cb75fad59b0172c41e736`, [run 42766950230](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42766950230) failed quality/tests/database/browser with no executed steps. Every independently read check annotation states: **The job was not started because your account is locked due to a billing issue.** [Structured evidence](evidence/day4/hosted-ci.json). This is pre-execution infrastructure failure, not failing application assertions. No rerun, billing/workflow/protection alteration or fabricated hosted PASS was used.

PR #5 has zero review submissions and remains draft/unmerged. Independent approval is outstanding. The only reviewer previously named by the owner is also the PR author and cannot supply independent approval; no self-approval or invented alternative reviewer is recorded. Local development remains authorized while required release gates are outstanding. No Day 5 work was started.
