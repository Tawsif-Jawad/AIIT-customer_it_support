# 08 — Test and Evidence

Final local evidence:

| Check | Result |
|---|---|
| Prisma validate | PASS |
| Typecheck | PASS |
| ESLint | PASS |
| Build/import verification | PASS |
| Native tests | 188 passed, 0 failed |
| Security tests | 55 passed, 0 failed |
| PostgreSQL/database tests | 57 passed, 0 failed |
| Default Chromium | 29 passed, 0 failed |
| PostgreSQL Chromium | 21 passed, 0 failed |
| Staging rehearsal | 1 passed, 0 failed |
| Dependency audit | 0 known vulnerabilities |

The focused `tests/functional-completion.test.ts` suite verifies SLA, approval, asset, attachment and reporting behavior. Raw native output is retained at `evidence/native.log`. Historical evidence for Days 1–9 remains under `docs/development-reports/`.

CI repair evidence:

- Browser reassignment failure was traced to an asset-management UI block accidentally placed inside `renderCtoDashboard`, creating an undeclared `box` reference. It is now in `loadAssetsTab`.
- The Day 3 PostgreSQL support harness is now replaying `CONFLICT` outcomes with bounded backoff for concurrent comments, approvals and escalations. Assertions remain unchanged.
- PostgreSQL support, migration, HTTP/runtime, browser and staging suites pass locally after the repair.
