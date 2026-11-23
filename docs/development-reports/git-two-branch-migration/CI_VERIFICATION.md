# AIIT — Application & CI Verification Report (`development` Branch)

**Verification Date:** 2026-11-23  
**Verified Branch:** `development` (tracking `origin/development`)  
**Source Commit Verified:** `2ff77f25a9ace9d296f8509f692dc853eb08c697`  
**Day 13 Engineering Status:** **PARTIAL** (Container image vulnerability scan failing; do not claim PASS)  
**Production Release Status:** **NO-GO**

---

## 1. Content & Feature Preservation Verification

Comparing `development` at creation (`2ff77f25a9ace9d296f8509f692dc853eb08c697`) against `origin/codex/day13-synthetic-enterprise-integration` (`2ff77f25a9ace9d296f8509f692dc853eb08c697`):
- `git diff development origin/codex/day13-synthetic-enterprise-integration` -> **0 differences** (exact commit match).
- All 119 commits ahead of `main` (`b6fae621ad52d3fc6b633ad923db6df1a8de1fb8`) across Days 1–13 are preserved in `development`:
  - PostgreSQL transactional store, Prisma migrations, and durable outbox worker (`apps/api/src/postgres-*.ts`, `apps/api/prisma/`)
  - Employee, Customer, IT Administrator, and CTO dashboards (`apps/web/src/server.ts`, `apps/web/src/landing.ts`)
  - AI ticket triage, redaction, and escalation workflow (`apps/api/src/ticket-workflow.ts`, `packages/connectors/`)
  - Approval workflow, asset custody management, SLA breach monitoring, and notification delivery (`apps/api/src/app.ts`, `apps/api/src/functional-extension.ts`)
  - Day 12 full synthetic enterprise office environment (`scripts/synthetic/`, `tests/synthetic-office.test.ts`)
  - Day 13 Samba AD/LDAPS integration, Keycloak OIDC federation, and authenticated TLS SMTP (`infra/synthetic-enterprise/`, `tests/authenticated-smtp.test.ts`)
  - All historical development reports (`docs/development-reports/`)

---

## 2. Local Verification Execution Results on `development` (`2ff77f25a9ace9d296f8509f692dc853eb08c697`)

All required local checks were executed directly on the `development` checkout:

| Check / Suite | Command | Result | Details / Counts |
|---|---|---|---|
| **TypeScript Typecheck** | `npm run typecheck` (`tsc --noEmit`) | **PASS** (Exit 0) | Zero type errors across monorepo |
| **ESLint** | `npm run lint` (`eslint apps packages scripts tests playwright.config.ts`) | **PASS** (Exit 0) | Zero lint errors or warnings |
| **Build & Module Verification** | `npm run build` (`npm run typecheck && node scripts/verify-types.ts`) | **PASS** (Exit 0) | `MONOREPO_BUILD_AND_MODULE_VERIFICATION`: `@it-support/shared`, `@it-support/connectors`, `@it-support/api`, `@it-support/web` verified |
| **Unit Tests** | `npm run test:unit` | **PASS** (Exit 0) | **7 passed**, 0 failed (`tests/unit.test.ts`) |
| **Integration Tests** | `npm run test:integration` | **PASS** (Exit 0) | **9 passed**, 0 failed (`tests/integration.test.ts`) |
| **Security Tests** | `npm run test:security` | **PASS** (Exit 0) | **55 passed**, 0 failed (`day2.test.ts`, `security.test.ts`, `oidc-security.test.ts`, `ingress-security.test.ts`, `isolation.test.ts`) |
| **PostgreSQL Database Tests** | `npm run test:db` | **PASS** (Exit 0) | **59 passed**, 0 failed across disposable PostgreSQL 18.6 cluster (`database.test.ts`, `postgres-runtime.test.ts`, `postgres-abuse.test.ts`) |
| **Synthetic Office, Authenticated SMTP & Core Functional Tests** | `node --test tests/synthetic-office.test.ts tests/authenticated-smtp.test.ts tests/functional-completion.test.ts tests/audit.test.ts tests/recovery.test.ts tests/ui.test.ts` | **PASS** (Exit 0) | All 8 synthetic office scenarios (`SBU-TECH`..`SBU-CORP`, 129 users, 240 tickets, 180 assets, 40 approvals, 11 TLS SMTP messages), authenticated TLS SMTP outage recovery, SLA/asset/approval completion, audit, recovery, and UI tests passed.<br>*(Note: `tests/integrity.test.ts` line 60 invokes `scripts/verify-local.ts`, which intentionally throws `ISOLATED_VERIFICATION_CHECKOUT_REQUIRED` when untracked `.env` or `.data/enterprise-db.json` exists in the primary workspace so local user files are never touched; its other 4 integrity tests pass, and the full `tests/integrity.test.ts` suite passes in clean CI checkouts.)* |
| **Playwright Browser E2E Tests** | `npm run test:e2e` | **PASS** (Exit 0) | **29 passed**, 1 skipped (PostgreSQL-only spec skipped in JSON mode), 0 failed (`30.8s`) |
| **Playwright PostgreSQL + OIDC E2E Tests** | `npm run test:e2e:postgres` | **PASS** (Exit 0) | **22 passed**, 0 failed (`1.1m`) across `audit.spec.ts` and `oidc.spec.ts` against disposable PostgreSQL + OIDC |

