# AIIT — Current development roadmap (updated 22 November 2026)

> **Current plan.** The final goal remains a secure, functional, production-grade multi-SBU IT Support System. The next development strategy is to prove the actual application in a **complete isolated synthetic office** before requesting permission to integrate it with any real organizational infrastructure. This is a sequencing change, **not** a restart, reimplementation, change of architecture, or production authorization.
>
> **Status is evidence-specific.** Days 1–11 have engineering milestones recorded against development/PR heads, with Day 11 engineering PASS on [draft PR #15](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/15) at `78b3fc5298d09592370574a0cb5c540904ca1c63`. Passing isolated engineering checks does **not** mean independent approval, merged `main`, enterprise certification, stakeholder acceptance, or production readiness. The release verdict remains **NO-GO**.
>
> **Owner restriction.** No agent, test, diagnostic, or deployment may contact or probe office servers, corporate networks, Active Directory, company email/SMTP, corporate data or real accounts (including read-only or certificate/trust tests) until the owner explicitly authorizes the **specific** integration. Continue with synthetic users, isolated endpoints, disposable stores and test mailboxes. See the [office infrastructure isolation policy](security/OFFICE_INFRASTRUCTURE_ISOLATION_POLICY.md).

## Revised sequence and acceptance

| Stage | Status | Scope and intended deliverable | Acceptance evidence / outstanding gates |
| --- | --- | --- | --- |
| **Days 1–11 — Core application engineering** | **Engineering milestone work recorded; formal acceptance pending** | Existing frontend, API, PostgreSQL, worker and security boundaries; employee/IT/CTO workflows; assets, SLA, approvals, audit, synthetic verification and hosted CI | Retain exact-head evidence from [PR #13](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/13), [PR #14](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/14) and [PR #15](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/15). Independent review, approved dependency integration and verification on `main` remain open. |
| **Day 12 — Full synthetic office environment** | **Next; proposed** | Reproducible isolated simulation fixture: fictional offices/SBUs, customers/employees, IT admins, CTO, equipment, tickets, roles and policy-aligned state, using the existing application | Deterministic seed/reset and documented topology; verified isolation; correct role/SBU and custody fixtures; existing production integrations stay disabled |
| **Day 13 — Enterprise service integration lab** | **Proposed** | Exercise existing integration boundaries against *simulated* OIDC/identity, directory, SMTP/mail, and device services; include error/failure states | End-to-end adapter/contract evidence, allowlisted synthetic endpoints, bad certificate/claims/permissions tests, outbox retry/recovery; no actual office calls |
| **Day 14 — Full-office simulation and stress testing** | **Proposed** | Multi-user employee → AI (current deterministic/mock provider) → IT → CTO scenarios, tickets, assets, approvals, SLA, failures, concurrent updates and recovery | Reproducible role/SBU scenario matrix; measured latency, throughput, conflicts, data integrity and bounded resource use at documented synthetic scales; fix and replay confirmed issues |
| **Day 15 — Synthetic acceptance and release-candidate evaluation** | **Proposed** | Cut a traceable release-candidate *for synthetic evaluation*, run functional/security/performance/recovery suites and demonstrate a complete fictional office | Exact-commit CI, browser UAT evidence, negative authorization tests, dependency review, backup/restore and rollback evidence, open-risk register and explicit **synthetic readiness** verdict; do not call it production-approved |
| **Later — Real enterprise integration and deployment** | **Blocked pending owner authorization** | Validate actual identity federation, AD policies, corporate SMTP/relay, runtime network/security, operational backups and recovery, stakeholders and rollout | Specific owner-approved access and changes; named independent review; approved PR integration and verified `main`; real-infrastructure tests; stakeholder UAT; release authorization |

**Scheduling:** Days 12–15 are *proposed milestone labels*, not a commitment to finish in four calendar days. Prioritize evidence and quality over the numbered schedule. The earlier **10 December 2026** date is a conditional planning target, not a release promise.

## Implementation rules for Days 12–15

1. **One product, one system of record.** Build the synthetic office as a test-fixture/harness layer **around the real application**, not a second application, replacement backend, or alternate production architecture. Reuse existing interfaces, policies, worker, database schema and automated tests.
2. **Representative multi-SBU behavior.** Generate deterministic fictional identities, support roles, scoped tickets, asset custody, approvals, escalations, notifications, service catalog entries, and audit histories. Test authorized behavior and forbidden cross-user/SBU actions.
3. **True synthetic service contracts.** Simulated OIDC/Keycloak, directory, mail and device services exercise the approved adapter contracts and failures. External enterprise integration remains disabled; deterministic/mock AI must not be represented as a validated production LLM.
4. **Security and integrity by default.** Disposable databases, synthetic `example.test` recipients, bounded load, explicit destination allowlists, secrets excluded from logs, reproducible test data and no unexpected network egress. Stop any operation whose isolation cannot be demonstrated.
5. **Demonstrate production gaps, do not hide them.** Track source/test evidence separately for implemented, synthetic-verified, unverified, owner-decision-required and production-blocked capabilities. Evaluate data leakage, access scope, concurrency, SMTP acceptance/completion ambiguity, recovery objectives, and operational governance.
6. **Preserve Git governance.** Continue on the reviewed Day 11 PR #15 line; do not rewrite or merge pending PRs, bypass review, or assert a new merged baseline. Obtain independent review and approved integration before calling `main` validated.
7. **Explicit decisions remain outstanding.** Privileged SBU/CTO policy, requester data/API compatibility, production SMTP duplicate/reconciliation policy, actual operational RPO/RTO and retention, corporate identity/mail trust, target infrastructure and stakeholder UAT require the appropriate owners. No mock test resolves them.

## Separate readiness verdicts

- **Synthetic readiness:** A working, isolated full-office demonstration with reproducible contract, workflow, security, performance and recovery evidence; this can be evaluated during Day 15.
- **Production readiness:** **NOT APPROVED** until office-specific integrations and permissions are explicitly authorized, independently verified, stakeholder-accepted and deployed through approved release procedures.

---

## Historical roadmap and milestone notes (retained; not current delivery status)

> **Day 1–6 remediation update.** The next gate is independent and hosted verification of the Day 1–6 remediation. The 10 December target is conditional on a private pilot boundary and operational evidence. Privileged execution, live integrations and LLM rollout require their own approvals. [Current evidence](development-reports/DAY1_DAY6_AUDIT_REMEDIATION_2026-11-18/14_REMAINING_RELEASE_BLOCKERS.md)

> Audit remediation M1 addresses active CTO notification routing, PostgreSQL ticket creation parity, catalog form validation and ticket numbering. See the [M1 acceptance report](development-reports/AUDIT_REMEDIATION_M1_2026-11-11/10_FINAL_ACCEPTANCE.md) and [remaining source-truth findings and owner decisions](development-reports/AUDIT_REMEDIATION_M1_2026-11-11/09_REMAINING_FINDINGS.md). DEF-001 remains the next integration milestone.

> Day 4 local update (implemented 2026-11-10 for the 2026-11-11 milestone): optional enterprise Code+PKCE authentication now uses validated discovery/JWKS and opaque sessions; controlled-issuer HTTP/browser tests pass. Real Keycloak/AD and hosted acceptance remain pending. JSON stays the default store. See [authentication contract](security/ENTERPRISE_AUTHENTICATION.md) and [Day 4 report](development-reports/DAY4_DEVELOPMENT_REPORT_2026-11-11.md). Older implementation statements below are historical.

> Day 3 update (2026-11-10): A tested isolated PostgreSQL repository/outbox slice now exists; the application still runs on JSON. See [repository contract](architecture/POSTGRES_REPOSITORY.md) and [Day 3 acceptance](development-reports/DAY3_ACCEPTANCE_2026-11-10.md). Earlier statuses below are historical. Hosted checks, independent review, prerequisite integrations and production cutover remain gates.

> Final Day 2 status (2026-11-09): local compiler/ESLint/locked install, 54 native tests, 4 Chromium E2E cases and disposable PostgreSQL migration/import/restore verification pass. Hosted Actions is blocked by its explicit account payment/spending-limit diagnostic. See [final acceptance](development-reports/DAY2_FINAL_ACCEPTANCE_2026-11-09.md). Historical statuses below must be read with this update; production integrations and runtime database cutover remain incomplete.

# AIIT — Week 1 enterprise foundation backlog

Baseline date: Sunday, 8 November 2026. Production-readiness planning target: **10 December 2026**, not a promise or evidence of readiness. The Day 1 audit is complete; failed/blocked verification and release blockers are explicit in [audits/WEEK1_BASELINE.md](audits/WEEK1_BASELINE.md).

| Day | Prioritized deliverables | Dependencies / blockers | Acceptance evidence |
| --- | --- | --- | --- |
| Day 2 — Mon 9 Nov | P0: reconcile SRS/runtime; approve role/SBU/customer and transition/approval matrices; identity/session, data/ID compatibility, security and staging ADRs. P1: validate company task list, demo structures, SLAs and supported toolchain. | Business/architecture owners; current ADR wording conflicts with runtime; no independent office IT task list found. No production credentials required. | Signed/reviewed requirement decisions, traceability, threat boundaries, clear production-vs-development configuration and Day 3 schema contract. |
| Day 3 — Tue 10 Nov | P0: implement the approved transactional repository and schema; safe ID-compatible import, backup/restore rehearsal, foreign keys/indexes, concurrency and atomic audit changes. P1: notification job schema/idempotency and protected initialization. | Day 2 data/permission decisions; approved disposable PostgreSQL and compiler/dependency setup. Follow MIGRATION_PLAN.md; no unapproved shared-data migration. | Two writers preserve updates; rollback and restart tests; validated counts/references; repeat import is idempotent; original preserved. |
| Day 4 — Wed 11 Nov | P0: nonproduction Keycloak OIDC/session foundation, real token validation/logout, role/SBU/customer checks on all resources, CTO closure and one-time approval enforcement. | Day 2 identity/permission contract, Day 3 storage, approved test realm/certificates. AD federation may stay blocked; no real writes. | Valid/invalid OIDC flows, revocation, cross-SBU/org list/detail/aggregate/action negatives, replay and concurrent-decision tests. |
| Day 5 — Thu 12 Nov | P0: reviewed lockfile and actual lint/type/build pipeline, CI, approved staging config, integration/browser/smoke suites, backup restore and Week 1 report. P1: truthful mail/health/retries, data redaction and monitoring gates. | Days 2–4 gates; chosen package manager/Node version, staging constraints, Docker/runtime tooling and nonproduction services. | Clean locked install; compiler/linter pass; isolated migration and staged smoke/security results; recorded rollback/restore and unresolved blockers. |

## Release blockers identified on Day 1

F01 concurrent data loss; F02–F03 enterprise identity/session gaps; F04–F05 approval/CTO workflow bypasses; F07 sensitive logging; F11 organization/scope model; F15 unsafe reset instructions; F16 dependency/compiler integrity; F17 incompatible migration assumptions; F20 CI/staging/recovery absence. F06/F08–F10/F12–F14/F18 must be resolved or explicitly risk-accepted with verified controls before exposure. See TECHNICAL_DEBT.md for impact and retest requirements.

Do not enable AD/mail provisioning to meet the date. Do not call a mock transport, import-only “build,” or a container template production-ready. Sequence changes require review when actual prerequisites are unavailable.

## Day 1 preservation and handoff

No application code, existing tests, package scripts, infrastructure or shared records were changed. No commit, seed, migration, dependency installation or deployment was performed. The repository has no commits/tags/remote; establish a reviewed source baseline after secret review as part of release preparation.

First Day 2 task: reconcile the SRS and permission/workflow matrix with the confirmed runtime and findings F02/F04/F05/F11, then record the identity and data compatibility decisions required for Days 3–4.

---

## Previous product milestone roadmap (retained for context)

# AIIT roadmap

The supplied master request governs milestones. Earlier completion claims are superseded by `IMPLEMENTATION_STATUS.md`.

0. **Local application recovery verified**: generated JavaScript repaired, AIIT identity applied, bounded health loading, real browser sign-in/navigation/submission checked.
1. **Authentication and portals — partial**: live Keycloak OIDC, sessions, customer organization isolation, broader RBAC tests; retain explicit development mode.
2. **Persistent ticket system — partial**: PostgreSQL repository/transactions, safe migration, assignment, comments, attachments, complete lifecycle and notifications.
3. **AI support — mock foundation**: provider abstraction hardening, scoped retrieval, structured output and broader reproducible evaluations.
4. **IT operations — partial scaffolding**: approved service catalog, durable queue, exact approvals, assets/custody and disabled-by-default verified directory/mail adapters.
5. **CTO governance — partial local workflow**: complete scoped dashboards, risks, approval records and reporting.
6. **Production hardening — pending**: CI, compiler/bundle verification, security/performance/reliability tests, monitoring, backups/restore and deployment evidence.

Production directory/mail writes require explicit approval and verified infrastructure. Continue independently testable local work while those integrations remain disabled.

## UI redesign update

Public landing, original interactive dot footer, responsive role-aware shell, API-backed assistant requests, catalog, notifications, comments, filters and pagination are implemented. See `UI_REDESIGN.md` for evidence and limits. Remaining production foundations above are unchanged.

## Day 9 release-gate update

For the 10 December 2026 planning target, sequence independent review and the prerequisite stack, Day 10 decisions on capacity and notification recovery, an authorized noncorporate staging rehearsal, then integrated-main verification and stakeholder acceptance. Office infrastructure remains off-limits under the [isolation policy](security/OFFICE_INFRASTRUCTURE_ISOLATION_POLICY.md). See the [Day 9 readiness register](development-reports/DAY9_RELIABILITY_PERFORMANCE_2026-11-19.md).
