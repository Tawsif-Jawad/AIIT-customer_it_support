# Day 11 test evidence

Local runtime is Node 26.8.1, pnpm 9.15.0 and disposable PostgreSQL 18.6. Hosted database CI uses PostgreSQL 16. Local commands used the worktree's frozen dependencies.

| Command | Observed result |
|---|---|
| `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm build` | Passed |
| `corepack pnpm audit --audit-level=moderate` and `corepack pnpm audit --prod --audit-level=moderate` | Passed, no known vulnerabilities reported |
| `DB_REQUIRED=true corepack pnpm test` | 190 passed, 0 failed, 0 skipped |
| `DB_REQUIRED=true corepack pnpm test:db` | 59 passed, 0 failed, 0 skipped |
| `corepack pnpm test:e2e` | 29 passed |
| `corepack pnpm test:e2e:postgres` | 21 passed |

Set `PG_BINDIR` to the matching owned PostgreSQL binaries for local database tests. An early approval test mutated a stale in-memory fixture reference. The fixture was corrected and the full suite then passed. Hosted outcomes for the submitted commit are recorded on the Day 11 draft PR.
