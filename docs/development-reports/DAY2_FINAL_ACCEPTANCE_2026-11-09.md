# AIIT — Day 2 final acceptance verification

9 November 2026 · Asia/Dhaka · **Verdict: BLOCKED — hosted CI account restriction.**

> Latest no-cost work: executable local fallback passes all ten commands (55 native tests and 5 Chromium tests). CircleCI is prepared but NOT CONFIGURED; GitHub remains account-locked. No payment, provider authorization or required-check change occurred. See the final no-cost section.


> Latest recheck: public-repository run 42598208806 and fresh manual run 42599568751 both explicitly report an account billing lock. Four jobs registered, zero steps executed. All ten requested local commands passed again; see the final section and evidence/day2-ci-recheck/.

## Executive Summary

All executable local Day 2 gates now pass: **54 native tests, 4 Chromium browser tests, real TypeScript compilation, ESLint, native build verification, a clean offline frozen dependency installation, advisory audit, and disposable PostgreSQL migration/import/recovery tests**. There are no skipped native or browser tests in the final local runs. The operational dataset and `.env` remain byte-for-byte unchanged.

GitHub Actions cannot start jobs. Its authenticated run page explicitly reports: “The job was not started because recent account payments have failed or your spending limit needs to be increased.” The repository permits Actions; changing application code cannot resolve this account payment/spending restriction. Therefore the mandatory hosted CI and PR-check gates remain BLOCKED. PR #2 remains draft; no merge or deployment was performed. This report does not claim 100% Day 2 acceptance or production readiness.

## Repository and prior work

- Started with clean `feature/day2-data-integrity-security` at 2d6c4db. Fetched origin and verified that PR #1 was already merged into `main` at b6fae62.
- PR #2 was open/draft, targeting `main`, with remediation head `fix/day2-closure-severity-ci` at 6c9eb93. Reused that branch safely; no reset, force-push or duplicate PR.
- Reviewed the baseline audit, original Day 2 report, remediation follow-up, persistence/database/authentication designs, permission matrix, SRS, ADRs, workflow, existing tests, schemas and actual source.
- The remediation's four previously unexecuted cases were run: **42/42 baseline tests passed**. Existing F05 and F10 fixes were preserved and extended rather than duplicated.
- Final source commits: b9b1299 (toolchain), 66f80db (persistence/database), 5c9777d (security), 05b67f7 (severity decision/audit consistency). Documentation/evidence and explicit CI generation environment follow in the final review commit. All commits are on PR #2's existing branch.

## Implemented fixes and regression evidence

