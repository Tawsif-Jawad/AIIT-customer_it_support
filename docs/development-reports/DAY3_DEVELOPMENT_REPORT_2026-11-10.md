> Owner-authorized policy closure: the generic JSON escalation conflict is now fixed and verified; see the closure section at the end. Local development may continue while formal gates remain blocked.

> Final remediation update (2026-11-10): implementation `9908a66` passes all ten local commands: 102 native / 25 overlapping security / 28 overlapping DB / 17 browser. See the final remediation section below for current results, the live-data preservation qualification, open JSON route conflict and blocked hosted/review gates. Earlier results are retained historical snapshots.

# Day 3 development report — Tuesday, 10 November 2026

## Executive summary and verdict

**PARTIAL overall; LOCAL PASS for the isolated transactional PostgreSQL slice. Formal integration BLOCKED. Production readiness NOT ACHIEVED.** Real executable repositories, a third additive migration, atomic history/audit/requester intents, concurrency controls, import checksum comparisons and durable job claims are implemented and tested. The existing native HTTP/JSON application is preserved. This is the explicitly permitted tested vertical slice, not a complete PostgreSQL runtime integration.

## Source and pre-development audit

- Repository: `Tawsif-Jawad/AIIT-customer_it_support`.
- Source branch: `audit/day1-day2-full-functional-review`; exact source commit `4dfe6358d1eba120edaa50283e2fab2ea62d12f5`.
- Initial `git status --short`: empty; no working-tree changes. Remotes/recent history inspected. No AGENTS.md found in the workspace inventory.
- Day 3 branch: `codex/day3-transactional-postgres`, created directly from that source in the existing checkout.
- PR #3 is open/unmerged, targets `fix/day2-closure-severity-ci`; its head matches the source. PR #2 is draft/unmerged and targets main. The correct Day 3 PR base is PR #3's branch, not main.
- Read the requested roadmap/migration/architecture/decisions/database/recovery/permission/Day 2 acceptance documentation, actual HTTP routes/shared policies, store/schema validator, Prisma schema and both existing migrations, importer and database tests. Reused those foundations; no duplicate importer or replacement framework was introduced.
- Baseline verifier launched before edits. To remove any ambiguity from edits overlapping that first run, all ten baseline commands were independently rerun on a pristine `git archive` of the exact source commit in a separate temporary directory with its own dependencies. All passed: **72 native, 25 overlapping security, 1 overlapping database, 17 browser; zero failures/skips**. See `evidence/day3/baseline/`. Its absent operational files are not preservation evidence for this checkout; the in-checkout baseline and final verifier separately confirmed protected-file preservation.
- Implementation commit: `225c201e316179c457036e1672f00c6d6934eebc`. Historical-fixture test commit: `0d41cd12ed640c4c9b8fad4ef781cb05cfbd9b00`. Evidence/report commits contain no subsequent application changes.

## Files and architecture changes

| Files | Actual change |
|---|---|
| `apps/api/src/postgres-repository.ts` | Explicit ticket transaction interface and implementation; current identity/scope checks, atomic create/comment/status/escalation/approval/custody operations, structured conflicts |
| `apps/api/src/postgres-outbox.ts` | Explicit durable outbox interface; atomic claims, fencing tokens, expiring leases, bounded retries/backoff, retained failures |
| `apps/api/prisma/schema.prisma` | Versions, counter/jobs, additional references and composite SBU integrity |
| `apps/api/prisma/migrations/20261110000000_transactional_foundation/migration.sql` | Additive schema, FK/index/check constraints and SQL historical guards; first two migrations unchanged |
| `scripts/json-import.ts` | Serialized repeat imports, stricter source association checks and canonical target verification; original mapping/transaction/CLI guards retained |
| `tests/database.test.ts`, `tests/support/day3-postgres.ts` | Real disposable migration/import/concurrency/security/rollback/restart/outbox and two restore drills |
| `docs/architecture/POSTGRES_REPOSITORY.md` | Complete transaction, worker, compatibility, integration limits and recovery contract |
| `docs/{ARCHITECTURE,MIGRATION_PLAN,ROADMAP,IMPLEMENTATION_STATUS}.md`, `docs/architecture/{DATABASE_DESIGN,PERSISTENCE_RECOVERY}.md` | Current-status pointers above retained historical documentation |
| `docs/development-reports/DAY3_{DEVELOPMENT_REPORT,TEST_REPORT,ACCEPTANCE}_2026-11-10.md`, `evidence/day3/` | Measured results, acceptance, safe logs/manifests and review evidence |

