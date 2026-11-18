# Regression verification

Every pnpm command below used `npm exec --yes --package=pnpm@9.15.0 -- pnpm`. The pinned verifier sets `NODE_ENV=test AUTH_MODE=dev_oidc MAIL_PROVIDER=mock DB_REQUIRED=true` with a non-operational database URL. Fixtures create and destroy local clusters and mock issuer/worker integrations.

| Command after pnpm prefix | Exit | Pass | Fail | Skip |
| --- | ---: | ---: | ---: | ---: |
| `install --frozen-lockfile --ignore-scripts` | 0 | — | — | — |
| `db:generate` | 0 | — | — | — |
| `typecheck` | 0 | — | — | — |
| `lint` | 0 | — | — | — |
| `build` | 0 | — | — | — |
| `test` | 0 | 171 | 0 | 0 |
| `test:security` | 0 | 50 | 0 | 0 |
| `test:db` | 0 | 56 | 0 | 0 |
| `test:e2e` | 0 | 23 | 0 | 0 |
| `audit --audit-level=moderate` | 1 | — | — | — |
| `test:e2e:postgres` | 0 | 16 | 0 | 0 |
| `audit --prod --audit-level=moderate` | 0 | — | — | — |

Test suites overlap. The registry audit reports two high findings for one Picomatch ReDoS advisory in development dependency paths. The registry returned 4.0.7 as latest, and the full audit response lists no patched version. The production-only audit reported no known vulnerabilities. Retain the full audit gate until a verified fix or reviewed dependency replacement is available. [Advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) · [Upstream release discussion](https://github.com/micromatch/picomatch/issues/247)

An earlier test run failed because a historical parity assertion required raw JSON descriptions. The updated assertion verifies the shared redacted contract. An earlier PostgreSQL Chromium run exposed that the portal could render the previous ticket's form while awaiting the new ticket. The portal now clears the old detail on selection, and browser coverage waits for the exact ticket before using its controls. Final Chromium passed against PostgreSQL.

The native database suite verifies populated migration/import/restore, rollback with failed outbox inserts, process and connectivity recovery, competing approval/escalation operations, numbering, JSON/PostgreSQL parity, and worker SIGKILL lease recovery. The security and browser suites verify ingress, TLS ownership, CSP, OIDC timeout/replay, scoped workflows and portal functionality.

[Machine-readable verifier results](evidence/summary.json) · [PostgreSQL Chromium log](evidence/postgres-browser.log) · [Baseline failed concurrency regression](evidence/concurrency-red.log)