| Defect / requirement | Root cause | Implementation | Verification |
|---|---|---|---|
| F01 lost updates and partial storage | Independent stale snapshots and asynchronous writers | Preserved transaction lease/reload/atomic replacement; complete field/reference validation; explicit cross-instance contention retry | Stale writer, concurrent creates, separate process exclusion, opposing approvals, independent API comment updates; final native suite |
| Interrupted writes / crash recovery | Temporary write or process death before commit | Existing rollback/lease containment verified with partial-write fault and SIGKILL; no automatic lock stealing | `tests/integrity.test.ts` proves source bytes/memory survive and dead-writer recovery is controlled |
| F14 invalid/orphaned records | Core-only schema validation missed optional/nested types and natural keys | `persistence-schema.ts` validates all declared record fields/nested structures; store checks current/historical FKs, role/SBU consistency, natural-key/session uniqueness | Invalid types/confidence/tags, duplicate serial, orphaned requester/event actor/recipient rejected; operational read-only preflight passes |
| F05 employee advances unresolved IT work | Owner target set included IN_PROGRESS | Existing remediation limits customer/employee to confirm/reopen; global IT/CTO grant preserved | API owner denial + authorized IT resume; all 720 role/state pairs checked |
| F10 priority downgrade and unsafe auto-resolution | Caller severity could defeat classification; low-risk text could bypass high-priority review | Existing max-severity floor/human routing retained; returned AI decision, execution log and audit now agree with final human-review policy | Critical+requested LOW and requested HIGH+low-risk classifier API tests; new consistency assertion failed before fix and passes afterward |
| Session expiry/revocation and service denial | Development tokens need current trusted user/session, not stale claims | Preserved persisted session digest allowlist and logout; tested expiry, disabled account, role revocation and service conversion; malformed cookie encoding denies access | Security tests plus HTTP/browser session restore and cookie replay |
| Cookie CSRF / wildcard CORS | Cross-origin browser writes and unrestricted response origin | Reject unallowlisted browser Origin; cookie writes require verified Origin; remove wildcard default; HttpOnly SameSite=Strict cookies | Missing/foreign Origin rejected, same-origin logout succeeds and revokes cookie/bearer |
| Browser token persistence | localStorage retained bearer tokens | Remove legacy persisted token, keep compatibility bearer in memory, restore via HttpOnly cookie | Four-role Chromium workflows reload successfully; localStorage token absent |
| Asset scope | Assigned user filter did not check current SBU | Employee/customer asset list and acknowledgement require assigned identity AND SBU; IT/CTO organization-wide access unchanged | Cross-SBU assigned asset hidden/acknowledgement denied; IT ticket access retained |
| API/proxy robustness | Non-object bodies, malformed cookie encoding and insecure protocol assumption | Reject null/array/oversized JSON before mutation; request/header timeouts; HTTP/HTTPS-aware proxy with normal TLS validation; generic upstream errors | Security/API tests, existing unavailable-upstream test, full HTTP smoke |
| F16 actual toolchain | No lockfile; lint/build were import-only | Locked pnpm 9.15.0 + Node 26.8.1, actual tsc/ESLint, browser binaries, native build verification; explicit Prisma generation | Clean offline frozen install, compilation/lint/build/browser results below |
| F17 ID/schema compatibility | UUID raw SQL could not import prefixed JSON IDs | Add transactional compatibility migration preserving existing UUID values as TEXT; align Prisma defaults/timestamps/relations/indexes; add sessions and historical labels | Real PostgreSQL empty migration and populated UUID upgrade; Prisma diff reports no difference |

Source paths: `apps/api/src/{app,store,persistence-schema,queue}.ts`, `apps/web/src/server.ts`, `packages/shared/src/index.ts` (prior remediation), Prisma schema/migrations, `scripts/{json-import,validate-json-migration,e2e-server,verify-types}.ts`, tests and locked toolchain configuration. Full review inventory is in [files.json](evidence/day2-final/files.json).

## Test results

Executed with Node **26.8.1**, pnpm **9.15.0**, PostgreSQL **18.6** (Homebrew) and Playwright **1.65.0** Chromium. Local PostgreSQL 18 is verified; the hosted PostgreSQL 16 job cannot run until billing is resolved. Native test scripts explicitly set test/dev_oidc/mock. Browser servers and database clusters always use mkdtemp fixtures and loopback; no real directory/mail/database target is used.

