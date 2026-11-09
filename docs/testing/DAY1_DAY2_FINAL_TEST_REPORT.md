# Day 1 / Day 2 final test report

2026-11-09; local development verification. Node 26.8.1, pnpm 9.15.0 invoked via npm exec; local PostgreSQL 18.6; Chromium via repository Playwright. All test data disposable. Runtime is JSON, not PostgreSQL.

| Actual command | Exit | Parsed counts |
|---|---|---|
| `npm exec --yes --package=pnpm@9.15.0 -- pnpm install --frozen-lockfile --ignore-scripts` | 0 | {} |
| `npm exec --yes --package=pnpm@9.15.0 -- pnpm db:generate` | 0 | {} |
| `npm exec --yes --package=pnpm@9.15.0 -- pnpm typecheck` | 0 | {} |
| `npm exec --yes --package=pnpm@9.15.0 -- pnpm lint` | 0 | {} |
| `npm exec --yes --package=pnpm@9.15.0 -- pnpm build` | 0 | {} |
| `npm exec --yes --package=pnpm@9.15.0 -- pnpm test` | 0 | {"tests": 72, "pass": 72, "fail": 0, "skipped": 0} |
| `npm exec --yes --package=pnpm@9.15.0 -- pnpm test:security` | 0 | {"tests": 25, "pass": 25, "fail": 0, "skipped": 0} |
| `npm exec --yes --package=pnpm@9.15.0 -- pnpm test:db` | 0 | {"tests": 1, "pass": 1, "fail": 0, "skipped": 0} |
| `npm exec --yes --package=pnpm@9.15.0 -- pnpm test:e2e` | 0 | {"pass": 17, "fail": 0, "skipped": 0, "tests": 17} |
| `npm exec --yes --package=pnpm@9.15.0 -- pnpm audit --audit-level=moderate` | 0 | {} |

Native: 72 passed, 0 failed/skipped. Security 25 and database 1 are subset/repeated executions, not extra unique tests. Browser: 17 passed, 0 failed/skipped (5 original + 12 audit cases). Final full verifier evidence: ../audits/evidence/day1-day2/verification/summary.json and numbered logs. A subsequent browser rerun with additional CTO queue/customer empty-state assertions also passed 17/17; browser-audit.log.

## Behavioral coverage

17 added native cases exercise 22 discovered API operations and global OPTIONS through existing and audit suites, including unauthenticated access, role/SBU/ownership denials, malformed/missing resources, immutable actor identity, pagination/filtering, closure/reopen, exceptional transitions, comments/internal notes, approvals/replay, notification scoping/retry, asset custody/idempotency, rate limiting/recovery, mock connector guards and production fail-closed behavior. The feature inventory maps individual coverage; this is not every possible payload/concurrency permutation.

Browser: all four interactive roles, session restore, ticket creation/confirmation/rejection, IT approval/internal notes/escalation, CTO queue/resolution/audit, asset acknowledgment, catalog, KB, notifications, search/filter/paging, assistant, logout failure/retry, stale-response race, form requirements, keyboard activation/menu Escape/focus, and widths 320/390/768/1440. Screenshots use seeded fixtures. Observations capture page errors and failed HTTP requests; expected initial unauthenticated /me 401 and deliberately injected 503 are not unexplained failures. No JS page errors in these cases. Contrast samples: greeting 14.2198, context 4.86868, quick-create 5.4001; this is not full WCAG certification.

## Startup, persistence and fault evidence

clean-startup.json / clean-startup.mjs: clean temporary source copy excluding operational data, .env and Git credentials; offline frozen install, Prisma generation, compilation, actual API/web entrypoints, eight routes 200, login 200, SIGTERM/restart with same disposable data and session restored 200. Final verifier additionally ran lint/build and all suites in the checkout.

Existing integrity/recovery/security tests plus audit tests exercise validated relationships and duplicate IDs, leases/concurrent requests, rollback/conflicts, corrupt input, atomic persistence, session/approval restart behavior and fixture backup/restore. Disposable PostgreSQL migration/import/restore test passes with TEXT IDs. No operational migration occurred; manual recovery is not certified automatic power-loss recovery. Real broker/SMTP/LLM/AD/IdP and internet-facing deployment remain unverified or absent.

Before/after failures: defects-before.log (6 failures), cookie-before.log (1), notification-scope-before.log (1), browser-defects-before.log (2). Initial harness failures are explicitly separate. AU07 source-level simulation correction is verified by final assertions. Faults include transport failure/exception, backend 503, delayed browser response and unavailable mock dependencies.

Performance: 100 synthetic injected sequential reads; replacements100→0, median5.048625→0.439209ms, p956.595875→0.865750ms. One local paired sample; no load/soak guarantee.

Operational/configuration hashes match before/after in summary.json. Hosted GitHub checks are BLOCKED by account billing; local passes do not satisfy protected hosted checks. CircleCI is not connected. No real infrastructure writes, bypass, merge or history rewrite.

Audit-branch hosted run42610675825: quality/tests/database/browser each failed with zero steps and explicit account billing-lock annotation; see hosted-audit-run.json. These are infrastructure-blocked jobs, not executed application test failures.