The default API/store/worker paths, shared policies, package dependencies, lockfile, CI workflows, original migrations and operational data are unchanged. The attempted shared-validator change was reverted after an existing security test demonstrated the compatibility impact; stricter checks live only in the importer and database.

## Implemented capabilities and schema compatibility

SERIALIZABLE transactions create a NEW ticket with initial event/audit/job intent; append comments/events; compare-and-set status (including escalation/CTO restrictions and requester reopen routing); decide a PENDING approval once; and acknowledge pending custody with append-only history. Every associated event/audit/intent rolls back with its business operation. Current active role/SBU is reloaded server-side rather than trusting a body claim. Counter allocation retains INC/REQ numeric format and considers imported suffixes. Ticket, asset and approval versions prevent silent stale writes. Parameterized Prisma/tagged SQL handles production inputs.

The third migration preserves all existing IDs/timestamp types and adds versions with default zero, a counter and durable notification jobs. Composite FKs enforce requester/custodian SBU association; event actor/audit SBU references are enforced. SQL guards reject history edits/deletes/truncation, completed approval changes and custody-prefix replacement. Separate production grants and migration credentials remain required; owner/superuser DDL is outside trigger guarantees. ADR-007 is not silently promoted to a new owner decision; this builds on Day 2's already implemented text-ID compatibility.

## Test and execution evidence

The final ten-command verifier runs on tested source commit `0d41cd1` (implementation `225c201` plus historical-fixture tests) with Node **26.8.1**, pinned pnpm **9.15.0**, and `DB_REQUIRED=true`. All commands exit **0**: frozen install, Prisma generation, typecheck, lint, build, native/security/database/browser tests and moderate audit. Final results: **82 native**, **25 security subset**, **11 database subset**, **17 Chromium browser**; no failures/skips. Counts overlap as described in the test report. Logs/actual exit codes and preservation are in `evidence/day3/summary.json` and adjacent command logs.

Initial failures were real and corrected: native Node rejected TypeScript constructor parameter properties; concurrency surfaced a Prisma raw-query SQLSTATE mapping gap; schema comparison caught FK update-action drift; lint required type-only imports; and the shared JSON validator change broke an existing cross-SBU negative fixture. No failing assertion was removed or existing expectation weakened. Representative failed full-run logs are retained under `initial-failures/`; they are not acceptance evidence.

## Migration, privacy and recovery

Only newly created loopback PostgreSQL **18.6** clusters/databases and synthetic source snapshots were used. The harness never connects to an externally configured database and cleans up only its own temporary directory/cluster. Fourteen collections (including sessions, attachment metadata and nested custody history) are checked by counts/IDs/canonical source-field checksums. Identical sequential/concurrent reimports are no-ops; conflicting rows after earlier inserts roll back. Source IDs/history/timestamps are retained. The source manifest records hashes/counts without raw records.

Normalization is explicit: current user role/SBU labels derive from validated relations, timestamp instants normalize to UTC, session milliseconds map to DateTime, and database defaults absent from source are excluded from source checksums. No source file is rewritten. Imported notification rows are not automatically queued for external redelivery.

Two actual pg_dump/psql restores pass: imported source checksums/counts, then complete post-mutation table content including versions/outbox states/counter. Restored audit guards are also tested. Populated UUID upgrade and Prisma parity pass. This is logical restore evidence, not disaster recovery timing, production RPO/RTO or PostgreSQL 16 execution evidence.

Protected local JSON and `.env` remain unchanged, with verifier hash evidence. Committed evidence contains command results, synthetic counts/hashes and diagnostics; no database credentials, raw snapshots, session tokens, SQL dumps or corporate transport configuration are committed. AD/SMTP/enterprise identity provisioning remains disabled. Existing organization-wide IT/CTO permissions and requester/CTO review restrictions pass regression tests.

