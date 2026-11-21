# Test execution

Verified source `389f8c023f3bcfa97649fdf2c79c9fa23c098e7d` used Node 26.8.1, pnpm 9.15.0 and required disposable PostgreSQL. Each row used `npm exec --yes --package=pnpm@9.15.0 -- pnpm`. [Exact commands, exits and excerpts](evidence/mandatory-commands.json)

| Pinned command after pnpm | Exit | Passing tests | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| `install --frozen-lockfile --ignore-scripts` | 0 | — | — | — |
| `db:generate` | 0 | — | — | — |
| `typecheck` | 0 | — | — | — |
| `lint` | 0 | — | — | — |
| `build` | 0 | — | — | — |
| `test` | 0 | 162 | 0 | 0 |
| `test:security` | 0 | 46 | 0 | 0 |
| `test:db` | 0 | 51 | 0 | 0 |
| `test:e2e` | 0 | 22 | 0 | 0 |
| `audit --audit-level=moderate` | 0 | — | — | — |

The supplemental `test:e2e:postgres` command exited 0 with 15 passed, zero failed and zero skipped. Security and database selections overlap the native suite. [PostgreSQL browser transcript](evidence/postgres-browser.txt)

| Suite | Milestone 1 | Day 5 |
| --- | ---: | ---: |
| Native Node | 151 | 162 |
| Security selection | 46 | 46 |
| PostgreSQL selection | 40 | 51 |
| Default browser suite | 22 | 22 |
| PostgreSQL browser suite | — | 15 |

Intermediate runs exposed a stale Prisma pool after a database restart and test harness issues during implementation. The final run covers the committed pool recovery and all new tests. No final tests failed or were skipped.

GitHub Actions reported a separate billing failure on the initial draft revision. The four jobs had no executed steps. [Hosted annotation evidence](evidence/hosted-initial.json)