---

## 3. Hosted GitHub Actions CI Results for `2ff77f25a9ace9d296f8509f692dc853eb08c697`

### A. Push to `origin/development` — Workflow `Day 2 verification` (`.github/workflows/verify.yml`)
**Run ID:** `45118626789` (Triggered automatically by pushing `development` at `2ff77f25a9ace9d296f8509f692dc853eb08c697`)

| Job Name | Status | Conclusion | Started At (UTC) | Completed At (UTC) | Run URL |
|---|---|---|---|---|---|
| `quality` | `completed` | **SUCCESS** | `2026-11-23T05:34:29Z` | `2026-11-23T05:35:01Z` | [Job 137507075841](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45118626789/job/137507075841) |
| `tests` | `completed` | **SUCCESS** | `2026-11-23T05:34:29Z` | `2026-11-23T05:34:58Z` | [Job 137507075832](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45118626789/job/137507075832) |
| `browser` | `completed` | **SUCCESS** | `2026-11-23T05:34:30Z` | `2026-11-23T05:36:00Z` | [Job 137507075908](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45118626789/job/137507075908) |
| `database` | `completed` | **SUCCESS** | `2026-11-23T05:34:29Z` | `2026-11-23T05:36:53Z` | [Job 137507075669](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45118626789/job/137507075669) |

### B. Synthetic Enterprise Infrastructure Workflow (`.github/workflows/synthetic-enterprise.yml`) on `2ff77f25a9ace9d296f8509f692dc853eb08c697`
**Run ID:** `45114453012` (Executed on PR #18 for the exact commit `2ff77f25a9ace9d296f8509f692dc853eb08c697`)

| Job Name | Status | Conclusion | Started At (UTC) | Completed At (UTC) | Run URL |
|---|---|---|---|---|---|
| `keycloak-smoke` | `completed` | **SUCCESS** | `2026-11-23T04:53:14Z` | `2026-11-23T04:53:52Z` | [Job 137493962935](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45114453012/job/137493962935) |
| `samba-ldaps` | `completed` | **SUCCESS** | `2026-11-23T04:55:01Z` | `2026-11-23T04:57:24Z` | [Job 137494496049](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45114453012/job/137494496049) |
| `image-scan` | `completed` | **FAILURE** | `2026-11-23T04:53:14Z` | `2026-11-23T04:54:59Z` | [Job 137493962973](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45114453012/job/137493962973) |
| `samba-bookworm-candidate` | `completed` | **FAILURE** | `2026-11-23T04:53:13Z` | `2026-11-23T04:54:26Z` | [Job 137493962800](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45114453012/job/137493962800) |

---

## 4. Day 13 Security Gate Visibility & Engineering Verdict

Per strict governance rules:
1. **Container Image Vulnerability Scan Failure Remains Visible:** The Grype container image scan (`infra/synthetic-enterprise/scan-images.sh`) in `image-scan` and `samba-bookworm-candidate` fails on high/critical vulnerabilities in the synthetic Samba container base image.
2. **No Threshold Suppression:** The Grype failure threshold was **not** weakened or suppressed during this migration.
3. **Engineering Verdict:** Day 13 engineering status remains **PARTIAL** until its container security acceptance gates pass.
4. **Release Verdict:** Production status remains **NO-GO**. `development` must **not** be merged into `main` until all blocking security findings, independent review, and operational gates are closed.
