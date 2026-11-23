# Day 13 test evidence

Local platform: macOS arm64, Node 26.8.1, pnpm 9.15.0, PostgreSQL 18.6 and Chromium. GitHub verification uses Ubuntu 24.04 with PostgreSQL 16 and Docker Compose. Candidate SHA and exact-commit job links are recorded in draft PR #18.

| Command | Scope | Result |
|---|---|---|
| `npm run typecheck`, `npm run lint`, `npm run build` | TypeScript, ESLint, and module verification | **PASS** (Exit 0) |
| `npm run test:unit`, `npm run test:integration`, `npm run test:security` | Unit (7), integration (9), and security (55) suites | **PASS** (71/71 passed) |
| `npm run test:db` | PostgreSQL migrations, runtime parity, concurrency, and abuse protection | **PASS** (59/59 passed on PostgreSQL 18.6) |
| `npm run test:e2e` and `npm run test:e2e:postgres` | Playwright Chromium E2E in JSON mode (29 passed, 1 skipped) and PostgreSQL+OIDC mode (22 passed) | **PASS** (51/51 active specs passed) |
| `node --test tests/authenticated-smtp.test.ts tests/synthetic-office.test.ts` | Authenticated TLS SMTP, outage recovery, and all 8 synthetic office scenarios | **PASS** (8 scenarios, 11 TLS SMTP messages) |
| `bash -n infra/synthetic-enterprise/smoke.sh`, `federation.sh`, `scan-images.sh` | Shell syntax validation | **PASS** (Exit 0) |

The Day 11 [27-case UAT plan](../day11/UAT_TEST_PLAN.md) remains the stakeholder baseline. Automated regressions supply engineering evidence. Stakeholder signoff is still pending.

---

## Hosted GitHub Actions Verification & Full Directory Restart Recovery

### 1. Root Cause & Fix for Full Directory Container Stop/Start Recovery
In earlier runs ([run 45113936993](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45113936993)), stopping and starting the Samba container (`docker compose stop directory` -> `docker compose start directory`) caused Keycloak authentication to time out even after local `ldapsearch` succeeded inside the restarted container. Investigation identified three interacting causes:
1. **JNDI LDAP Connection Pooling (`connectionPooling`):** Keycloak's `LDAPStorageProvider` defaults to pooling LDAPS connections when `connectionPooling` is omitted. After `docker compose stop directory` tears down the container network namespace and TCP sockets, stale pooled connections in the JVM fail or stall on reuse.
2. **JVM DNS Caching:** When a container is stopped and started on a Docker bridge, any cached positive/negative hostname resolution in the JVM can delay reconnection.
3. **AIIT OIDC Login Rate-Limit Budget (`OIDC_LOGIN_RATE_LIMIT = 12` per IP per 300s):** `apps/api/src/abuse-control.ts` enforces a strict 12-request limit on `/api/auth/oidc/login` per client IP per 5-minute window. Across the federation run, 11 `/api/auth/oidc/login` requests were already consumed by negative login checks (3), the four scenario actors (4), the existing session setup (1), the disabled-account check (1), the re-enabled check (1), and the paused-directory outage check (1), leaving exactly **1** `/api/auth/oidc/login` request remaining in the 12-request budget.

**Implemented Solution (Verified on Commit `df217e31f1c673be5f910164dd3fa92c77a230b1`):**
- Explicitly set `connectionPooling: ["false"]` in the `synthetic-samba` LDAP storage provider configuration in `infra/synthetic-enterprise/federation.sh`.
- Set `JAVA_OPTS_APPEND: -Dsun.net.inetaddr.ttl=0 -Dsun.net.inetaddr.negative.ttl=0` on the `issuer` (Keycloak) container in `infra/synthetic-enterprise/federation.compose.yml`.
- Updated `scripts/synthetic/federated-scenarios.ts` to test **both** outage modes while respecting the unchanged 12-request application rate limit:
  1. **Unresponsive Directory (`docker compose pause directory` / `unpause directory`):** Verifies login rejection during pause, existing AIIT session (`200`) and UserInfo behavior (`401`), and bounded LDAPS readiness after unpause.
  2. **Full Container Stop/Start (`docker compose stop directory` / `start directory`):** Stops the Samba container completely, verifies provider authentication rejection at Keycloak while stopped, checks existing AIIT session and UserInfo status, starts the Samba container (`docker compose start directory`), polls bounded trusted LDAPS readiness (`waitForDirectoryLdaps('restart')`, 25s max budget), and completes a full end-to-end AIIT browser login (`login(actorEmails[0])`) on the first attempt without altering the application's 12-request rate limit.

### 2. Hosted CI Evidence on Commit `df217e31f1c673be5f910164dd3fa92c77a230b1`

- **Application Verification Workflow (`verify.yml` — [Run 45121964870](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45121964870)):**
  - `quality`: **SUCCESS** ([Job 137517549867](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45121964870/job/137517549867))
  - `tests`: **SUCCESS** ([Job 137517549748](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45121964870/job/137517549748))
  - `browser`: **SUCCESS** ([Job 137517549755](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45121964870/job/137517549755))
  - `database`: **SUCCESS** ([Job 137517549497](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45121964870/job/137517549497))
- **Synthetic Enterprise Infrastructure Workflow (`synthetic-enterprise.yml` — [Run 45121964849](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45121964849)):**
  - `keycloak-smoke`: **SUCCESS** ([Job 137517549779](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45121964849/job/137517549779))
  - `samba-ldaps`: **SUCCESS** ([Job 137518124409](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45121964849/job/137518124409) — verified scanned minimized Samba image ID, 6 OUs, 129 users, 3 disabled accounts, LDAPS negative checks, IPv4/IPv6/DNS isolation probes, 129-user Keycloak sync, all 8 federated scenarios, 11 TLS SMTP messages, account disablement lifecycle, `pause`/`unpause` outage, **full `stop`/`start` directory restart recovery**, and complete Compose teardown)
  - `image-scan`: **FAILURE** ([Job 137517549759](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45121964849/job/137517549759) — Grype `--fail-on high` gate failed honestly with 1 Critical / 5 High on Keycloak and 5 Critical / 139 High on Samba; SBOM and JSON evidence uploaded)
  - `samba-bookworm-candidate`: **FAILURE** ([Job 137517549651](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45121964849/job/137517549651) — rejected Debian Bookworm LTS candidate comparison uploaded)