## Remaining risks, Day 4 and owner dependencies

1. **HIGH: API integration is incomplete.** No default store switch. Initial database creation stops at NEW; existing mock AI triage, initial approval/routing and full recipient rules remain in JSON. Other entity administration/list/query/session APIs, attachments and asset transfers need adapters/tests before cutover.
2. **HIGH: formal acceptance is blocked.** PR #2/#3 are unmerged, independent approval is outstanding and required hosted jobs have not demonstrated successful execution. Historical account billing-lock evidence remains; no billing/protection/workflow bypass is attempted. Fresh run metadata is recorded with the PR handoff.
3. **HIGH: identity and runtime DB grants.** A future authenticated adapter must bind actor IDs from verified sessions. Real OIDC, runtime/migration role separation, immutable export/retention policy and operational authorization for workers are unfinished.
4. **MEDIUM: worker delivery scope.** Claims are durable; no dispatcher/SMTP or exactly-once delivery. Leases can lead to duplicate external effects after a crash. Renewal/monitoring, full recipient rules and explicit client request idempotency remain.
5. **MEDIUM: schema prerequisites.** Cross-SBU custody/requester inconsistencies fail import/migration. Resolve them with the owner; never normalize them silently. Corporate organization/membership policy, exact-action approval binding/expiry/separation, RPO/RTO and production cutover remain decisions/dependencies.
6. **MEDIUM: environment coverage.** Only local PostgreSQL 18.6 and Chromium proven. Required hosted PostgreSQL 16, actual staging behavior, scale/performance and production recovery remain unverified. Counter exhaustion/extreme numeric legacy suffixes fail closed.

Day 4: **GO for isolated session/OIDC adapter design and broader repository integration**, subject to an approved nonproduction realm/infrastructure. **NO-GO for accepted integration, production cutover, corporate provisioning or merge** until the required prerequisite checks/reviews/owner decisions pass. The December 10 target is planning context, not readiness evidence.

## Source-control handoff