| Command / category | Passed | Failed | Skipped | Exit / evidence |
|---|---:|---:|---:|---|
| `npm test` at original remediation head | 42 | 0 | 0 | 0; executed baseline |
| Clean disposable `pnpm@9.15.0 install --offline --frozen-lockfile --ignore-scripts` | — | — | — | 0; [install log](evidence/day2-final/clean-frozen-install.log) |
| `npm run db:generate` | — | — | — | 0; generated Prisma 6.19.3 |
| `npm run typecheck` | — | — | — | 0; [actual tsc](evidence/day2-final/typecheck.log) |
| `npm run lint` | — | — | — | 0; [actual ESLint](evidence/day2-final/eslint.log) |
| `npm run build` | — | — | — | 0; [tsc plus native module/browser syntax](evidence/day2-final/build.log) |
| `npm run test:unit` | 7 | 0 | 0 | 0; [unit log](evidence/day2-final/unit-tests.log) |
| `npm run test:integration` | 9 | 0 | 0 | 0; [integration log](evidence/day2-final/integration-tests.log) |
| `npm run test:security` | 25 | 0 | 0 | 0; [security log](evidence/day2-final/security-tests.log); also rerun in final suite |
| `npm test` final aggregate | **54** | **0** | **0** | **0**; [native log](evidence/day2-final/native-tests.log) |
| `npm run test:e2e` | **4** | **0** | **0** | **0**; [Chromium log](evidence/day2-final/browser-tests.log) |
| `npm run test:db` (also in aggregate) | 1 | 0 | 0 | 0; [database log](evidence/day2-final/database-tests.log), also in aggregate |
| F10 consistency regression before final fix | 0 | 1 | 0 | 1; [failing assertion](evidence/day2-final/priority-decision-before.log) |
| `node scripts/validate-json-migration.ts .data/enterprise-db.json` | — | — | — | 0; [read-only source validation](evidence/day2-final/source-validation.json) |
| `NODE_ENV=test AUTH_MODE=dev_oidc MAIL_PROVIDER=mock node docs/development-reports/evidence/day2-http-smoke.mjs` | — | — | — | 0; pages/health 200, six parallel creates, logged-out cookie 401 |
| `pnpm@9.15.0 audit --json` final | — | — | — | 0; **zero known advisories** in registry snapshot; [audit](evidence/day2-final/dependency-audit.json) |
| `git diff --check` | — | — | — | 0; final review excludes no application files |

The aggregate includes component tests; do not add the rows together as independent coverage. 720 policy combinations are assertions within one test, not 720 test cases. No line/branch coverage percentage measured. The native application intentionally emits no Next/Nest production bundle; build compiles all included TS/TSX/tests/scripts with noEmit and checks the executing modules/browser code. The unused framework/integration declarations were updated for dependency advisories, not installed as a replacement runtime. Targeted transitive overrides are exercised by lint/Prisma tests. Registry audit success is not an exhaustive security certification.

## GitHub Actions investigation and results

Workflow: **Day 2 verification**, `.github/workflows/verify.yml`; four separated jobs: quality, tests, database and browser. Local composite setup checks out a pinned pnpm/runtime strategy, caches the pnpm store, installs frozen dependencies without lifecycle scripts and explicitly generates Prisma. Browser job installs Chromium. Database job creates a new cluster and requires its binaries; no external DATABASE_URL is accepted by tests. The generation step uses a nonoperational loopback placeholder URL and performs no connection.

| Run | Revision / event | Conclusion | Actual jobs |
|---|---|---|---:|
| [42591133535](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42591133535) | Previous remediation PR event | startup_failure | 0 |
| [42593975536](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42593975536) | 5c9777d / pull_request synchronize | startup_failure | 0 |
| [42594581042](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42594581042) | 05b67f7 / pull_request synchronize | startup_failure | No hosted success; API startup failure |

Precise evidence: authenticated GitHub run page 42593975536, Annotations, states the account-payment/spending-limit error quoted above. Independent API job listing returns `[]`. Repository Actions permissions are enabled/all allowed; the real workflow is registered active (ID 411862282). Synthetic failed-run metadata instead reports blank name/path `BuildFailed`/workflow ID 411860207, which is deleted. That mismatch is recorded, not mistaken for an executed application workflow. API access to billing usage returned 404; no account balances, card data or payment settings were collected/changed.

**Necessary external action:** account owner opens GitHub Settings → Billing & plans, resolves the failed-payment or spending-limit restriction identified by GitHub, then reruns required jobs on PR #2's current head. If the restriction remains after billing is resolved, provide these run IDs to GitHub Support. No action can be truthfully marked hosted-PASS until real jobs finish successfully. [Structured evidence](evidence/day2-final/github-actions.json).

## Database status and executed scope

