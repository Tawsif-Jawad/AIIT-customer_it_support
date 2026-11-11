# Security and regression verification

Verified source `80cac9b0bff9b6243f36056a74cb7eb0ce2bd7e7` on Node 26.8.1 and pnpm 9.15.0. Every command below used `npm exec --yes --package=pnpm@9.15.0 -- pnpm`. The database selection required disposable PostgreSQL tools. [Exact commands and exits](evidence/mandatory-commands.json)

| Pinned pnpm command | Exit | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| `install --frozen-lockfile --ignore-scripts` | 0 | — | — | — |
| `db:generate` | 0 | — | — | — |
| `typecheck` | 0 | — | — | — |
| `lint` | 0 | — | — | — |
| `build` | 0 | — | — | — |
| `test` | 0 | 167 | 0 | 0 |
| `test:security` | 0 | 49 | 0 | 0 |
| `test:db` | 0 | 53 | 0 | 0 |
| `test:e2e` | 0 | 22 | 0 | 0 |
| `audit --audit-level=moderate` | 0 | — | — | — |

The supplemental PostgreSQL Chromium command exited 0 with 15 passed, zero failures and zero skips. The benchmark exited 0 at all three dataset sizes. Security and database selections overlap the native suite. [PostgreSQL browser output](evidence/postgres-browser.txt) · [Security and recovery results](evidence/security-and-recovery.txt)

Tests exercised spoofed proxy headers, wrong or absent hop credentials, cross-process concurrent budgets, OIDC initiation and callback throttling, controlled provider timeout, PKCE/state/nonce replay, session revocation and expiry, login-audit rollback, cross-SBU scope, PostgreSQL rollback and restart, worker SIGKILL and lease recovery, backup/restore, and paired JSON/PostgreSQL workflows. Prisma generated successfully, seven migrations applied on disposable PostgreSQL and the schema diff was empty. [Database evidence](evidence/migration-recovery.json)
