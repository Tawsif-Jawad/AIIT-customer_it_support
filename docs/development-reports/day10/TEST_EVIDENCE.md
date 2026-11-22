# Test and CI evidence

Local checkout used Node 26.8.1, pnpm 9.15.0, Chromium and PostgreSQL 18.6 on macOS. Hosted workflow uses PostgreSQL 16 on Ubuntu. PostgreSQL tests used `DB_REQUIRED=true` and the explicitly selected local binary directory. All database fixtures owned their loopback listener and test data.

| Job | Commands | Observed result |
|---|---|---|
| Setup | `corepack pnpm install --frozen-lockfile --ignore-scripts`, `corepack pnpm db:generate` | Passed. |
| Quality | `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm build`, `corepack pnpm audit --audit-level=moderate`, `corepack pnpm audit --prod --audit-level=moderate` | All passed after the API fixes. Both advisory audits reported no known vulnerabilities. |
| Tests | `corepack pnpm test:unit`, `corepack pnpm test:integration`, `corepack pnpm test:security` | 7, 9 and 55 passed respectively. |
| Tests, additional CI set | `NODE_ENV=test AUTH_MODE=dev_oidc MAIL_PROVIDER=mock node --test tests/integrity.test.ts tests/recovery.test.ts tests/ui.test.ts tests/audit.test.ts` | 30 passed. |
| Full suite | `DB_REQUIRED=true corepack pnpm test` | 188 passed after fixes, including controlled TLS staging, restore and synthetic role acceptance. |
| Database | `DB_REQUIRED=true corepack pnpm test:db` | 57 passed after fixes. |
| Focused regression | `NODE_ENV=test AUTH_MODE=dev_oidc MAIL_PROVIDER=mock node --test tests/functional-completion.test.ts` | 6 passed. The first test iteration compared timestamped error payloads and was corrected to compare the stable fields. |
| Browser | `corepack pnpm exec playwright install chromium`, `corepack pnpm test:e2e`, `corepack pnpm test:e2e:postgres` | 29 JSON-backed and 21 PostgreSQL-backed cases passed in the initial run. Use hosted checks for exact commit attribution. |

Exact Day 9 baseline evidence: [PR #13 pull-request run](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/44888326778) and [push run](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/44888322326). The Day 10 pull-request description or checks view supplies exact-candidate evidence after submission. Keep hosted results tied to a specific SHA.