- Kept original migration unchanged; new migration encloses UUID-to-TEXT conversion, preserved constraints, historical labels, session table and indexes in a transaction. No identifiers or records are regenerated/deleted.
- Actual `prisma migrate deploy` succeeded in a new disposable PostgreSQL cluster. Schema comparison against Prisma with `migrate diff --exit-code` succeeded with no difference.
- Import transaction processed all 13 synthetic collections plus a persisted synthetic session; prefixed ticket IDs survived. Repeat import was a no-op; existing differing records raised IMPORT_CONFLICT with no overwrite. Duplicate ticket number and invalid session user FK were rejected. Prisma transaction rollback was proven.
- A second database started from the preserved original UUID migration with existing SBU/role/user rows; baselined migration history and applied the compatibility migration. Existing UUID strings and user-to-SBU relationships remained unchanged.
- `pg_dump`/`psql` restored a synthetic database to a separate disposable database and counts for every imported collection/session table matched. Separate JSON backup/restore checks verify all-record equality and checksum preservation.
- All clusters/backups were temporary and cleaned up. **No operational import, migration, backup replacement or runtime database cutover** occurred. JSON remains authoritative. Database-backed API/outbox workers, immutable audit, operational RPO/RTO and approved production cutover remain Day 3+ implementation/release gates.
- Read-only preflight validates field types, primary/natural keys, FKs/historical relationships, required fields and source/canonical per-record checksums. Unknown metadata is retained; importer refuses unsupported fields rather than silently deleting them. See [database design](../architecture/DATABASE_DESIGN.md).

## Security status

Current approved policy is verified: employee/customer ticket ownership plus SBU; employee/customer asset identity plus SBU; explicitly organization-wide IT/CTO grants; CTO-only critical approval/escalated-state review; no interactive service identity. Narrower support-SBU/customer organization scopes remain a separate business decision and were not invented as part of this repair.

Development auth still requires both explicit development/test environment and dev_oidc mode. Production auth fails closed; no live Keycloak/AD login is claimed. Session expiry/revocation/disabled-account/current-role behavior, one-time reasoned approvals, privileged route denials, Origin CSRF guards, default CORS denial, cookie attributes, body validation and secret-note redaction are tested. Live AD writes, mailbox provisioning, real mail delivery and model-command execution remain disabled. Standalone JSON worker is still excluded safely.

Remaining production security gates: real OIDC/LDAPS certificate and entitlement lifecycle tests, TLS deployment, removing legacy in-memory/API bearer compatibility if BFF selected, CSP/inline-handler work, exact-action/expiry/separation-of-duty approval binding, durable outbox/notification retry and append-only external audit. These are not disguised as implemented by local tests.

## Data preservation

[Preservation evidence](evidence/day2-final/preservation.json): operational source SHA-256 before and after is `9a560b9a8d1dea860d073e1a75885632b4d312e9967de4a54997f5d8aa757573`; unchanged=true. `.env` unchanged=true; no credential values included. Existing source counts: 3 SBUs, 5 roles, 5 users, 6 categories, 5 tickets, 13 events, 1 comment, 3 assets, 2 approvals, 2 notifications, 4 AI logs, 11 audits, 3 articles. These are current observed local records, not company master-data validation. No operational records were deleted/reseeded/rewritten. Tests never used this file as writable storage.

## Acceptance matrix

PASS applies only to the explicit Day 2 development scope and current approved policy; it is not production approval.

