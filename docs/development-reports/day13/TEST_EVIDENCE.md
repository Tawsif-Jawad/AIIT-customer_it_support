# Day 13 test evidence

Local platform: macOS arm64, Node 26.8.1, pnpm 9.15.0, PostgreSQL 18.6 and Chromium. GitHub verification uses Ubuntu with PostgreSQL 16. Candidate SHA and exact-commit job links are recorded in the draft PR.

| Command | Scope |
|---|---|
| `node --test tests/authenticated-smtp.test.ts tests/synthetic-office.test.ts` with `DB_REQUIRED=true` | Three passed, including auth and TLS failures, outage/recovery, and all application scenarios. |
| `corepack pnpm synthetic:enterprise-demo` | Eight cases passed; 11 accepted local TLS messages. |
| `corepack pnpm synthetic:demo` | Day 12 continuity replay. |
| `corepack pnpm --silent synthetic:directory-manifest` and jq | Six OUs, 129 accounts, three disabled. |
| `bash -n infra/synthetic-enterprise/smoke.sh` and `jq empty infra/synthetic-enterprise/realm.json` | Static validation passed. |
| `corepack pnpm typecheck`, `lint`, `build`, dependency audits, `test`, `test:db`, `test:e2e`, and `test:e2e:postgres` | Final outcomes and totals in the draft PR. |
| `bash infra/synthetic-enterprise/smoke.sh` | Local runtime blocked. Hosted workflow reports exact-head execution. |

The Day 11 [27-case UAT plan](../day11/UAT_TEST_PLAN.md) remains the stakeholder baseline. Automated regressions supply engineering evidence. Stakeholder signoff is still pending.

## Remediation verification

Run `bash infra/synthetic-enterprise/federation.sh` on an authorized Docker-capable Linux runner with the locked Node dependencies, PostgreSQL 16, Chromium and NSS tools. The dedicated workflow installs prerequisites and runs the unskipped integration. PR #18 provides exact-head results. The first remediation run failed before provisioning because its new job had not installed dependencies; the workflow now reuses the repository setup action. Local focused SMTP and host-native office regression passed all three tests. No local Docker runtime is installed.

The complete local replay recorded **193 application, 59 PostgreSQL, 29 JSON Chromium and 22 PostgreSQL Chromium** passes. The JSON suite intentionally skipped the one PostgreSQL-only browser case. The hosted federation job on `a3f92878d574d8d4279fa07d7339484aee1a13a8` passed. Its peer image-scan job failed. See the PR for the final documentation commit and job statuses. [Application verification](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45110000283) · [Federation and image scan](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45110000268)
