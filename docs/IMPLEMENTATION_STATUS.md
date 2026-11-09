> Final Day 2 status (2026-11-09): local compiler/ESLint/locked install, 54 native tests, 4 Chromium E2E cases and disposable PostgreSQL migration/import/restore verification pass. Hosted Actions is blocked by its explicit account payment/spending-limit diagnostic. See [final acceptance](development-reports/DAY2_FINAL_ACCEPTANCE_2026-11-09.md). Historical statuses below must be read with this update; production integrations and runtime database cutover remain incomplete.

> Day 2 delta: JSON request transactions, cross-process lease/stale-write rejection, one-time reasoned approvals, CTO escalation protection, persisted development sessions/logout, transition-note redaction and reset denial are implemented. Standalone JSON worker/non-mock mail are disabled. Expanded SBU assignment scope, real IdP/database/queue and production verification remain incomplete. See development-reports/DAY2_REPORT_2026-11-09.md.

# AIIT implementation status — Day 1 verified baseline

Date: Sunday, 8 November 2026. This matrix supersedes earlier completeness labels; historical recovery notes are retained below. **VERIFIED means the explicitly described local behavior was verified, not that the whole module is enterprise-ready.** MOCK denotes simulated integrations. BLOCKED identifies unavailable prerequisites, not a successful test.

Evidence: [Day 1 audit](audits/WEEK1_BASELINE.md), [executed commands](audits/evidence/commands.json), [boundary probes](audits/evidence/probe-results.json), [technical debt](TECHNICAL_DEBT.md).