| Gate / mandatory criterion | Status | Evidence |
|---|---|---|
| A Existing code/data preserved | PASS | Prior fixes retained, operational hash unchanged; additive migration |
| A Current Git state verified | PASS | Existing draft PR #2/branch reused; commits above; final inventory |
| A No destructive changes | PASS | No resets/force-push; test cleanup only disposable fixtures |
| A Sensitive configuration protected | PASS | `.env` unchanged; no raw secrets in report |
| B Critical data-loss defects fixed | PASS | Stale-write rejection, atomic request commits, full-record validation |
| B Concurrency tests pass | PASS | Parallel creates, child-process exclusion, opposing decisions, independent API updates/retry |
| B Failure rollback passes | PASS | Partial-write and rename faults, transaction rollback, SIGKILL fixture recovery |
| B Existing records intact | PASS | Hash and read-only preflight |
| B Recovery documented/tested in scope | PASS | JSON restore/checksum, PostgreSQL dump/restore, dead-lease recovery |
| C Authentication safeguards | PASS | Expiry, revoked/logout, disabled account, current role, missing opt-in and production denial tests |
| C Approved role/SBU policy | PASS | Current explicit grants tested; expanded membership policy isolated |
| C Unauthorized transitions blocked | PASS | API F05 and 720 policy pairs |
| C CTO escalation rules | PASS | Existing valid IT escalation/CTO review and negative owner/IT-state tests |
| C Approval replay protection | PASS | Rationale, PENDING-only, opposing decisions 200/409 |
| C Negative security tests | PASS | 25 security regressions plus existing integrations |
| D Schema/ID compatibility | PASS | Text-ID migration, populated UUID upgrade, zero Prisma diff |
| D Migration design documented/reviewed | PASS | Additive source review, ADR-008, database design and importer tests; no external approval claimed |
| D Validation tests | PASS | Record/natural-key/FK/history/checksum tests and source preflight |
| D Migrations executed where available | PASS | Disposable PostgreSQL 18.6; no skipped DB test locally |
| D Infrastructure availability explicit | PASS | Local database available/tested; hosted PostgreSQL 16 and real IdP not claimed |
| E TypeScript compilation | PASS | Actual tsc --noEmit |
| E Linting | PASS | Actual ESLint |
| E Build verification | PASS | Actual compiler plus native module/browser smoke |
| E Unit tests | PASS | 7/7 |
| E Integration tests | PASS | 9/9 plus database in aggregate |
| E Security regressions | PASS | 25/25, rerun in 54/54 aggregate |
| E Browser E2E | PASS | 4/4 real Chromium workflows |
| E CI actual hosted jobs | **BLOCKED** | GitHub explicit account payment/spending restriction; zero jobs |
| F Report based on evidence | PASS | This report, raw logs, command ledger, checksums |
| F No unresolved in-scope P0 | PASS | No P0 failure in executed local scope; production/release risks remain below |
| F Required changes reviewed | PASS | Source/schema/test review, compilation/lint, migration parity and diff checks |
| F PR passes required checks | **BLOCKED** | Account owner must resolve hosted job scheduling restriction |
| F Acceptance decision justified | PASS | Overall BLOCKED; draft retained, no premature merge |

## Remaining risks and next actions

1. **HIGH / Day 2 blocker:** GitHub account billing/spending restriction prevents any hosted jobs. Owner action required; then all four workflow jobs must pass on current head before merge/acceptance.
2. **HIGH / release gate:** Runtime remains local JSON with manual crash-lease recovery, serialized throughput, no power-loss certification or multi-host support. Implement the database repository/outbox and controlled cutover next; current database foundation does not imply runtime migration.
3. **HIGH / release gate:** Real enterprise IdP/AD, deployed TLS/CSRF/BFF decisions, exact privileged approvals and immutable audit require dedicated implementation and approved test infrastructure. No production identities/infrastructure were contacted.
4. **MEDIUM / future policy:** Assigned support-SBU scope, multiple memberships and customer organization boundaries need business approval. Current documented organizational IT/CTO grants remain intact.
5. **MEDIUM / reliability:** No client idempotency key for a lost response after committed ticket creation; do not blindly replay POST after timeout. Durable real notification retries/exactly-once external effects remain unimplemented and non-mock mail/standalone JSON workers remain disabled.
6. **MEDIUM / version coverage:** Local PostgreSQL 18.6 is proven; hosted PostgreSQL 16 execution is blocked along with other hosted jobs. Dependency audit is a registry snapshot, not proof of future vulnerability absence; overrides need continuing review.

## Day 3 readiness

**GO for continued isolated development**, using the validated toolchain/database foundation and preserved source. **NO-GO for merging as fully accepted Day 2, deployment or enabling corporate integrations** until hosted checks run successfully and the respective integration/cutover gates pass.

Next: owner resolves GitHub billing and reruns PR #2; then implement transactional runtime repositories/outbox, lossless cutover controls and production identity sessions. No requirement is marked complete merely to meet the 10 December target.


## Public repository CI revalidation — 9 November 2026

