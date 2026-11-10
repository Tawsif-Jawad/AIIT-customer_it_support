> Final remediation update (2026-11-10): implementation `9908a66` passes all ten local commands: 102 native / 25 overlapping security / 28 overlapping DB / 17 browser. See the final remediation section below for current results, the live-data preservation qualification, open JSON route conflict and blocked hosted/review gates. Earlier results are retained historical snapshots.

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

Fresh hosted observation: [PR #4 run 42755426743](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42755426743) at `11478bb` failed all four jobs with no executed steps; each check annotation explicitly states the account is locked due to a billing issue. [Recorded annotations](evidence/day3/hosted-ci.json). These are not executed test failures and do not change local counts. No hosted pass is claimed.

## Final remediation verification — 10 November 2026

Current tested source: **`9908a66bfa53673f6c2bf547d287575840e87d62`** on the same branch/PR #4. Historical results above are preserved. The final verifier command was `node scripts/verify-local.ts --output /tmp/aiit-day3-remediation-final`; every child uses the required `npm exec --yes --package=pnpm@9.15.0 -- pnpm` prefix, Node 26.8.1, mock transports and required disposable PostgreSQL.

| Mandatory command | Exit | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| `install --frozen-lockfile --ignore-scripts` | 0 | — | — | — |
| `db:generate` | 0 | — | — | — |
| `typecheck` | 0 | — | — | — |
| `lint` | 0 | — | — | — |
| `build` | 0 | — | — | — |
| `test` | 0 | 102 | 0 | 0 |
| `test:security` | 0 | 25 | 0 | 0 |
| `test:db` | 0 | 28 | 0 | 0 |
| `test:e2e` | 0 | 17 | 0 | 0 |
| `audit --audit-level=moderate` | 0 | — | — | — |

Verifier exit **0**. Counts increased from 82 to 102 native and 11 to 28 DB: **17 added DB subtests plus 3 JSON API tests**. DB/security counts overlap the native total; browser cases are separate. The dedicated security command remains 25; added database authorization negatives are counted in DB/native coverage. No failing assertions were weakened and no tests were skipped.

New DB tests verify IT/CTO escalation with CRITICAL severity, trimmed/redacted reason, exact minimum length, missing/blank/short rejection, requester/cross-resource/invalid-state denial, concurrent version conflicts, preserved CTO review, IT/CTO approval and rejection, current-role revocation, missing rationale/invalid decisions, Approval-resource attribution, complete/redacted event/audit metadata, one-time replay denial, opposing decisions, late-failure rollback of all affected records and lease expiration during a real independent-client row-lock wait. Three API regressions verify the unchanged dedicated JSON escalation/approval contracts and role restrictions using temporary files.

The pre-fix DB regression run failed as expected (27 total, 16 pass/11 fail including parent), proving the reported defects and the additional lease bug. `regressions-before-fix.log` preserves assertions. Intermediate clock-edit and initial invalid-state JSON-fixture failures are also retained; both were corrected before final verification. They are not final test results.

All existing DB verification remains active: three unchanged migrations, prefixed IDs/FKs, concurrent numbering/comments/updates/approvals, append-only history, outbox retry/reclaim/fencing, idempotent/concurrent imports, fourteen-collection canonical manifests, late import conflict rollback, populated UUID upgrade, zero Prisma diff, imported-source restore and exact post-mutation full-table restore. PostgreSQL 18.6 is proven locally; hosted PostgreSQL 16 execution is not claimed.

Live localhost `/` and `/app` returned 200 and their landing/sign-in screens were inspected in the browser without authentication or business writes. Employee/customer/IT/CTO, custody, notification/audit and session/logout behaviors pass the isolated 17-case Chromium suite. They are not presented as authenticated mutations against the operational server.

**Preservation qualification:** `.env` matches task start, and the final full-verification interval preserved both operational JSON and configuration. The task-wide JSON hash changed earlier while live login activity was observed; it is not reported unchanged. No raw source snapshot was retained, so hashes cannot prove a complete business-record diff or attribute every outside modification. No live data was reset/restored. See `task-preservation.json` and `live-observation.json`.

**Remaining conflict:** an isolated API probe confirmed the pre-existing generic JSON `/transition` escalation bypass (short notes accepted, MEDIUM severity retained). The dedicated endpoint and remediated repository follow the requested contract. The operational API remains unchanged under the preservation instruction; the conflict is documented for owner follow-up, not hidden by a skipped test or claimed universal parity.

Fresh hosted run [42760455464](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42760455464) at `9908a66` has four pre-execution failures. All four annotations explicitly report the account billing lock. Independent review is outstanding; the requested reviewer is the PR author and cannot supply independent approval. This is LOCAL ENGINEERING PASS for the fixes/checks, with overall/formal gates and the task-wide preservation qualification still explicit.

Current evidence: [summary/exits](evidence/day3/remediation/summary.json), [database manifest](evidence/day3/remediation/database-evidence.json), [hosted diagnostics](evidence/day3/remediation/hosted-ci.json), [preservation](evidence/day3/remediation/task-preservation.json), [known JSON conflict](evidence/day3/remediation/json-policy-conflict.json). Safe raw logs are adjacent; original evidence is untouched.
