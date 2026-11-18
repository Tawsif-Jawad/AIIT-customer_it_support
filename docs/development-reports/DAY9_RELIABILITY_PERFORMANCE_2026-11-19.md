# Day 9 reliability, performance and release readiness

## Baseline and boundary

Development starts at `dd4c97e1ab453874d610f0a37c82ad8d909894dc`, the verified Day 8 head of draft PR #11. The Day 7 base is `25d97a93252bfd36810cd15e320e1fb1494b4b29`. The original Day 6 checkout and review locks were outside the development and test workspace. The clean standalone clone had no active `.env` or operational JSON database. Verification used a scrubbed environment, owned loopback listeners, synthetic users, a controlled OIDC issuer, a TLS SMTP sink, and disposable PostgreSQL. Source control and dependency tooling used GitHub and the public registry. The test portal used port 4174 while the existing local demo remained available on 4173.

The [office isolation policy](../security/OFFICE_INFRASTRUCTURE_ISOLATION_POLICY.md) governs destination approvals. Loopback does not attest who operates a listener. The harness establishes ownership by provisioning its own processes, listener ports, certificates and database. Host-wide egress and external staging remain outside this evidence.

## Audit findings and corrections

| Finding | Disposition and regression |
| --- | --- |
| The expired final-attempt outbox UPDATE could wait on a locked row before claiming independent work. | Bounded sweep of up to 32 rows with `FOR UPDATE SKIP LOCKED`, then the existing independent claim. The regression holds one expired row locked, permits a separate claim and completion, releases the lock, and verifies terminal `LEASE_EXHAUSTED` with no sent timestamp. |
| Detail and assignment history read existing events in ticket/time order, with no matching index. The expired-job sweep lacked a state/lease access path. | Additive Prisma migration indexes `TicketEvent(ticketId, createdAt, id)` and `NotificationJob(state, leaseUntil)`. Schema parity, migration and restore run on disposable databases. The benchmark reports the ticket-history plan. |
| Support displayed the unconfigured-auth message on an API fetch failure. The existing retry refreshed health alone. | Transient failure gets a sign-in recovery message. Retry rechecks authentication for the signed-out portal. Chromium simulates a 502 on the first Support auth request and verifies successful retry and sign-in. |
| Node's environment-proxy option check used a word boundary before the leading hyphens in `NODE_OPTIONS`. | Match option tokens and hyphen/underscore aliases. OIDC endpoint validation also requires protocol and literal loopback agreement. Tests verify proxy opt-in rejection before discovery and prove the discovery 302 does not reach a separate trap path on the owned loopback fixture. |
| The external delivery acknowledgement and database completion straddle different systems. | The TLS SMTP regression kills the process after accepted DATA and before completion, forces expiry in the disposable fixture, and observes two accepted messages with the same Message-ID and one durable job. |
| S-01 remains present. Authorized requester ticket payloads include the existing `assigneeId` field. Legacy automatic-reopen history also includes assignment context in event metadata. | The UAT asserts the existing field contract and the redaction of manual reassignment metadata. Coordinate any removal, including old event shapes, with the owner and consumers. |

Day 8 startup checks reject unapproved PostgreSQL, OIDC, SMTP and portal destinations. The existing OIDC origin guard and redirect refusal, proxy trust tokens, required TLS, and child-environment allowlist remain in scope. Coverage includes session expiry/revocation, Origin/CSRF, role/SBU checks, concurrent assignment, literal SQL search, CSP/XSS, secret redaction, and recipient-scoped notifications. Representative tests do not certify arbitrary operator-supplied local forwarders.

## Recovery runbook for isolated verification

1. Start from a clean checkout without operational data or an active environment file. Confirm every endpoint was started by the local rehearsal. Keep AD and mailbox execution disabled.
2. Run the isolated verifier and focused staging command. Observe API `/api/live` and `/api/ready` independently during disposable PostgreSQL outage and restart. Inspect the worker's readiness/unavailable events and aggregate outbox totals.
3. During graceful shutdown, let the existing worker drain its active claim and release its Prisma client. A terminated worker's claim recovers after the lease. Stale lease tokens cannot complete a recovered claim. Track terminal `FAILED` and inspect `DELIVERY_FAILED` or `LEASE_EXHAUSTED`; preserve the durable record.
4. Reconcile uncertain SMTP sends with the isolated sink or, in a separately approved environment, the transport operator. A stable Message-ID assists reconciliation and offers no delivery deduplication guarantee. A job may be accepted more than once after a crash. Avoid blindly cloning or replaying terminal jobs.
5. Restore a fixture backup into a separate database, compare record relationships and counts, verify an authenticated application read, then record runtime and recovery evidence. Adopt any cutover procedure, backup cadence or RTO/RPO only after owner approval and target-specific verification.