The repository visibility has been confirmed **public** via the GitHub repository API after the earlier report was written. Prior `startup_failure` runs were created before this visibility change. Public visibility by itself is **not** evidence that the account-level workflow scheduling restriction is resolved. A fresh CI run must actually schedule and complete quality, tests, database, and browser jobs before marking hosted acceptance PASS.


## Public-repository runner retest

After repository visibility changed to public, a non-destructive documentation commit (`73bc0b6`) triggered GitHub Actions run [42598208806](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42598208806). This confirms the public repository can register and dispatch the existing four-job workflow.

GitHub API reports the `quality`, `tests`, `database`, and `browser` jobs all **completed with conclusion failure**, but every job has `steps: []`; attempts to read each job log returned HTTP 404 `BlobNotFound`. No project commands, tests, or database migrations ran in those jobs. This is runner provisioning / pre-execution failure, not a test assertion failure and not an indication that public visibility fixed the earlier account restriction.

The previous authenticated GitHub annotation explicitly cited account payments/spending limits. The current four-job run has the same no-step signature; confirm the actual annotation from the Actions run page before asserting the precise reason for this newer run. Account owner should check Billing & plans / Budgets and contact GitHub Support with the new run ID if necessary. Hosted CI remains BLOCKED and PR #2 must stay unmerged until actual required checks pass.


## Latest independent runner investigation and complete local revalidation

The remote remediation branch advanced to f1d193f after the prior session. Fetched and fast-forwarded the clean local checkout, preserving the two existing remote commits. No source, workflow, lockfile, test assertions, runner policy or branch protection was altered during this recheck. `gh` is unavailable locally; authenticated GitHub connectors and REST were used instead.

### Confirmed root cause — not inferred from an earlier private run

On the authenticated page for public-repository run [42598208806](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42598208806), every job annotation explicitly states: **The job was not started because your account is locked due to a billing issue.** This was independently read from the page; no billing information/settings were changed.

A single fresh `workflow_dispatch` was accepted for `verify.yml` on `fix/day2-closure-severity-ci`, producing run [42599568751](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42599568751) at f1d193f581e726bea3a5bb894998f8129df99b73. Its check-run annotations independently confirm the same account lock through the REST API:

| Job | Job ID | Conclusion | Executed steps | Exact annotation |
|---|---:|---|---:|---|
| database | 129100397969 | failure | 0 | The job was not started because your account is locked due to a billing issue. |
| tests | 129100398210 | failure | 0 | The job was not started because your account is locked due to a billing issue. |
| quality | 129100398358 | failure | 0 | The job was not started because your account is locked due to a billing issue. |
| browser | 129100398382 | failure | 0 | The job was not started because your account is locked due to a billing issue. |

These are registered jobs with pre-execution failure, not zero registered jobs and not failing project commands. The earlier missing job logs/BlobNotFound do not provide application failure evidence. Repository Actions remain enabled with all actions allowed. Both YAML files parse successfully with the installed js-yaml parser; expected triggers, four jobs, ubuntu-24.04 runner declarations and composite setup structure were checked. Actual GitHub registration independently validates that the workflow plan exists. No unsupported-runtime or code-level assertion failure was observed because runtime setup never started.

No workflow fix is justified by these diagnostics. No alternate account/runner, no-op check, disabled test, payment change or protection bypass was used.

### Re-executed local gates

All commands below used the exact pinned launcher `npm exec --yes --package=pnpm@9.15.0 -- pnpm`, Node 26.8.1 and isolated resources. An explicit dummy loopback DATABASE_URL was supplied for generation; tests create their own PostgreSQL cluster and never use that URL as a live target. DB_REQUIRED=true prohibited skipping the database gate.

| pnpm command | Exit | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| install --frozen-lockfile --ignore-scripts | 0 | — | — | — |
| db:generate | 0 | — | — | — |
| typecheck | 0 | — | — | — |
| lint | 0 | — | — | — |
| build | 0 | — | — | — |
| test | 0 | 54 | 0 | 0 |
| test:security | 0 | 25 | 0 | 0 |
| test:db | 0 | 1 | 0 | 0 |
| test:e2e | 0 | 4 | 0 | 0 |
| audit --audit-level=moderate | 0 | — | — | — |