| # | Module | Status | Exact files/components | Verification performed | Missing functionality | Known risk | Next task |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | Frontend application | VERIFIED | apps/web/src/server.ts; landing.ts; public/* | HTTP 200 at / and /app; fresh isolated employee/IT/CTO browser checks; responsive JSON | Full compiler/E2E pipeline and accessibility audit remain | F16/F18 | Day 5 compiler/browser pipeline |
| 02 | Backend APIs | VERIFIED | apps/api/src/app.ts | 9 existing integration tests; HTTP health and isolated boundary probes | Modular Node handler, not NestJS; endpoint-specific gaps remain | F04–F07/F18 | Day 2 route/permission inventory |
| 03 | Authentication | PARTIAL | apps/api/src/auth.ts; app.ts | Dev sign-in, expiry/JWT tests; P08 rejects production dev auth | Email-only local HMAC login; logout revocation absent | F02/F03 | Day 2 identity/session ADR |
| 04 | Keycloak integration | BLOCKED | infra/keycloak/upstra-enterprise-realm.json; auth.ts | Blueprint read; LDAP component disabled; no application OIDC client flow | Real discovery/JWKS/code flow, test realm and verified federation absent | F02 | Day 4 nonproduction realm validation |
| 05 | User roles | PARTIAL | packages/shared/src/index.ts; app.ts | CUSTOMER/EMPLOYEE/IT_ADMIN/CTO present; P03 privileged calls denied | Role-name checks, unused generalized permissions, workflow gaps | F05/F11 | Day 2 permission matrix |
| 06 | SBU isolation | PARTIAL | shared canAccessTicket; app ticket handlers | P02 direct foreign ticket returns 403; existing ownership tests pass | One SBU per user; no support-assignment scoping; other resources differ | F11 | Define all-resource scope rules |
| 07 | Customer isolation | PARTIAL | User/Ticket models; app analytics | P03 customer privileged endpoints denied; own-ticket predicate inspected | No customer organization model; aggregate leakage F06 | F06/F11 | Day 2 customer boundaries |
| 08 | Ticket creation | VERIFIED | app.ts POST /api/tickets | Integration #3/#5; isolated browser assistant creates REQ-2026-1004 | Approval/severity policy and authoritative service eligibility incomplete | F10/F11 | Approve catalog/priority policy |
| 09 | Ticket persistence | PARTIAL | apps/api/src/store.ts | P04/P05 reconstruct store/API and reload tickets/audit | JSON only; lost updates, no transactions/foreign keys | F01/F14/F17 | Day 3 repository/import rehearsal |
| 10 | Ticket assignment | PARTIAL | app.ts ticket creation/reopen | Existing tests and source show automatic first-IT-user assignment | No assignment/reassignment API or support group selection | F11 | Design scoped assignment model |
| 11 | IT escalation | VERIFIED | app.ts triage/reopen; shared state machine | Integration manual fallback; mock outage test; browser result inspected | No SLA scheduler or full queue routing | F09/F10 | Day 2 lifecycle rules |
| 12 | CTO escalation | PARTIAL | app.ts escalate-cto/transition; shared transitions | Integration escalation works; CTO browser queue renders; F05 bypass reproduced | Escalated closure/approval constraints incomplete | F05 | Day 4 negative transition tests |
| 13 | AI triage | MOCK | packages/connectors/src/index.ts | Unit/integration mock classification, injection patterns, fallback; isolated browser | No LLM; fixed confidence; simple keyword matching; no actual outcome verification | F10/F12 | Document recommendation semantics |
| 14 | Knowledge Base | PARTIAL | app.ts /api/kb; KnowledgeArticle; mock matcher | Approved-article filtering/search source; existing AI retrieval tests | No SBU/org visibility, editor/review/versioning/feedback workflows | F11 | Day 2 knowledge visibility policy |
| 15 | Automation policy | MOCK | TYPED_TOOL_REGISTRY; deterministic orchestrator | P07 AD/mail remain disabled; prompt restriction unit tests | No durable automation runner, parameter-bound approvals or verified execution | F04/F12 | Keep writes off; design boundaries |
| 16 | Approval workflow | PARTIAL | app.ts /api/approvals/:id/decide | Integration role-level decisions; F04 replay/no-rationale probe | No one-time CAS/idempotency/immutable parameter binding | F04 | Day 2 approval invariants |
| 17 | Asset management | PARTIAL | app.ts /api/assets and acknowledge; Asset model | Source inspection; existing workflow inventory records; API ack tested in audit harness separately | Read/list/ack only; no register/assignment/return/maintenance APIs | F11/F14 | Approve custody lifecycle |
| 18 | Directory integration | MOCK | MockActiveDirectoryAdapter; realm LDAP blueprint | P07 returns executed=false/BLOCKED_PRODUCTION_DISABLED | Fixture lookups only; no live LDAP/federation; no write bridge | F02/F12 | Day 4 test identity prerequisites |
| 19 | Mail integration | MOCK | DevelopmentEmailTransport; mailbox provisioner | P07 provisioned=false; F08 reveals false Mailpit success | No working SMTP message delivery; no corporate mailbox adapter | F08 | Verified local SMTP tests before any real relay |
| 20 | Notifications | PARTIAL | apps/api/src/queue.ts; worker/main.ts; /notifications | Existing mock send test; F09 remains FAILED after recovery | Local array queue, no retry/reclaim/idempotency; worker snapshot issue | F01/F08/F09 | Day 3/5 durable processing |
| 21 | Audit logging | PARTIAL | app recordAudit; store.auditLogs | Integration audits; P05 reload; F07 canary retained | Mutable JSON, incomplete coverage/retention/tamper resistance | F07/F14 | Day 2 event/data policy |
| 22 | Database migrations | IMPLEMENTED_NOT_VERIFIED | apps/api/prisma/schema.prisma; migrations/*/migration.sql | Schema and all 13 table declarations inspected; no SQL executed | No applied ledger/importer; UUID/prefixed-ID mismatch | F17 | Day 3 disposable migration rehearsal |
| 23 | Automated tests | PARTIAL | tests/*; package.json; playwright.config.ts | 24 combined pass; 7 unit and 9 integration pass separately; UI harness checks | Compiler/dependencies/E2E CLI blocked; 9 audit expectations fail | F16 | Day 5 clean locked toolchain and negative suites |
| 24 | CI/CD | PLANNED | No checkout CI configuration found | File inventory and package scripts inspected | No pipeline, release artifacts or deployment validation | F20 | Day 5 CI gates |
| 25 | Staging | BLOCKED | infra/docker-compose.yml; docs/DEPLOYMENT.md | Compose dependency templates inspected; Docker CLI absent | No approved staging host/network/secrets/identity or app containers | F20 | Day 2 staging constraints, Day 5 configuration |
| 26 | Production deployment | PLANNED | docs/DEPLOYMENT.md; infra templates | No deployment attempted; no release tags or remote | All release blockers remain; readiness target is planning only | F01–F20 | Track 10 December 2026 target without guarantee |

## Historical recovery/redesign evidence (retained)

# AIIT implementation status — 2026-11-08

Latest update: the UI redesign and supported frontend workflows are implemented. See [UI_REDESIGN.md](UI_REDESIGN.md) for the 24-test result, browser screenshots, responsive measurements and remaining scope. Recovery evidence below records the earlier milestone.

## Milestone 0: local recovery verified

The screenshot corresponds to a complete browser script failure. `getPortalHtml()` interpolated `\n\n` into a JavaScript single-quoted string as actual newlines. `vm.Script` reproduced `SyntaxError: Invalid or unexpected token` before any initialization could run. Login and workspace were both hidden, leaving only the header and checking-health badge.

Changes:
- `apps/web/src/server.ts`: escape generated newlines correctly; AIIT branding, tagline and company footer; initially visible login; explicit development identity wording; eight-second client request deadline; ten-second proxy inactivity timeout; visible initialization and navigation errors; health independent of sign-in initialization.
- `apps/web/app/page.tsx`: brand the unused Next.js scaffold as AIIT.
- `apps/api/src/app.ts`: truthful local storage/mock/unverified health; production and non-development sign-in fail closed; AIIT API title.
- `apps/api/src/queue.ts`: identify local queue as mock, not verified Redis health.
- `apps/api/src/auth.ts`: reject development tokens outside development auth mode; validate JWT algorithm, issuer, audience, expiry and issued-at claims.
- `apps/api/src/store.ts`: preserve corrupt/invalid data and fail rather than silently reseeding over it.
- `scripts/verify-types.ts`: parse generated browser JavaScript so this regression blocks verification.
- `tests/recovery.test.ts`, `tests/integration.test.ts`, `tests/e2e/portal.spec.ts`, `package.json`: recovery regressions, truthful health assertions, AIIT branding and correct Outlook service selection.
- README, architecture, roadmap and this report: correct prior implementation claims.

## Verification

`npm test`: 20 passed, zero failed. Covers existing ticket workflow, scoped authorization, mock AI policy, escalation, approvals, notification processing, and unavailable integrations; adds script syntax, production development-login rejection, corrupt-data preservation, and signed JWT claim/production rejection checks.

`npm run build`: passed module import and generated script syntax verification. This command does not perform full static type checking or bundling.

Actual browser at http://localhost:3000/: verified AIIT title/header, completed mock health, development employee sign-in, populated metrics and persisted ticket details, role-filtered navigation, Knowledge Base tab, new request form and submission. Created explicitly labeled development ticket `REQ-2026-1004`, displayed mock classification and audit history. No real directory/mail action performed. Local web/API services restarted after recovery changes.

Playwright CLI suite was edited but not executed: dependencies are not installed in this checkout. Browser verification above used the available in-app browser. No PostgreSQL, Redis, live Keycloak, corporate AD, or corporate mail connectivity was verified. No deployment occurred.

## Assessment and remaining milestones

| Area | Actual state / next requirement |
| --- | --- |
| Runtime | Node 26.8.1; TypeScript native execution; Node HTTP frontend/API |
| Frontend | Functional existing portal recovered; sidebar, role-specific portal refinement and wider accessibility work remain |
| Identity | Development-only local HMAC authentication; live OIDC code/PKCE, JWKS and session handling remain |
| Authorization | Existing role/SBU/ownership tests pass; full customer organization isolation and wider direct API tests remain |
| Persistence | Local JSON file, atomic rename; Prisma schema/migration scaffold only; transactions, concurrent writers and PostgreSQL integration remain |
| Tickets | Existing creation, listing, workflow and escalation tested; attachments, full assignment/comments UI and lifecycle coverage remain |
| AI | Deterministic mock classifier/KB policy tested; production provider, broader evaluations and usage controls remain |
| Automation | Mock connector/governance foundation only; durable jobs, exact parameter approvals and verified execution remain |
| Assets / KB | Existing asset acknowledgement and read-only KB workflows; full lifecycle/editor/review/version features remain |
| Notifications | Local queue; separate worker holds its own JSON snapshot and is unsafe for concurrent production writes |
| Health | Local/mock modes explicit; real dependency probes, worker heartbeat, metrics and alerting remain |
| Deployment | Infrastructure templates exist; full CI, dependency review, backup/restore and deployment acceptance remain |

Do not deploy this development slice as production. All real AD/mail writes remain disabled. No destructive migration or technical identifier rename was made. Seed organizations and policies require internal approval before real use.

Next priority: complete live authentication and transactional persistence before expanding privileged operations. Preserve existing development behavior as an explicit test mode and migrate data safely. Source SRS/task list and organization configuration need validation; current repository documents are the only available requirement sources beyond the supplied master request.