## Synthetic stakeholder UAT checklist

| Actor | Repeatable evidence | Human sign-off |
| --- | --- | --- |
| CUSTOMER | Create an owned request. Deny cross-owner/SBU read and prohibited workflow changes. Confirm/reject a proposed resolution within the requester workflow. | Pending |
| EMPLOYEE | Create a request, inspect mock triage, reject the proposal and reopen, then confirm the CTO-reviewed resolution and close. Deny IT progression and audit access. | Pending |
| IT_ADMIN | Assign to an eligible active administrator, progress the queue, escalate, reject IT resolution of a CTO-governed ticket. Validate assignment race, stale responses and inactive destinations. | Pending |
| CTO | Review and resolve escalation, check durable history. Existing browser tests cover approvals and audit access. | Pending |
| SYSTEM_SERVICE | Deny interactive sign-in. Verify durable background delivery, bounded retry and recovered leases through the worker. Scheduled SLA execution is not implemented. | Pending |

The end-to-end PostgreSQL role journey is in `tests/day9-uat.test.ts`; native and Chromium suites cover the additional role cases. No human sign-off is implied.

## Release and prerequisite register

Observed GitHub status for PRs #2–#11. Every PR was open and unmerged. The next row depends on the preceding branch head. `0` means no submitted GitHub reviews. The mergeability snapshot compares the current PR base and does not predict conflicts after retargeting.