Security/database component counts overlap the 54-test aggregate; browser tests are separate. The database gate again executed migrations, compatibility upgrade, import/reimport/conflict handling, transaction rollback, Prisma parity and dump/restore in disposable PostgreSQL 18.6. Chromium tests again exercised employee/customer/IT/CTO workflows. No production IdP/directory/mail or database was contacted. No coverage percentage is inferred.

Exact commands/exits and logs are under [day2-ci-recheck](evidence/day2-ci-recheck/commands.json). [Hosted annotations](evidence/day2-ci-recheck/hosted-run.json) record all four explicit errors. [Preservation](evidence/day2-ci-recheck/preservation.json) confirms operational JSON and `.env` are unchanged during this recheck.

### Current acceptance and owner action

Gates A–D and all executed local portions of E remain PASS within the approved development scope. Gate E's successful hosted jobs and Gate F's passing PR checks remain **BLOCKED**. No in-scope source regression was found, but local success does not satisfy hosted acceptance. PR #2 remains draft and unmerged; no required reviews/checks are bypassed.

The account owner must resolve the **account billing lock** in [GitHub billing settings](https://github.com/settings/billing), or contact GitHub Support with runs 42598208806 and 42599568751 if billing is already corrected. Making the repository public alone did not unlock the account. After GitHub unlocks it, rerun the existing workflow on the current PR head and require all four jobs to execute real steps and pass. Then verify review/conversation/protection requirements before readiness/merge and post-merge validation.

Final verdict remains **BLOCKED**. Day 3 is **GO only for isolated development**, and **NO-GO for accepted merge/deployment or corporate integration enablement** until the required gates pass. Only this report and verification evidence changed; no application/workflow modifications were made merely to trigger jobs.


## Zero-cost recovery and verification — 9 November 2026

### Verified eligibility and remaining account dependency

Official [GitHub Actions billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions) confirms free standard hosted runners for public repositories. AIIT is public and uses standard ubuntu-24.04 runners. That eligibility does not unlock the account. Latest inspected run [42599910372](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42599910372) still has four failed jobs with no steps; each annotation explicitly says the account is locked due to a billing issue. [Structured annotations](evidence/day2-no-cost/hosted-lock.json).

[GitHub's lock guidance](https://docs.github.com/en/billing/how-tos/troubleshooting/locked-account) documents failed authorization holds as one possible reason free-tier access can remain blocked and directs owners with no actionable billing issue to Support for review. Repository/job access does not establish whether this account has a failed hold, unpaid usage or another billing flag. No payment-method information was accessed or changed. Restoring free access without payment is a legitimate Support request, not a completed or guaranteed unlock. The [prepared request](../ci/GITHUB_SUPPORT_REQUEST.md) is ready for owner review at the [official portal](https://support.github.com/contact), and was not submitted. No authorized support-submission connector is available. No alternate account or unauthorized runner was used.

### Repository implementation

- Added executable `scripts/verify-local.ts`. It runs every required command using pinned pnpm 9.15.0, enforces Node 26.8.1 and required disposable PostgreSQL tests, records logs/actual exit codes/signals/counts, refuses existing evidence directories and exits nonzero on command failure or protected-file hash changes. It explicitly records that local results are not hosted CI. Default evidence is private temporary local storage; nothing is published to GitHub status APIs.
- Added a fault regression to `tests/integrity.test.ts`, which is already included in the preserved GitHub workflow. Deliberately removing npm from PATH causes the verifier to return failure for all child-start errors; existing evidence cannot be overwritten. This synthetic fault test does not count as passing the real verification commands.
- Added `.circleci/config.yml` as a prepared optional hosted alternative using a verified vendor Node 26.8.1 image/digest, distribution PostgreSQL tools, Chromium prerequisites and the same all-gates verifier. YAML and embedded bash syntax pass locally. There is no connected CircleCI project/account, CLI or local Docker execution; provider validation/execution/status reporting are NOT VERIFIED. No GitHub required checks were removed/replaced, and no paid service was activated.
- During the first real verifier run, Chromium exposed a pre-existing initialization race: the login badge/navigation became usable before initial data finished loading, then a delayed dashboard switch hid the support form. The verifier correctly returned exit 1 with 3 passed/1 failed browser tests. Fixed the actual UI behavior by keeping workspace navigation hidden until initialization/default-tab setup completes. Added a delayed-response browser regression without weakening assertions. The original failure is retained as [initial-browser-failure.log](evidence/day2-no-cost/initial-browser-failure.log).
- Added [no-cost setup/recovery documentation](../ci/NO_COST_VERIFICATION.md), pricing/permissions/eligibility limitations, exact owner actions and prepared Support text. Existing application architecture, mocks, credentials and operational dataset are preserved.

### Current local results

Command executed: `node scripts/verify-local.ts --output /tmp/aiit-no-cost-verification-accepted`. The script performed the following real commands through `npm exec --yes --package=pnpm@9.15.0 -- pnpm`:

| Command | Exit | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| install --frozen-lockfile --ignore-scripts | 0 | — | — | — |
| db:generate | 0 | — | — | — |
| typecheck | 0 | — | — | — |
| lint | 0 | — | — | — |
| build | 0 | — | — | — |
| test | 0 | **55** | 0 | 0 |
| test:security | 0 | 25 | 0 | 0 |
| test:db | 0 | 1 | 0 | 0 |
| test:e2e | 0 | **5** | 0 | 0 |
| audit --audit-level=moderate | 0 | — | — | — |

Final verifier exit: **0**. Security/database counts overlap native totals; browser tests are separate. The new fifth Chromium case proves delayed initialization cannot reset early form navigation. The native count increased from 54 to 55 for the verifier fault/evidence-protection regression. [Final summary, exact commands/exits and preservation](evidence/day2-no-cost/summary.json); individual logs are in the same directory. No corporate infrastructure was contacted. Source `.env` and operational JSON hashes remain unchanged throughout both verifier runs, including the failed run. Audit success is a registry snapshot, not a permanent vulnerability guarantee.

### Alternative provider: CircleCI Free, not yet configured

Official [credits documentation](https://circleci.com/docs/guides/plans-pricing/credits/) describes a personal/non-open-source Free allowance of 30,000 monthly credits, 1 GB transfer and 2 GB-months storage, with up to 400,000 credits for eligible public Linux open-source builds. This repository has no license file, so expanded open-source eligibility is not assumed and no license was introduced. The project owner must confirm actual Free entitlement/limits and avoid paid plans, trials or automatic charges before activation.

The existing repository can be connected through CircleCI's GitHub App, with appropriate status/check reporting and repository-scoped access. The vendor image tag/digest was verified through Docker Hub; Node/pnpm, PostgreSQL and Chromium commands are specified. No deployment secrets or corporate credentials are needed. Account creation, terms acceptance, GitHub App authorization, provider-side config validation and an actual hosted run remain owner/setup dependencies. No claim of an active integration or equivalent accepted merge gate is made. Existing GitHub branch protection remains strict and unchanged; CircleCI cannot silently replace quality/tests/database/browser checks. Full documentation and primary sources: [NO_COST_VERIFICATION.md](../ci/NO_COST_VERIFICATION.md).

### Final status and next steps

| Verification path | Status |
|---|---|
| All mandatory local checks | **PASS**, actual ten-command run |
| CircleCI alternative | **NOT CONFIGURED**, repository preparation only |
| GitHub-hosted required jobs | **BLOCKED**, verified account billing lock |
| Operational/configuration preservation | **PASS**, content hashes unchanged |
| Day 2 hosted/PR acceptance | **BLOCKED**, policy unchanged |

The prepared fallback is useful for zero-cloud-cost development, but does not satisfy hosted acceptance. Account owner: review/send the Support request for no-payment restoration, or explicitly authorize a verified CircleCI Free project and formal equivalent-gate policy after successful execution. Do not change payment methods, disable GitHub protection or merge failing code. PR #2 remains draft/unmerged. Day 3 isolated development can proceed; production readiness and fully accepted Day 2 remain unclaimed.
