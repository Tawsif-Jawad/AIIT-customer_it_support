# Day 2 test plan and executed scope

Run `npm test` on Node 26.8.1. The script explicitly sets test/dev_oidc/mock environment for tests only. Native runtime has no installed third-party dependency requirement. Fixtures use mkdtemp synthetic datasets and cleanup; original operational data is never passed to tests. Existing integration tests also use disposable `.data/test-db-*` files.

1. Reproduce F01/F03/F04/F05 and core invalid-record acceptance before fixes: 5/5 fail, `../development-reports/evidence/day2-before.log`.
2. Existing baseline suite: 24/24 pass. Existing import/browser syntax lint/build checks pass; these do not compile TypeScript or run ESLint.
3. New regressions in tests/day2.test.ts: stale independent snapshot, duplicate IDs, unresolved closure, rationale/replay, logout, 12 parallel creates, injected rename failure and memory rollback, child process writer exclusion, opposing approvals, malformed references/collections, abandoned lease containment, reset rejection, object and CTO authorization, secret-note redaction, disabled accounts/missing auth opt-in, read-only migration preflight.
4. Existing integration tests retain local ticket submission/list/detail, role/SBU denial, IT fallback, IT-to-CTO escalation, CTO resolution/requester confirmation and mock failure behavior.
5. Final full suite: see report/evidence. No coverage percentage measured. No browser E2E/real external integration certification inferred from Node tests.

Remaining: power-loss/crash injection, all role/state pairs, expiry/role revocation integration, all malformed optional fields, duplicate POST idempotency, multi-worker durable recovery and real PostgreSQL/Keycloak/LDAPS/SMTP tests. CI configuration is new and only locally equivalent commands were executed; hosted CI has not run.

Additional executed loopback smoke: web/API proxy pages/health 200, six overlapping HTTP creates, cookie replay after logout 401; see day2-http-smoke.json. No browser visual inspection was performed on Day 2.

## Final Day 2 verification

The final remediation baseline contained 42 passing tests (four previously unexecuted follow-up cases are now executed). The expanded native suite and real Chromium E2E results are recorded in DAY2_FINAL_ACCEPTANCE_2026-11-09.md and evidence/day2-final. Runtime checking now includes actual tsc compilation, ESLint parsing/rules, locked pnpm installation, advisory audit and Prisma schema parity. All automation uses isolated synthetic datasets/loopback servers; tests/database.test.ts always creates its own cluster and ignores external DATABASE_URL. DB_REQUIRED=true prevents silent skip when PostgreSQL binaries are required. Tests cover process termination, partial writes, clean restore, session expiry/revocation, cookie CSRF, role/state matrix and current approved SBU grants. Production integrations/hosted billing remain separate gates.
