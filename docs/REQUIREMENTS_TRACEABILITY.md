# AIIT requirements traceability — Day 1

Sources: the supplied Day 1 execution request, the earlier AIIT master requirements, and the current repository `docs/SRS.md`. The SRS describes cross-SBU IT/CTO roles, but its “approved/implemented” labels are not independent proof of stakeholder approval or runtime completion. No separate office IT task list was found. Day 2 must reconcile the sources without silently rewriting business policy.

Priority: P0 release blocker; P1 important foundation; P2 follow-up. All test evidence below is local or isolated development evidence.

| Requirement ID | Requirement | Source | Implementation location | Current status | Test evidence | Gap | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AIIT-01 | Frontend application | Day 1 §12; SRS §§2–3; master requirements | apps/web/src/server.ts; landing.ts; public/* | VERIFIED | HTTP 200 at / and /app; fresh isolated employee/IT/CTO browser checks; responsive JSON | Full compiler/E2E pipeline and accessibility audit remain | P1 |
| AIIT-02 | Backend APIs | Day 1 §12; SRS §§2–3; master requirements | apps/api/src/app.ts | VERIFIED | 9 existing integration tests; HTTP health and isolated boundary probes | Modular Node handler, not NestJS; endpoint-specific gaps remain | P1 |
| AIIT-03 | Authentication | Day 1 §12; SRS §§2–3; master requirements | apps/api/src/auth.ts; app.ts | PARTIAL | Dev sign-in, expiry/JWT tests; P08 rejects production dev auth | Email-only local HMAC login; logout revocation absent | P0 |
| AIIT-04 | Keycloak integration | Day 1 §12; SRS §§2–3; master requirements | infra/keycloak/upstra-enterprise-realm.json; auth.ts | BLOCKED | Blueprint read; LDAP component disabled; no application OIDC client flow | Real discovery/JWKS/code flow, test realm and verified federation absent | P0 |
| AIIT-05 | User roles | Day 1 §12; SRS §§2–3; master requirements | packages/shared/src/index.ts; app.ts | PARTIAL | CUSTOMER/EMPLOYEE/IT_ADMIN/CTO present; P03 privileged calls denied | Role-name checks, unused generalized permissions, workflow gaps | P0 |
| AIIT-06 | SBU isolation | Day 1 §12; SRS §§2–3; master requirements | shared canAccessTicket; app ticket handlers | PARTIAL | P02 direct foreign ticket returns 403; existing ownership tests pass | One SBU per user; no support-assignment scoping; other resources differ | P0 |
| AIIT-07 | Customer isolation | Day 1 §12; SRS §§2–3; master requirements | User/Ticket models; app analytics | PARTIAL | P03 customer privileged endpoints denied; own-ticket predicate inspected | No customer organization model; aggregate leakage F06 | P0 |
| AIIT-08 | Ticket creation | Day 1 §12; SRS §§2–3; master requirements | app.ts POST /api/tickets | VERIFIED | Integration #3/#5; isolated browser assistant creates REQ-2026-1004 | Approval/severity policy and authoritative service eligibility incomplete | P1 |
| AIIT-09 | Ticket persistence | Day 1 §12; SRS §§2–3; master requirements | apps/api/src/store.ts | PARTIAL | P04/P05 reconstruct store/API and reload tickets/audit | JSON only; lost updates, no transactions/foreign keys | P0 |
| AIIT-10 | Ticket assignment | Day 1 §12; SRS §§2–3; master requirements | app.ts ticket creation/reopen | PARTIAL | Existing tests and source show automatic first-IT-user assignment | No assignment/reassignment API or support group selection | P1 |
| AIIT-11 | IT escalation | Day 1 §12; SRS §§2–3; master requirements | app.ts triage/reopen; shared state machine | VERIFIED | Integration manual fallback; mock outage test; browser result inspected | No SLA scheduler or full queue routing | P1 |
| AIIT-12 | CTO escalation | Day 1 §12; SRS §§2–3; master requirements | app.ts escalate-cto/transition; shared transitions | PARTIAL | Integration escalation works; CTO browser queue renders; F05 bypass reproduced | Escalated closure/approval constraints incomplete | P0 |
| AIIT-13 | AI triage | Day 1 §12; SRS §§2–3; master requirements | packages/connectors/src/index.ts | MOCK | Unit/integration mock classification, injection patterns, fallback; isolated browser | No LLM; fixed confidence; simple keyword matching; no actual outcome verification | P1 |
| AIIT-14 | Knowledge Base | Day 1 §12; SRS §§2–3; master requirements | app.ts /api/kb; KnowledgeArticle; mock matcher | PARTIAL | Approved-article filtering/search source; existing AI retrieval tests | No SBU/org visibility, editor/review/versioning/feedback workflows | P1 |
| AIIT-15 | Automation policy | Day 1 §12; SRS §§2–3; master requirements | TYPED_TOOL_REGISTRY; deterministic orchestrator | MOCK | P07 AD/mail remain disabled; prompt restriction unit tests | No durable automation runner, parameter-bound approvals or verified execution | P1 |
| AIIT-16 | Approval workflow | Day 1 §12; SRS §§2–3; master requirements | app.ts /api/approvals/:id/decide | PARTIAL | Integration role-level decisions; F04 replay/no-rationale probe | No one-time CAS/idempotency/immutable parameter binding | P0 |
| AIIT-17 | Asset management | Day 1 §12; SRS §§2–3; master requirements | app.ts /api/assets and acknowledge; Asset model | PARTIAL | Source inspection; existing workflow inventory records; API ack tested in audit harness separately | Read/list/ack only; no register/assignment/return/maintenance APIs | P1 |
| AIIT-18 | Directory integration | Day 1 §12; SRS §§2–3; master requirements | MockActiveDirectoryAdapter; realm LDAP blueprint | MOCK | P07 returns executed=false/BLOCKED_PRODUCTION_DISABLED | Fixture lookups only; no live LDAP/federation; no write bridge | P1 |
| AIIT-19 | Mail integration | Day 1 §12; SRS §§2–3; master requirements | DevelopmentEmailTransport; mailbox provisioner | MOCK | P07 provisioned=false; F08 reveals false Mailpit success | No working SMTP message delivery; no corporate mailbox adapter | P1 |
| AIIT-20 | Notifications | Day 1 §12; SRS §§2–3; master requirements | apps/api/src/queue.ts; worker/main.ts; /notifications | PARTIAL | Existing mock send test; F09 remains FAILED after recovery | Local array queue, no retry/reclaim/idempotency; worker snapshot issue | P1 |
| AIIT-21 | Audit logging | Day 1 §12; SRS §§2–3; master requirements | app recordAudit; store.auditLogs | PARTIAL | Integration audits; P05 reload; F07 canary retained | Mutable JSON, incomplete coverage/retention/tamper resistance | P0 |
| AIIT-22 | Database migrations | Day 1 §12; SRS §§2–3; master requirements | apps/api/prisma/schema.prisma; migrations/*/migration.sql | IMPLEMENTED_NOT_VERIFIED | Schema and all 13 table declarations inspected; no SQL executed | No applied ledger/importer; UUID/prefixed-ID mismatch | P0 |
| AIIT-23 | Automated tests | Day 1 §12; SRS §§2–3; master requirements | tests/*; package.json; playwright.config.ts | PARTIAL | 24 combined pass; 7 unit and 9 integration pass separately; UI harness checks | Compiler/dependencies/E2E CLI blocked; 9 audit expectations fail | P0 |
| AIIT-24 | CI/CD | Day 1 §12; SRS §§2–3; master requirements | No checkout CI configuration found | PLANNED | File inventory and package scripts inspected | No pipeline, release artifacts or deployment validation | P0 |
| AIIT-25 | Staging | Day 1 §12; SRS §§2–3; master requirements | infra/docker-compose.yml; docs/DEPLOYMENT.md | BLOCKED | Compose dependency templates inspected; Docker CLI absent | No approved staging host/network/secrets/identity or app containers | P0 |
| AIIT-26 | Production deployment | Day 1 §12; SRS §§2–3; master requirements | docs/DEPLOYMENT.md; infra templates | PLANNED | No deployment attempted; no release tags or remote | All release blockers remain; readiness target is planning only | P0 |

## Day 2 requirements decisions

- Distinguish company-approved SBU names, service eligibility, SLA/priority rules and IT task lists from seeded examples.
- Approve the full role/permission matrix, cross-SBU support assignments, customer organization boundaries and SYSTEM_SERVICE authority.
- Approve ticket closure/reopening and CTO escalation gates, resolution verification and requester confirmation requirements.
- Define immutable approval parameters, one-time decisions, justification, delegation and separation-of-duties rules.
- Resolve single-SBU user fields versus multiple memberships; KB visibility and internal-note/audit access.
- Define identity/session expiry, logout, revocation, PKCE/client type, federation prerequisites and staging identities.
- Reconcile runtime Node HTTP and JSON storage with Next/Nest/Prisma/BullMQ scaffold claims. Preserve the existing modular monorepo; do not approve a rewrite by implication.
- Define supported runtime/toolchain, test gates, staging constraints, backup/recovery acceptance and release ownership. The 10 December target is not a guarantee.
