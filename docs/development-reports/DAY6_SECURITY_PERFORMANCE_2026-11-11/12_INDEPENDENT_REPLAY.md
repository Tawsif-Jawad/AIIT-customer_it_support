# Independent verification and hosted replay

Antigravity should start from the current draft SHA, record its environment and create disposable PostgreSQL resources. Keep the operational files and existing processes outside the fixture. Capture actual exit codes and independent observations.

1. Use Node 26.8.1 and PostgreSQL tools in PATH or `PG_BINDIR`. Install Playwright Chromium using the pinned pnpm toolchain.
2. Run `node scripts/verify-local.ts --output /path/to/new/evidence-dir`. The runner executes the ten exact pinned commands with `DB_REQUIRED=true`.
3. Run `npm exec --yes --package=pnpm@9.15.0 -- pnpm test:e2e:postgres`. Verify the selected browser cases use PostgreSQL.
4. Replay `tests/ingress-security.test.ts`, `tests/postgres-abuse.test.ts` and `tests/postgres-runtime.test.ts` using Node's test runner and `DB_REQUIRED=true`. Confirm shared limits, an OIDC flow crossing processes, replay denial, session audit rollback, cross-SBU denial, database recovery and worker SIGKILL/lease recovery.
5. Run `node scripts/benchmark-postgres.ts` and compare plans, p50/p95/p99, connection counts and create conflicts across scales. Record fixture size and hardware.

After GitHub clears the billing lock, open the existing **Day 2 verification** workflow for the draft head and rerun all jobs. The workflow can also be dispatched against the Day 6 branch. Verify quality, tests, database and browser jobs on the exact SHA. Execute the supplemental PostgreSQL browser and performance procedures separately and attach the independent record.
