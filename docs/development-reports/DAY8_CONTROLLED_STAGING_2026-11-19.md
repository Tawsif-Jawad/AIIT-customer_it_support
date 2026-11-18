# Day 8 controlled staging rehearsal

## Scope and source

Day 8 is on `codex/day8-controlled-staging-rehearsal`, based on verified Day 7 commit `25d97a93252bfd36810cd15e320e1fb1494b4b29`. The draft stack targets the Day 7 branch. The original Day 6 checkout and review locks were preserved as recorded in the [Day 7 remediation report](DAY7_REVIEW_REMEDIATION_2026-11-18.md).

The loopback rehearsal ran on 18 November 2026. External staging is prepared only. The rehearsal uses the existing native API, portal, PostgreSQL repository, and notification worker.

## Reproduce the private rehearsal

Use Node.js 26.8.1, pnpm 9.15.0, OpenSSL with `req -addext`, and local PostgreSQL binaries including `initdb`, `pg_ctl`, `createdb`, `pg_dump` and `pg_restore`. Use a clean checkout without an office environment file. Run as a user allowed to initialize disposable PostgreSQL.

```bash
pnpm install --frozen-lockfile
pnpm db:generate
export PG_BINDIR="$(pg_config --bindir)"
pnpm test:staging
```

The command requires disposable PostgreSQL. It initializes a new temporary cluster, applies migrations, imports synthetic fixtures, and allocates loopback ports. It creates short-lived certificates and separate ingress secrets, starts the services below, and tears them down after the exercise.

| Component | Rehearsal configuration |
| --- | --- |
| TLS edge | Loopback HTTPS, verified certificate and HSTS. Replaces forwarding and ingress-token headers from the client. |
| Portal | Loopback Node listener. Trusts its loopback peer through `WEB_TRUSTED_PROXY_IPS` and `WEB_PROXY_TOKEN`. Uses a distinct `WEB_API_PROXY_TOKEN` for the next hop. |
| API | Real loopback API process. Uses `NODE_ENV=test`, `STORAGE_MODE=postgres`, disposable database URL, and exact `API_PUBLIC_ORIGIN` and `APP_PUBLIC_URL`. `/api/live` checks liveness and `/api/ready` checks database readiness. |
| Issuer | Controlled RS256 fixture, with authorization code, PKCE and browser-bound state and nonce. HTTP is permitted only for the test issuer on loopback. Application cookies are issued through HTTPS. |
| Worker and mail | Test-only worker opt-in using `AIIT_REHEARSAL_SMTP_PORT` and `AIIT_REHEARSAL_SMTP_CA`. Requires the disposable database shape and connects only to loopback with implicit TLS, certificate verification and one synthetic `@example.test` recipient. The sink retains messages in memory. |
| Logs | Existing structured API and worker events plus aggregate recovery timings and counts. SMTP failures surface generic codes. |

## Identity, email, and recovery results

- **OIDC and role access.** Verified signed callback and PKCE through TLS ingress. Exercised local role and SBU mapping for CUSTOMER, EMPLOYEE, IT_ADMIN and CTO despite competing provider claims. Disabled accounts, interactive SYSTEM_SERVICE login, invalid signature, foreign Origin and invalid CSRF were rejected. Logout and session expiration revoked access. Native and browser suites exercise the broader role workflows.
- **SMTP and privacy.** Rejected external, multiple and header-injected recipients, an unrelated trust anchor and non-test adapter use. The sink returned a synthetic SMTP 451 after DATA. The job stayed queued with a generic failure and no sent timestamp. After making the disposable job eligible, a worker process delivered it. A second worker start left one intent, one accepted message, two attempts and a persisted sent timestamp. Delivery used a stable message ID and one recipient. The default worker transport stays mock.
- **Durability boundary.** A crash after SMTP acceptance and before the database records completion can deliver again. The rehearsal verifies retry after explicit rejection and stable intent identity. Exactly-once SMTP delivery remains unverified.
- **PostgreSQL.** Database shutdown produced 503 readiness while liveness stayed 200. Readiness recovered after restart. Backup restored into a separate database with matching counts of 4 tickets, 8 ticket events, 9 audit entries, 4 sessions, 1 notification and 1 outbox job. The notification and job matched exactly, and a separate API process served the test ticket with the restored session. The dedicated run observed 449 ms for the stop/readiness/restart sequence and 373 ms for backup, restore and authenticated read. These are fixture timings. Production RPO and RTO require approved objectives, backup cadence, representative data and target infrastructure. The DB suite also exercised concurrent ticket operations, worker termination after claim, lease expiry and recovery.
- **Recovery procedure.** Rerun the harness for a fresh disposable environment. Check liveness and readiness separately during database recovery. Reconnect stale diagnostic clients before integrity checks. Restore into a separate database, compare records and relationships, then verify an authenticated read before considering cutover.

## Local verification evidence