| PR | Exact head | Base branch | Review state | Exact-head PR CI | Submitted reviews | GitHub conflict check |
| --- | --- | --- | --- | --- | ---: | --- |
| [#2](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/2) | `755ca6067ae038e44914d8642404eae32d6e32f8` | `main` | Draft | [failure](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42604296311) | 0 | Mergeable on snapshot |
| [#3](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/3) | `4dfe6358d1eba120edaa50283e2fab2ea62d12f5` | `fix/day2-closure-severity-ci` | Open for review | [failure](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42611874733) | 0 | Mergeable on snapshot |
| [#4](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/4) | `e8145e258e848e5c98e8a6e9b769259040a27f70` | `audit/day1-day2-full-functional-review` | Draft | [failure](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42763456484) | 0 | Mergeable on snapshot |
| [#5](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/5) | `5d42b59ce0484512c851ee78c0ee24f0b77c3ad8` | `codex/day3-transactional-postgres` | Draft | [failure](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42767066329) | 0 | Mergeable on snapshot |
| [#6](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/6) | `f151b88edfa4e63da8b240d6603a5728bf6b8391` | `codex/day4-enterprise-auth-security` | Draft | [failure](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42976460416) | 0 | Mergeable on snapshot |
| [#7](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/7) | `9f57dd0c136d60c648380cdac3ec999d85964762` | `codex/audit-remediation-m1-business-workflows` | Draft | [failure](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42980339711) | 0 | Mergeable on snapshot |
| [#8](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/8) | `f0fd3a1fb682e7eec17b0345280a19207678f02a` | `codex/day5-postgres-runtime-integration` | Draft | [failure](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42983963903) | 0 | Mergeable on snapshot |
| [#9](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/9) | `fc5e1b4418465d74ea896a25f308d6d62adc3ae3` | `codex/day6-ingress-oidc-abuse-postgres-performance` | Draft | [success](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/44247987897) | 0 | Mergeable on snapshot |
| [#10](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/10) | `25d97a93252bfd36810cd15e320e1fb1494b4b29` | `codex/audit-remediation-day1-day6` | Draft | [success](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/44279202949) | 0 | Mergeable on snapshot |
| [#11](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/11) | `dd4c97e1ab453874d610f0a37c82ad8d909894dc` | `codex/day7-manual-assignment-pilot` | Draft | [success](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/44284708714) | 0 | Mergeable on snapshot |

The #2–#8 historical run records failed. Replay on each accepted candidate with the owner-approved gates before integration. #9–#11 have passing recorded CI and still lack formal approval. #11's exact-head push run is [44284692549](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/44284692549). The minimum sequence is #2 through #12, conditional on approval and verification at each step. Retarget only the next authorized PR after its predecessor lands, check cumulative diff/base ancestry and mergeability, and rerun exact-head CI. Preserve original evidence and complete independent reviews before integration.

For eventual main verification, use a clean standalone checkout of the exact integrated commit. Record SHA and ancestors, run the same 13-command verifier with `DB_REQUIRED` enforced and a separate loopback port, replay the bounded benchmark and UAT, validate migration and restore using disposable PostgreSQL, and review exact-commit hosted checks. Main verification is pending.

## Production readiness against the approved SRS

| Capability | Classification | Remaining gate |
| --- | --- | --- |
| Ticket intake, lifecycle, assignment, CTO escalation, SBU checks and approval records | Implemented and verified in controlled runs | Independent review, chain integration, stakeholder acceptance. Exact-action binding and privileged execution remain separately blocked. |
| Service catalog and request validation | Implemented and verified | Confirm catalog and SLA policy on authorized target. Attachments and scheduled SLA enforcement are not implemented. |
| Equipment and custody | Implemented but partially verified | Validate the approved inventory and custody lifecycle with stakeholders. |
| AI automation and directory | Mock / synthetic only | Approved model, evaluation and policy evidence. Live AD is blocked by access and approval. |
| Authentication and notifications | Implemented but partially verified | Controlled OIDC and durable outbox/local TLS SMTP verified. Target federation and mail interoperability require authorization. |
| Reporting, audit and monitoring | Implemented but partially verified | Scoped feeds, dashboards and failure logs exist. Retention, audit tamper resistance, alert ownership, and target SLOs remain pending. |
| Backup, PostgreSQL recovery and security | Implemented but partially verified | Synthetic migration/restore and security checks pass. Approve RPO/RTO and demonstrate operational restore with representative synthetic data on the target. |
| Deployment and any office integration | Blocked by access or approval | Private target environment, independent approvals and production readiness decision. Office access requires explicit specific authorization. |

## Roadmap to the 10 December target

Day 10 prioritizes independent review, owner-approved compatibility treatment for S-01, queue failure alert ownership, and capacity/restore criteria. Next rehearse on an authorized noncorporate target and run stakeholder UAT. Integrate the prerequisites in order and run the clean main replay before any release decision. The 10 December target is conditional on these gates.

## Synthetic performance measurements

Reproduce with a scrubbed environment, initialized Prisma and PostgreSQL binaries, then run `node scripts/benchmark-postgres.ts`. The script provisions and closes its own cluster. This run used macOS ARM64, Apple M3 (8 logical cores, 8 GiB RAM), Node.js 26.8.1, PostgreSQL 18.6, two separate API processes, eight configured connections per API client and one mock worker. Reads used 120 measured requests per route after warm-up, with concurrency 8 and no unexpected errors. The measured listing response contains 25 tickets. [Full output and query plans](evidence/day9/benchmark.json)

| Seed tickets | Read route | p50 / p95 / p99 ms | Requests/s |
| ---: | --- | --- | ---: |
| 1,000 | Page of tickets | 5.40 / 6.41 / 8.29 | 1,239 |
| 1,000 | Detail + history | 14.16 / 17.26 / 27.30 | 501 |
| 1,000 | Audit feed | 13.18 / 16.21 / 17.46 | 553 |
| 10,000 | Page of tickets | 7.26 / 9.89 / 12.29 | 947 |
| 10,000 | Detail + history | 15.16 / 21.35 / 24.94 | 471 |
| 10,000 | Audit feed | 14.38 / 17.42 / 18.00 | 509 |
| 50,000 | Page of tickets | 9.48 / 12.20 / 13.42 | 715 |
| 50,000 | Detail + history | 15.54 / 32.74 / 34.96 | 393 |
| 50,000 | Audit feed | 18.27 / 25.48 / 26.58 | 379 |

| Seed tickets | Create attempts / conflicts | Create p50 / p95 / p99 ms | Create commits/s | Assignment attempts / conflicts | Assignment p50 / p95 / p99 ms | Assignment attempts/s | Worker jobs/s |
| ---: | --- | --- | ---: | --- | --- | ---: | ---: |
| 1,000 | 30 / 10 | 47.10 / 60.51 / 60.62 | 184.19 | 54 / 38 | 12.95 / 41.22 / 52.38 | 108.47 | 265.26 |
| 10,000 | 37 / 17 | 46.84 / 76.98 / 77.11 | 149.39 | 56 / 40 | 11.25 / 18.05 / 18.98 | 173.30 | 196.97 |
| 50,000 | 30 / 10 | 56.99 / 83.73 / 83.96 | 142.69 | 50 / 34 | 11.99 / 14.14 / 14.85 | 164.48 | 123.55 |

Every size committed 20 creations at concurrency 20 and 16 assignments at up to eight concurrent POSTs. Conflicts are observed HTTP 409 responses and are reported separately from unexpected errors. The first run found pairs where both writes conflicted under cross-ticket contention. The final harness refreshes the ticket and applies a bounded stagger before retrying those pairs. There were 11, 12 and 9 such rounds. It verifies one commit per ticket and checks that retries do not replay a committed update. Assignment latency measures the POST attempts, while the rate includes reads and retry waits. The worker completed 150 jobs per dataset during the read workload.

At the largest size, the cluster held 50,063 tickets, 100,292 history events, 50,111 audit entries and 10,108 jobs. The observed API process RSS was approximately 185–192 MiB per process and PostgreSQL reported 18 connections after traffic. The exact-ticket history SQL used the new composite index at all three sizes, with three returned rows and 0.017 ms execution time at 50,000 seeded tickets. The complete document records page, analytics, literal scoped search, approval, and numbering query plans. HTTP timings also include authorization, other projections and JSON serialization. These measurements describe a single workstation run.

Propose repeating 50,000 synthetic tickets at concurrency 8 on an approved equivalent host as the first capacity gate. Use the measured 12.20 ms page, 32.74 ms detail and 25.48 ms audit p95 values as comparison references across repeated trials. Require zero unexpected errors and verify each committed mutation has one durable intent where applicable. The owner must approve the acceptable latency band, conflict/retry budget, worker backlog objectives and storage/recovery limits before adopting an SLO.

## Independent review packet

Review the PR as a stack on Day 8. Inspect the two index definitions against the Prisma schema, verify the sweep takes row locks only for a bounded batch, and replay a held-lock test and SMTP accept-before-commit crash. The migration uses ordinary index creation. Measure lock duration on representative synthetic data and agree on a target migration window before any authorized deployment. Review OIDC refusal before discovery, Support retry, targeted role boundaries, and the benchmark's observed dual-conflict behavior. Compare the full commit diff, run `node scripts/verify-local.ts` in a clean clone, then reproduce the benchmark and sign off on the UAT checklist or record exceptions.

## Verification evidence

The isolated verifier used Node.js 26.8.1, pnpm 9.15.0, PostgreSQL 18.6 and Chromium on macOS ARM64. Results overlap across commands. Each final command exited 0.

| Command | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| `pnpm install --frozen-lockfile --ignore-scripts` | — | — | — |
| `pnpm db:generate` | — | — | — |
| `pnpm typecheck` | — | — | — |
| `pnpm lint` | — | — | — |
| `pnpm build` | — | — | — |
| `pnpm test` | 182 | 0 | 0 |
| `pnpm test:security` | 55 | 0 | 0 |
| `pnpm test:db` | 57 | 0 | 0 |
| `pnpm test:e2e` | 29 | 0 | 0 |
| `pnpm test:e2e:postgres` | 21 | 0 | 0 |
| `pnpm test:staging` | 1 | 0 | 0 |
| `pnpm audit --audit-level=moderate` | — | — | — |
| `pnpm audit --prod --audit-level=moderate` | — | — | — |

The initial verifier found the incorrect Node option match, an expected-status and assignment-target error in the new UAT fixture, and a browser fixture that relied on the default selected identity. Those paths were corrected and the full suite replayed. Initial and final command logs and benchmark exits are in `/private/tmp/aiit-day9-evidence.utijUq`. The [draft PR checks](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/12/checks) record exact-head hosted evidence after publication.
