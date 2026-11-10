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
