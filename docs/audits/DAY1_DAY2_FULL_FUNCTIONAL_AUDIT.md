# Day 1 / Day 2 complete functional audit

Date: 2026-11-09. Overall verdict: **PARTIAL**. Verified development behavior passes after 11 fixes. Production integrations, complete enterprise foundations and hosted acceptance are not complete.

Base: `755ca6067ae038e44914d8642404eae32d6e32f8`, latest remediation branch; separate branch `audit/day1-day2-full-functional-review`. Clean tree at start. PR #2 remains draft/unmerged and unchanged by this audit. Historical documentation describes earlier states; this report and feature inventory describe the measured current state. Reviewed source, SRS/decisions, architecture, role matrix, prior baseline/Day 2 reports, testing and debt; no Day 3 features added.

## Feature acceptance

67 capabilities: **PASS: 37**, **MOCK: 5**, **NOT IMPLEMENTED: 6**, **DISABLED: 6**, **PARTIAL: 11**, **BLOCKED: 2**. Counts include absent requirements deliberately separated from functioning code. No unresolved reproducible BROKEN implementation remains among exercised cases; PARTIAL does not mean production-complete. See [complete feature inventory](DAY1_DAY2_FEATURE_INVENTORY.md) for per-feature source, role, route, UI, dependency, expected result and evidence. These are scoped test observations, not proof that every conceivable input works.

## Runtime and startup

Native Node HTTP API and server-rendered web shell/proxy with browser controllers; shared policy/types; deterministic connectors; API-inline local queue; lease/CAS/atomic JSON persistence. Prisma schema/migrations/importer are a separate real PostgreSQL foundation. Runtime does not use PostgreSQL. Standalone JSON worker and destructive seed are disabled. Health truthfully labels mock operation and does not probe enterprise dependencies.

Clean temporary install/start/health/login/restart passed; final compiler, lint, build and locked dependencies passed. See clean-startup.json and the final test report. Local host services were not substituted for enterprise functionality.

## Roles and workflows

Customer/employee: own tickets within current SBU, public comments, authorized confirmation/reopen, scoped notifications and owned assets; cannot see internal notes, privileged approvals/audit or escalate/perform IT transitions. IT admin/CTO: approved global organizational visibility, IT transitions/internal notes/approval decisions and audit; CTO resolves escalated cases under backend policy. System service cannot log in interactively. No general impersonation endpoint or live action execution exists. Session expiry, revocation/replay, current-role lookup and production-mode rejection are covered by security tests.

Verified AI lifecycle NEW→TRIAGED→AI_HANDLING→RESOLVED_PENDING_CONFIRMATION→CLOSED; rejection/fallback→ASSIGNED_TO_IT→IN_PROGRESS→resolution/confirmation; escalation→ESCALATED_TO_CTO→CTO resolution; reopening and exceptional AWAITING_USER/AWAITING_APPROVAL/FAILED_RETRY supported by backend graph tests. Invalid/unauthorized transitions do not commit changes. Event/audit/notification persistence and restart tested with disposable data. Exceptional states lack dedicated complete UI controls. Automatic initial assignment works; manual reassignment is absent. Assets support scoped view and acknowledgment, not a complete issue/return/CRUD workflow.

## API inventory and evidence

All operations below are exercised by tests/audit.test.ts and existing integration/security suites; global OPTIONS/CORS and proxy behavior are also tested. Counts indicate operation coverage, not exhaustive combinations. Source app.ts is authoritative.

| Method | Route | Verified scope |
|---|---|---|
| GET | `/api/health` | Public; mock/development health, not real dependency readiness |
| GET | `/api/openapi.json` | Public route index; incomplete schemas |
| GET | `/api/auth/identities` | Development only; excludes system service |
| POST | `/api/auth/login` | Opt-in identity validation, invalid payload/identity rejected |
| POST | `/api/auth/logout` | Revocation and malformed-cookie safety |
| GET | `/api/auth/me` | Session validity/current identity |
| GET | `/api/catalog` | Authenticated catalog |
| GET | `/api/kb` | Approved KB filter |
| GET | `/api/tickets` | Ownership/SBU and filters/pagination |
| POST | `/api/tickets` | Trusted actor/SBU, validation, AI handoff |
| GET | `/api/tickets/:id` | Ownership and missing resource |
| POST | `/api/tickets/:id/transition` | Actor/state policy, persistence/invalid mutation |
| POST | `/api/tickets/:id/escalate-cto` | Privileged escalation/reason |
| POST | `/api/tickets/:id/comments` | Public/internal note permissions and bounds |
| GET | `/api/approvals` | Privileged queue |
| POST | `/api/approvals/:id/decide` | Required rationale, one-time decisions |
| GET | `/api/assets` | Scoped custody view |
| POST | `/api/assets/:id/acknowledge` | Ownership, lifecycle guard, repeat safety |
| GET | `/api/notifications` | Scoped messages and delivered aggregate |
| GET | `/api/analytics/summary` | Scoped counts |
| GET | `/api/audit-logs` | Privileged audit visibility |
| GET | `/api/connectors/ad/lookup` | Role restricted, deterministic lookup |