Published draft [PR #4](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/4) against the correct PR #3 dependency branch. Commits: `225c201` implementation, `0d41cd1` historical import verification, `d5d760d` reports/manifests, `11478bb` safe raw logs, followed by this report-only hosted handoff. Remote dependency head was rechecked and still equals source `4dfe635`.

Fresh PR run [42755426743](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42755426743) at `11478bb` failed quality/tests/database/browser before steps. Every check annotation explicitly confirms the account billing lock; see `evidence/day3/hosted-ci.json`. Formal acceptance remains BLOCKED. PR is draft/unmerged; independent review outstanding. No billing/protection settings were changed.

## Final remediation and verification — 10 November 2026

**Overall PARTIAL. LOCAL ENGINEERING PASS for the requested repository fixes and applicable local checks. FORMAL ACCEPTANCE BLOCKED. PRODUCTION NOT READY.** The task-wide operational-file hash changed during live login activity; only the final verification interval is attested unchanged. This qualification supersedes any earlier blanket task-preservation claim. Earlier implementation/results remain historical evidence.

### Audit, source and root causes

Remediation began on clean `codex/day3-transactional-postgres` at `57ece2b720f47d5f4411e465f3e188371165eb1e`. `git fetch origin` completed; local/remote divergence was 0/0. PR #4 remains based on PR #3's `audit/day1-day2-full-functional-review`, which depends on PR #2. All are unmerged. Read the existing reports, actual PostgreSQL repository/outbox/migration/schema/importer, shared state/authorization/redaction policies, JSON handlers and native/database/browser regressions before edits.

Implementation commit: **`9908a66bfa53673f6c2bf547d287575840e87d62`**. This contains all remediation application/test changes. Subsequent report/evidence changes do not change tested code.

The original escalation discrepancy arose because the new repository implemented the shared state graph and a generic status update without the dedicated API handler's side effects. It accepted short nonblank reasons and did not promote severity. The approval discrepancy arose because a helper coupled ticket-event insertion to a ticket-resource audit, so approvals inherited the wrong audit resource and omitted decision metadata.

### Implemented fixes and files

- `apps/api/src/postgres-repository.ts`: every CTO escalation requires at least five trimmed reason characters, stores redacted rationale, updates status/severity (`ESCALATED_TO_CTO`/`CRITICAL`), version and timestamp, and creates dedicated escalation event/audit plus durable requester intent in one transaction. Existing shared role/state/CTO review guards remain unchanged. Event insertion is separated from the ticket audit wrapper so approval events stay on the ticket while audits correctly target `Approval`/actual approval ID, with current actor/role, ticket ID, action type, decision and redacted decision notes. No prior history is rewritten.
- `apps/api/src/postgres-outbox.ts`: a newly reproduced expiry bug is fixed. The old completion predicate used transaction-start `now()` before a potentially blocking row lock; a worker could complete after its lease expired. Completion/retry now lock first, then check expiry against `clock_timestamp()`. Claims/reclaims also use current database wall-clock time. Fencing tokens, attempt bounds and atomic notification/job updates remain intact.
- `tests/support/day3-remediation.ts`: 17 new PostgreSQL regression subtests covering both fixes, five-character boundary/invalid input, authorization and current-role revocation, concurrent escalations/opposing decisions, correct/redacted audit/event metadata, replay denial, full rollback after injected outbox failure, and lock-delayed lease expiry/reclaim.
- `tests/database.test.ts`: invokes those tests inside the existing disposable cluster before the full post-mutation backup/restore. Original migration/import/restore/UUID/parity tests remain.
- `tests/day3-remediation.test.ts`: three new isolated JSON API regressions for dedicated IT/CTO escalation, requester/CTO review restrictions and approval audit/redaction/replay parity. Creates explicit temporary datasets; never uses the operational file.
- `docs/architecture/POSTGRES_REPOSITORY.md`: documents the changed escalation/audit/lease behavior and the pre-existing JSON route conflict below.
- This report, the existing test/acceptance reports and `evidence/day3/remediation/`: current results, failures, safe manifests, live-scope/preservation qualifications and hosted/review evidence.

The schema and all three migrations are unchanged in this remediation. No dependencies, state graph, shared policies, operational API routes, default storage selection or production integration settings changed.

### Complete review and additional findings

Reviewed transaction scope, current-identity reload, requester/SBU and global IT/CTO policy, version predicates, number allocation, deterministic per-operation job IDs, append-only guards, import equality/canonical projection, parameterized SQL, lease/retry boundaries and error handling. Executable concurrency/rollback/import/recovery regressions pass. SQL owner/DDL bypass, request replay after a lost response, extreme numeric suffix/counter exhaustion, remaining entity/session adapters and full worker/recipient integration remain documented limitations, not silently resolved policies.

**Additional fixed defect:** lease expiry during row-lock wait, reproduced by the new regression before the fix and passing afterward.

**Existing policy conflict, deliberately not modified:** JSON `POST /api/tickets/:id/escalate-cto` requires a five-character reason and CRITICAL severity, but generic `POST /api/tickets/:id/transition` permits escalation through the shared graph without those rules. An isolated fixture probe returned HTTP 200 with one-character notes and MEDIUM severity. This is recorded in `json-policy-conflict.json`. The explicit instruction to keep the operational JSON API unchanged prevents silently harmonizing that route here. It requires an owner-authorized follow-up before universal escalation parity/production acceptance can be claimed. The PostgreSQL method now enforces the dedicated policy consistently.

### Executed results and failure evidence

`node scripts/verify-local.ts --output /tmp/aiit-day3-remediation-final` ran all ten exact mandatory pinned commands on `9908a66`, Node 26.8.1/pnpm 9.15.0, with `DB_REQUIRED=true`. **All commands exit 0; verifier exits 0.** Native **102/102**, security subset **25/25**, database subset **28/28**, browser **17/17**; no failures/skips. Twenty native tests were added (17 DB subtests plus 3 JSON API tests); security/DB counts overlap native coverage. Install, Prisma generation, typecheck, lint, build and moderate dependency audit pass.

Before fixing implementation, the added DB regressions produced **16 pass / 11 fail out of 27**, including the failing parent fixture. They reproduced LOW instead of CRITICAL, short-reason acceptance, missing Approval-resource audits and expired-lease acknowledgment. That red log is preserved. An intermediate edit accidentally renamed JavaScript `Date.now()` while replacing SQL `now()`; the targeted suite caught it and it was corrected. An initial JSON test selected a non-escalatable fixture state; it was corrected to create valid fresh requests while retaining assertions. These failed logs are retained separately and are not counted as final passes.

Disposable PostgreSQL 18.6 applies all three unchanged migrations; IDs/FKs, concurrent ticket/approval operations, atomic records, outbox fencing/reclaim, identical repeat imports, fourteen-collection manifests, late import rollback, populated UUID upgrade and Prisma schema parity pass. Both logical restore drills still compare exact imported source checksums and full post-mutation tables, now including remediated event/audit/job data. No operational database was contacted.

### Live inspection and preservation qualification

Existing processes at ports 3000/4000 were left running. HTTP GET of `/` and `/app` returned 200; browser navigation visibly confirmed landing content, the workspace development-identity form and mock-integration notice. No live login, logout, approval, ticket or custody mutation was performed by the agent. Those workflows were verified through 17 real Chromium tests on temporary JSON-backed servers and isolated API fixtures, not against operational records. PostgreSQL is not the live store.

The initial operational JSON hash and a later observation differ. The live dataset contains an additional `AUTH_LOGIN_SUCCESS` observation at `2026-11-10T05:09:23.779Z` (11:09:23 Asia/Dhaka). Hashes alone do not establish a full record-level diff or the origin of every outside change, so a task-wide unchanged-data claim is **not made**. The agent's live requests were read-only and every test uses explicit temporary storage. `.env` is unchanged from task start. The full ten-command verification interval independently reports **both operational JSON and configuration unchanged**. `task-preservation.json` preserves this distinction; no live state was reverted or overwritten to make hashes match. No raw dataset, session secret, SQL backup or credential is committed.

### Hosted CI, independent review and readiness

Existing PR [#4](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/4) contains `9908a66`; no duplicate PR, merge, retarget or self-approval. At that commit, [run 42760455464](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42760455464) failed quality/tests/database/browser before executing steps. Every check annotation explicitly states: **The job was not started because your account is locked due to a billing issue.** Source and IDs are in `remediation/hosted-ci.json`. No workflow, billing, required check or protection setting changed.

PR #4 has zero review submissions. The user supplied `Tawsif-Jawad` as reviewer, which is also the PR author; GitHub cannot request that author as an independent reviewer. No invalid self-review request or approval was sent. A different eligible reviewer remains required. The PR remains draft/reviewable with honest gates.

**Recommendation:** finish Day 3 independent review, hosted verification and the documented JSON policy decision before formal acceptance or advancing the milestone. No Day 4 work, production deployment/cutover, AD, SMTP or privileged executor was started. Enterprise identity, live repository/session/worker integration, operational role/retention/recovery controls and prerequisite PR integrations remain production blockers.

## Owner-authorized JSON escalation policy closure — 10 November 2026

The owner explicitly authorized closing the previously preserved JSON route conflict and continuing isolated Day 4 development while hosted CI/review remains blocked. Commit `b3c4412` unifies dedicated `/escalate-cto` and generic `/transition` escalation through one handler, preserving IT/CTO guards, CTO-review restrictions, dedicated history/audit and CTO notification behavior. A shared domain reason helper requires five non-whitespace characters, trims/redacts input and is also used by the PostgreSQL repository. Both routes set CRITICAL severity. Notification failure now aborts the escalation transaction rather than suppressing a required-intent failure.

Ten new isolated regressions cover both routes, IT/CTO success, requester denial, short/blank/whitespace rejection, audit/history/notifications, CTO review and complete rollback after injected notification failure. All ten pinned verification commands exit 0: **112 native, 25 overlapping security, 28 overlapping DB, 17 browser; no failures/skips**. Protected JSON and .env are unchanged during verification. Evidence: `evidence/day3/policy-closure/summary.json` and adjacent safe logs. No operational server restart, merge, production migration or provisioning occurred.

The generic JSON escalation conflict is **CLOSED in source**, superseding the earlier open-finding statements retained above. Required hosted checks, independent reviews and dependency merges remain blocked. The newly authorized Day 4 branch will derive from this verified Day 3 source plus documentation commit; continued development does not approve a release.
