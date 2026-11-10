# Day 3 test report — 10 November 2026

**Local result: PASS within the isolated PostgreSQL vertical slice; hosted acceptance remains BLOCKED.** No test count substitutes for required CI or independent approval.

Toolchain: Node 26.8.1, pinned pnpm 9.15.0, Prisma 6.19.3, disposable local PostgreSQL 18.6, Chromium. Final tested source: `0d41cd12ed640c4c9b8fad4ef781cb05cfbd9b00` (repository implementation `225c201` plus nonempty historical import fixtures). Subsequent changes are reports/evidence only.

## Mandatory commands

Executed through `node scripts/verify-local.ts --output /tmp/aiit-day3-0d41cd1`, which launches the exact pinned commands below, enforces `DB_REQUIRED=true` and checks operational/configuration preservation. Final raw logs, counts and actual process exit codes are in [evidence/day3/summary.json](evidence/day3/summary.json).

| Command (each prefixed `npm exec --yes --package=pnpm@9.15.0 -- pnpm`) | Exit | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| `install --frozen-lockfile --ignore-scripts` | 0 | — | — | — |
| `db:generate` | 0 | — | — | — |
| `typecheck` | 0 | — | — | — |
| `lint` | 0 | — | — | — |
| `build` | 0 | — | — | — |
| `test` | 0 | 82 | 0 | 0 |
| `test:security` | 0 | 25 | 0 | 0 |
| `test:db` | 0 | 11 | 0 | 0 |
| `test:e2e` | 0 | 17 | 0 | 0 |
| `audit --audit-level=moderate` | 0 | — | — | — |

Security and database totals overlap the native suite; they must not be added to 82. The database suite reports its parent fixture plus ten named subtests (11), replacing the previous one-test fixture. Browser tests are separate. New database security negatives are in the DB/native suite, while the unchanged dedicated security command retains 25 tests. No coverage percentage is inferred. Dependency audit reports no known vulnerabilities in the queried registry snapshot.

Pristine baseline at `4dfe635`: all ten commands exit 0, native 72/security 25/database 1/browser 17, zero failed/skipped; logs are under [baseline](evidence/day3/baseline/). The archived source was separately installed/generated and did not share the live checkout's generated client. In-checkout protection checks also pass; the archived baseline has no operational dataset to protect.

## New database behavior verified

- NEW ticket create/read retains prefixed IDs and INC/REQ number format, writes event/audit/job intent atomically; validates input and unknown categories; rejects duplicate keys, invalid event actor/audit SBU and requester-SBU mismatch.
- Requester/nonowner, cross-SBU, inactive identity, internal-comment and approval negatives; original global IT grant and CTO escalation review restrictions remain enforced.
- Two simultaneous version-zero transitions: exactly one succeeds, the other conflicts; final version is one.
- Five concurrent comments preserve five comments and corresponding events/audits; five concurrent creates allocate unique ticket numbers. Tests explicitly retry confirmed serialization aborts with a bounded budget; they do not claim every first attempt succeeds.
- Opposing approval decisions yield one committed decision/version increment. Completed approval, audit, event and AI-history mutation/delete attempts fail. Audit TRUNCATE fails.
- Valid escalation, CTO resolution and requester reopen route to IT; reopen clears resolution timestamp.
- An injected database trigger failure on outbox insertion rolls back ticket, counter, event, audit and notification counts/content. This tests a late failure inside the real business operation, not just an artificial empty transaction.
- Invalid custody/unauthorized actor fails; valid acknowledgment appends once; repeat acknowledgment is idempotent. History replacement, deleting an asset with history and cross-SBU assignee updates fail.
- A separate Prisma client reloads persisted ticket/comments after the original operations (connection/process-independent committed state; not a database power-loss test).
- Independent worker clients cannot claim the same outstanding job. Expired lease reclaim changes token/attempt count, stale token acknowledgment fails, retry backoff blocks immediate redelivery, exhausted retry/lease jobs are retained FAILED, and successful synthetic completion persists status.

## Import and recovery verified

The original database fixture now applies three migrations. It imports fourteen source collections including a nonempty historical comment with attachment metadata, delivered notification, completed approval, existing events/audit/AI/custody/KB and a synthetic session digest. A non-UTC top-level timestamp is compared by normalized UTC instant; nested data is retained. Imported notifications create no job/replay.

Sequential and simultaneous identical reimports preserve rows. Invalid SBU association fails validation. A late conflicting ticket after a newly inserted SBU rolls back the SBU too. Count/checksum discrepancy fixtures are rejected. Unique/FK failures and a normal transaction rollback remain covered.

Two disposable logical backup/restore drills pass: (1) exact source count/ID/canonical checksum manifest after import; (2) exact full content of all mapped tables plus jobs/counter after repository mutations, including versions and delivery states. Restored history guards reject deletion. Populated UUID-to-text upgrade and Prisma schema diff pass. `database-evidence.json` records version, source collection hashes/counts and result flags; no source rows/dumps/credentials are published.

## Failures, limitations and preservation

Initial development failures were recorded and fixed rather than presented as passes. Retained lint/native/security logs under `initial-failures/` show type-only import requirements and the rejected attempt to change shared JSON validation. Other targeted development failures included Node strip-only constructor syntax, raw serialization SQLSTATE mapping and FK parity; corrected final executions pass. The shared validator change was fully reverted, preserving the original security fixture/assertions. Baseline tests were not weakened or removed.

Final verifier exits 0 and records unchanged operational JSON and `.env`. Only explicitly created loopback disposable PostgreSQL targets/synthetic snapshots were used. No destructive operational seed/reset, external SMTP, AD provisioning, default store switch or production migration occurred. No PostgreSQL 16 hosted execution, deployed OIDC, external mail delivery, power-loss durability, scale benchmark, production recovery timing or independent approval is claimed. Required hosted jobs remain an external acceptance gate; see [acceptance](DAY3_ACCEPTANCE_2026-11-10.md).