Unknown routes/wrong methods return404; authenticated invalid fields400, denied roles403, missing/scoped resources404 where designed, conflicts409 and rate limit429 tested. Inputs are bounded and server identity overrides spoofed actor/SBU fields. OpenAPI is a route listing, not a complete payload schema contract.

## AI and integrations

Classification, confidence, KB matching, tool output and response generation are deterministic MOCKS; no LLM provider call verified. HIGH/CRITICAL floors and human fallback, allowlisted tools, policy denials, injection/redaction fixtures, approval requirements and mock dryRun are tested. Redaction is heuristic, not universal DLP. AD/mailbox writes cannot execute; approval does not activate a live executor. Mail is an in-memory/mock delivery log. Mailpit stub now reports unavailable/undelivered rather than false success; API configuration remains mock-only. No live SMTP, corporate AD or IdP modification occurred.

## Persistence and reliability

Validated JSON entities, references, IDs, atomic replacement, request lease/CAS and rollback are real. Removed read-only fsync/rename while retaining conflict checks. Failed mock notifications retry on an explicit later processing cycle and transport exceptions are sanitized; there is no durable scheduled backoff/worker. Asset acknowledgment validates lifecycle and repeats without duplicated history. Audit is mutable local JSON, not tamper-proof. Disposable PostgreSQL migration/import/backup-restore passes with prefixed TEXT IDs; production runtime cutover absent. Concurrency/corruption/interrupted-process tests do not certify hardware power-loss recovery, distributed operation or production load.

## UI and accessibility

17 browser cases cover four roles, all principal workspace panels and workflows, recovery feedback, pagination, filters and navigation. Fixed logout failure feedback and stale detail race; preserved design. Screenshots include significant before defects and final states at 320/390/768/1440. Keyboard focus/menu Escape and sampled contrast passed. Per-case network/console observations retained; initial401 and injected503 are expected. No unexplained page JS error in exercised cases. Full assistive-technology audit, every color combination, real TLS proxy and long-running performance are unverified.

## Security and public exposure

Logout revokes sessions, production rejects dev authentication, role/SBU controls are backend-enforced, approvals are one-time, origin/CSRF/CORS/body bounds and cookie/token behavior are covered by tests. Requester notification aggregates now respect recipient scope. Existing approved IT/CTO global scope was preserved. A public-history scan of425 reachable objects/249 blobs found no high-confidence credential-pattern matches or tracked operational/config/key files. This is not exhaustive certification. Known supplied mailbox/business identifiers and unconfirmed demo staff/domain fixtures remain in public source/history; owner privacy/minimization review is required. Do not assume all names are synthetic. No actual live secret was established; no credential rotation or history rewrite is claimed.

## Findings, limitations and gates

AU01–AU11 are detailed with reproductions and evidence in [tuning report](DAY1_DAY2_TUNING_REPORT.md): seven P1/four P2 fixed, no new P0 confirmed. Major remaining foundations: enterprise OIDC, runtime PostgreSQL, durable workers/readiness/audit protection, full asset lifecycle, attachments, manual reassignment, SLA daemon, richer customer membership model and category forms. Integration absence is recorded as absent/disabled/mock rather than passing.

A. Existing development correctness: verified exercised behavior passes, overall breadth PARTIAL.
B. Day 2 milestone acceptance: BLOCKED until required hosted checks actually execute and pass. Audit-branch run42610675825 at e123c94 failed all four jobs with zero steps and explicit account billing-lock annotations (evidence/day1-day2/hosted-audit-run.json); user Support submission does not establish resolution. CircleCI unconnected. No protection bypass/payment action.
C. Production readiness: NO. Day 3 may proceed as isolated development against documented policy, with acceptance/production gates still open. Do not deploy enterprise traffic or claim release acceptance.

[Final executed commands and evidence](../testing/DAY1_DAY2_FINAL_TEST_REPORT.md). Operational JSON and .env hashes remained unchanged.