Node.js 26.8.1, pnpm 9.15.0, macOS ARM64, PostgreSQL 18.6 and Chromium. Initial runs exposed an omitted API public origin and a stale diagnostic connection after PostgreSQL restart. Both were corrected and replayed. The first full browser run reported one failed development sign-in and 26 passes. The portal now holds the development submit button while auth initializes and preserves a typed email. A regression delays identity discovery and checks the submitted identity. The full browser replay includes the fix. ESLint flagged one type-only import in the fixture. The corrected import passed lint and typecheck. Command logs are in `/private/tmp/aiit-staging-evidence.4ccprS`.

| Command | Exit | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| `pnpm install --frozen-lockfile` | 0 | — | — | — |
| `pnpm db:generate` | 0 | — | — | — |
| `pnpm typecheck` | 0 | — | — | — |
| `pnpm lint` | 0 | — | — | — |
| `pnpm build` | 0 | — | — | — |
| `pnpm test:staging` | 0 | 1 | 0 | 0 |
| `pnpm test` | 0 | 175 | 0 | 0 |
| `pnpm test:security` | 0 | 50 | 0 | 0 |
| `pnpm test:db` | 0 | 56 | 0 | 0 |
| `pnpm test:e2e` | 0 | 28 | 0 | 0 |
| `pnpm test:e2e:postgres` | 0 | 20 | 0 | 0 |
| `pnpm audit --audit-level=moderate` | 0 | — | — | — |
| `pnpm audit --prod --audit-level=moderate` | 0 | — | — | — |

The native suite includes the staging rehearsal. Hosted PostgreSQL jobs require database execution. See the stacked draft PR for exact-head hosted evidence.

## Target staging gates and Day 9

An authorized target staging endpoint, nonproduction Keycloak tenant and approved organizational SMTP route were unavailable. Target firewall policy, certificate provisioning, actual federation, and SMTP authorization remain unverified. Privileged AI execution, AD writes, and mailbox provisioning remain disabled.

For Day 9, identify an authorized staging host and issuer, confirm private networking and TLS, approve a non-relaying mail sink, and define RPO/RTO and audit retention. Replay restore on representative synthetic data and complete role-specific stakeholder UAT. Obtain independent review and integrate the prerequisite stack in order before re-running acceptance checks on main.

## Office isolation follow-up

The owner prohibited all office connections, including read-only, connectivity and certificate checks. Reused the clean standalone Day 8 clone at `1d58bce2172731ff269ddbbb225bb4504b036f10`, based on Day 7 `25d97a93252bfd36810cd15e320e1fb1494b4b29`. The GitHub branch and draft PR heads matched. The original Day 6 source and its existing audit evidence were outside the verification checkout.

Added startup destination checks for the API's PostgreSQL connection, OIDC, portal upstream and disposable importer. The local verifier starts children with an allowlisted environment. Synthetic seed identities and tests use `example.test`. See the [office infrastructure isolation policy](../security/OFFICE_INFRASTRUCTURE_ISOLATION_POLICY.md).

The isolated SMTP matrix covers trust and name validation, failure against a plaintext-only listener, rejection when authentication is required by the sink, synthetic recipient checks, recovery after SMTP 451, and exhaustion at a two-attempt limit. The adapter uses a public test-sink model without SMTP credentials. Authenticated SMTP interoperability remains outside the rehearsal. The disposable database and OIDC role workflows were replayed locally under the destination guards.

### Isolation verification replay

All final commands exited 0 under an allowlisted environment. The local host used macOS ARM64, Node.js 26.8.1, pnpm 9.15.0, disposable PostgreSQL 18.6, and Chromium. Harness listeners, database names, fixture certificates, and recipients were provisioned locally. GitHub and the public package registry were used for source control and dependency tooling.

| Command | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm typecheck`, `pnpm lint`, `pnpm build` | — | — | — |
| `pnpm test` | 178 | 0 | 0 |
| `pnpm test:security` | 53 | 0 | 0 |
| `pnpm test:db` | 56 | 0 | 0 |
| `pnpm test:e2e` | 28 | 0 | 0 |
| `pnpm test:e2e:postgres` | 20 | 0 | 0 |
| `pnpm test:staging` | 1 | 0 | 0 |
| `pnpm audit --audit-level=moderate`, `pnpm audit --prod --audit-level=moderate` | — | — | — |

npm initially rejected the same empty path for both user and global configuration. Separate paths enabled build and browser execution. One browser assertion still referenced the old fixture display name, and it passed after switching to the shared synthetic fixture label. The focused staging replay recorded 465 ms for database restart and 465 ms for backup, restore and the authenticated read. Evidence with command names, exit codes and initial failure logs is in `/private/tmp/aiit-isolation-evidence.yTNIYz`. The [draft PR checks](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/11/checks) track the exact pushed head.

External staging access is not needed for the local rehearsal. Office integration stays disabled under the owner's restriction. Formal approval and prerequisite integration remain pending.
