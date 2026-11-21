# Day 1 / Day 2 complete capability inventory

Audit date: 9 November 2026. Base: `755ca6067ae038e44914d8642404eae32d6e32f8`, branch `audit/day1-day2-full-functional-review`. This is a capability-level inventory, not a claim that each module is enterprise complete. Required-but-missing capabilities are included explicitly; totals do not mean all are implemented.

**67 capabilities:** BLOCKED 2, DISABLED 6, MOCK 5, NOT IMPLEMENTED 6, PARTIAL 11, PASS 37. A PASS applies only to the exact described scope and executed evidence. MOCK/DISABLED are not production success.

[Machine-readable full inventory](evidence/day1-day2/feature-inventory.json). Test evidence: [full test report](../testing/DAY1_DAY2_FINAL_TEST_REPORT.md); [API audit](evidence/day1-day2/api-audit.log); [browser audit](evidence/day1-day2/browser-audit.log).

| ID | Capability / roles | Implementation | Result | Expected behavior and material limit | Executed evidence or reason |
|---|---|---|---|---|---|
| CAP-001 | Public landing and links / Public | REAL | PASS | Brand/links render; hash targets resolve; preserve existing identity | tests/e2e/audit.spec.ts responsive cases; tests/ui.test.ts |
| CAP-002 | Static asset allowlist / Public | REAL | PASS | Known assets serve; unknown paths return 404 | clean-startup.json; tests/ui.test.ts |
| CAP-003 | Responsive navigation and keyboard / All human roles | REAL | PASS | 320/390/768/1440 widths avoid page overflow; Escape/focus and ticket Enter work | tests/e2e/audit.spec.ts |
| CAP-004 | Development email sign-in/identity list / Demo human roles | MOCK | MOCK | Explicit opt-in local HMAC identity; no corporate credential verification | tests/audit.test.ts API inventory; tests/e2e/audit.spec.ts |
| CAP-005 | Enterprise OIDC/AD authentication / Human roles | NOT IMPLEMENTED | NOT IMPLEMENTED | Code/PKCE/JWKS/LDAPS are designed, not connected | Source/route inventory; production denial tests |
| CAP-006 | Current user and session restoration / Human roles | REAL | PASS | Digest allowlist plus current active user; cookie survives API restart | tests/security.test.ts; tests/e2e/audit.spec.ts; clean-startup.json |
| CAP-007 | Expiry, revocation and role changes / Human roles | REAL | PASS | Expired/revoked/disabled/service identities fail closed; current role overrides old claim | tests/security.test.ts; tests/day2.test.ts |
| CAP-008 | Logout and failure feedback / Human roles | REAL | PASS | Successful logout invalidates digest; failed logout stays visibly active and offers retry | tests/audit.test.ts AU10; tests/e2e/audit.spec.ts AU08; tests/day2.test.ts F03 |
| CAP-009 | Ownership and current SBU authorization / Employee/customer; explicit global IT/CTO | REAL | PASS | Owner+SBU restrictions and explicit organization-wide IT/CTO grants remain | tests/security.test.ts; tests/audit.test.ts actor/asset cases; tests/unit.test.ts |
| CAP-010 | Interactive service access denial / SYSTEM_SERVICE | DISABLED | DISABLED | Service role cannot log in or impersonate a human | tests/security.test.ts service conversion; tests/day2.test.ts service access |
| CAP-011 | Service catalog / Human roles | REAL | PASS | Six configured demo categories display and start requests | tests/audit.test.ts catalog; tests/e2e/audit.spec.ts catalog start |
| CAP-012 | Category-specific form metadata / Human roles | PARTIAL | PARTIAL | Catalog defines custom fields; UI renderer and category-required enforcement absent | Source inspection; generic/custom payload validation tests |
| CAP-013 | Approved KB search/read / Human roles | REAL | PASS | Only approved articles returned; UI query and content load | tests/audit.test.ts KB filtering; tests/e2e/audit.spec.ts KB search |
| CAP-014 | Ticket submission and actor binding / Human roles | REAL | PASS | Validation, trusted actor/SBU, events/audit/notification and persistence | tests/audit.test.ts creation/negative fields; tests/e2e/audit.spec.ts creation |
| CAP-015 | Ticket list, search and filters / Scoped human roles | REAL | PASS | Scoped results, search/status/severity/SBU filtering | tests/audit.test.ts listing; tests/e2e/audit.spec.ts filters |
| CAP-016 | Ticket pagination / Scoped human roles | REAL | PASS | Page boundaries, finite integer validation and keyboard activation | tests/audit.test.ts AU06; tests/e2e/audit.spec.ts pagination |
| CAP-017 | Ticket detail and timeline / Scoped human roles | REAL | PASS | Committed detail/history shown; older response cannot replace newer selection | tests/audit.test.ts lifecycle; tests/e2e/audit.spec.ts AU09 |
| CAP-018 | Public ticket comments / Ticket owner; IT/CTO | REAL | PASS | Length/ownership validation, redacted comment and history persist | tests/audit.test.ts comments/negatives; tests/e2e/audit.spec.ts employee lifecycle |
| CAP-019 | Internal notes / IT/CTO | REAL | PASS | Human requester cannot set internal privilege or read note body | tests/audit.test.ts lifecycle; tests/e2e/audit.spec.ts IT internal note |
| CAP-020 | AI classifier and knowledge recommendations / Ticket submitter | MOCK | MOCK | Fixed keyword/category/confidence outputs, not a live LLM | tests/unit.test.ts; tests/audit.test.ts dryRun; tests/integration.test.ts |
| CAP-021 | Fixed diagnostic tools / Internal mock orchestrator | MOCK | MOCK | Fixture diagnostics are dry-run simulations; privileged tools stay blocked | tests/unit.test.ts; tests/audit.test.ts mock integrations |
| CAP-022 | Secret redaction and injection screening / All ticket actors | PARTIAL | PARTIAL | Heuristic redaction/denylist passes fixed canaries; not comprehensive DLP/prompt defense | tests/unit.test.ts; tests/security.test.ts; tests/day2.test.ts sensitive notes |
| CAP-023 | Severity floor and human routing / All ticket actors | REAL | PASS | Higher classifier/requested severity preserved; HIGH/CRITICAL enters IT | tests/day2.test.ts F10 plus audit/AI-log assertions |
| CAP-024 | AI unavailability fallback / All ticket actors | REAL | PASS | Simulated provider failure retains request and routes to IT | tests/integration.test.ts case 9 |
| CAP-025 | Proposed resolution workflow / Requester; IT/CTO | REAL | PASS | Safe proposal reaches RESOLVED_PENDING_CONFIRMATION with events | tests/e2e/audit.spec.ts employee lifecycle; tests/audit.test.ts |
| CAP-026 | Requester closure confirmation / Requester under current policy | REAL | PASS | Unresolved escalation cannot close; confirmed proposal can close | tests/day2.test.ts F05; tests/security.test.ts matrix; tests/e2e/audit.spec.ts |
| CAP-027 | Ticket reopening and IT return / Requester | REAL | PASS | Reject proposal routes to IT; closed ticket may reopen with graph checks | tests/audit.test.ts lifecycle; tests/e2e/audit.spec.ts customer rejection |
| CAP-028 | IT progress and resolution / IT/CTO | REAL | PASS | Human queue work and proposed resolution obey graph | tests/audit.test.ts lifecycle; tests/e2e/audit.spec.ts role flow |
| CAP-029 | CTO escalation and review / IT initiates; CTO resolves | REAL | PASS | Reason/role validation, critical escalation, CTO-only escalated-state changes | tests/audit.test.ts lifecycle; tests/e2e/audit.spec.ts CTO queue/resolve |
| CAP-030 | Exceptional lifecycle states / IT/CTO | PARTIAL | PARTIAL | AWAITING_USER/APPROVAL/FAILED_RETRY graph persists; dedicated UI controls absent | tests/audit.test.ts exceptional states; tests/security.test.ts 720 pairs |
| CAP-031 | Automatic initial IT assignment / Workflow system | REAL | PASS | Unresolved requests receive the current first configured IT user | tests/audit.test.ts assignee assertion |
| CAP-032 | Manual assignment/reassignment / IT/CTO | NOT IMPLEMENTED | NOT IMPLEMENTED | No supported reassignment API/UI | Route/source inventory |
| CAP-033 | Approval queue/history / IT/CTO | REAL | PASS | Authorized queue and ticket history render | tests/audit.test.ts approval queue; tests/e2e/audit.spec.ts approve workflow |
| CAP-034 | One-time approval decisions / Required IT/CTO role | REAL | PASS | Rationale, required role and PENDING-only mutation; opposing decisions serialize | tests/day2.test.ts F04/opposing decisions; tests/e2e/audit.spec.ts |
| CAP-035 | Live privileged action execution / No authorized executor | DISABLED | DISABLED | No exact-action infrastructure execution is enabled | tests/audit.test.ts approval cannot enable AD/mail writes; tests/unit.test.ts |
| CAP-036 | Scoped asset inventory / Assigned employee/customer; global IT/CTO | REAL | PASS | Assigned identity/SBU filtering; privileged scope preserved | tests/security.test.ts asset SBU; tests/e2e/audit.spec.ts employee/customer |
| CAP-037 | Custody acknowledgement / Assigned user or authorized IT/CTO | REAL | PASS | Only pending assigned handover; repeat acknowledgement is idempotent | tests/audit.test.ts AU01/AU02; tests/e2e/audit.spec.ts assets |
| CAP-038 | Full asset handover/takeover management / IT/CTO | PARTIAL | PARTIAL | Read/ack exists; issue/return/reassign/admin lifecycle absent | Route and UI inventory |
| CAP-039 | Attachment upload/storage / Ticket actors | NOT IMPLEMENTED | NOT IMPLEMENTED | Metadata does not provide file storage/upload | Source/UI inventory |
| CAP-040 | Scoped notification feed / Own user; global IT/CTO | REAL | PASS | Own records and own mock counter; authorized broader IT view | tests/audit.test.ts AU11; tests/e2e/audit.spec.ts notifications |
| CAP-041 | Notification mail delivery / Local mock only | MOCK | MOCK | In-memory mock transport, no verified SMTP send | tests/audit.test.ts AU04/AU05; tests/integration.test.ts |
| CAP-042 | Notification retry/recovery / API local processor | PARTIAL | PARTIAL | Local FAILED jobs retry on explicit/next processing cycle; no durable broker/backoff scheduler | tests/audit.test.ts AU05 plus thrown-transport recovery |
| CAP-043 | Scoped analytics/dashboard metrics / Human roles | REAL | PASS | Metrics derive only from authorized tickets/approvals | tests/audit.test.ts API inventory; tests/day2.test.ts actor scope; tests/e2e/audit.spec.ts |
| CAP-044 | Audit history and admin visibility / IT/CTO | PARTIAL | PARTIAL | Atomic local history and role guards; mutable JSON is not immutable audit | tests/audit.test.ts lifecycle/audit; tests/e2e/audit.spec.ts CTO audit |
| CAP-045 | Health/readiness summary / Public; admin detail | PARTIAL | PARTIAL | Local/mock status responds; no real dependency/heartbeat readiness proof | clean-startup.json; tests/integration.test.ts |
| CAP-046 | Directory record/group lookup / IT/CTO | MOCK | MOCK | Fixture lookup/groups; no live LDAPS/authentication | tests/audit.test.ts AD lookup positive/negative |
| CAP-047 | Production AD writes / Disabled | DISABLED | DISABLED | Even supplied approval cannot execute a directory write | tests/audit.test.ts mock integration boundaries; tests/unit.test.ts |
| CAP-048 | Mailbox provisioning / Disabled | DISABLED | DISABLED | Creation remains unconfigured even with approval | tests/audit.test.ts mock integration boundaries; tests/unit.test.ts |
| CAP-049 | JSON request transactions/concurrency / API owner | REAL | PASS | Lease/reload/CAS/atomic replacement and rollback; reads skip replacements | tests/day2.test.ts concurrency/write failures; tests/audit.test.ts AU03; performance JSON |
| CAP-050 | Record schema/reference validation / Store/importer | REAL | PASS | Types, nested records, natural keys, historical refs and session IDs checked | tests/integrity.test.ts; tests/day2.test.ts invalid records |
| CAP-051 | Crash/backup recovery controls / Operator | PARTIAL | PARTIAL | Synthetic restore/SIGKILL prove containment; manual recovery/power-loss limits remain | tests/integrity.test.ts; tests/database.test.ts |
| CAP-052 | PostgreSQL compatibility/import foundation / Developer | REAL | PASS | Text IDs, real migrations/parity, idempotent import/conflicts and backup/restore | tests/database.test.ts; final verification logs |
| CAP-053 | Runtime PostgreSQL repository / Future runtime | NOT IMPLEMENTED | NOT IMPLEMENTED | DATABASE_URL does not switch active API storage | Source/current architecture |
| CAP-054 | Pinned toolchain/local verifier / Developer | REAL | PASS | Actual install/tsc/ESLint/build/tests/audit, fail-closed evidence | Full verifier summary; tests/integrity.test.ts verifier fault |
| CAP-055 | GitHub hosted required pipeline / Developer | PARTIAL | BLOCKED | Configured real checks but account lock prevents runner steps | Latest GitHub run annotations; no required-check bypass |
| CAP-056 | CircleCI alternative / Developer | PARTIAL | BLOCKED | Provider config is not authorized/active or formally equivalent | day2-no-cost evidence; no provider execution |
| CAP-057 | Destructive seed reset / Disabled | DISABLED | DISABLED | Seed refuses before touching operational storage | tests/day2.test.ts reset denial; prior exact command evidence |
| CAP-058 | Standalone JSON worker / Disabled | DISABLED | DISABLED | Independent snapshot writer deliberately exits; inline API mock processor remains | Prior worker exit evidence; cross-process exclusion tests |
| CAP-059 | Autonomous SLA monitoring/escalation / Future service | NOT IMPLEMENTED | NOT IMPLEMENTED | Stored SLA due dates do not prove automatic monitoring | Source/worker inventory |
| CAP-060 | Clean startup/shutdown/restart / Developer | REAL | PASS | Frozen clean install, startup/assets, login, restart/session retention and shutdown | clean-startup.json |
| CAP-061 | Production development-auth denial / Deployment guard | REAL | PASS | Missing opt-in/production/non-dev mode rejects local authentication | tests/recovery.test.ts; tests/security.test.ts |
| CAP-062 | Loading/empty/error feedback / Human roles | REAL | PASS | Measured primary panel failure/retry, empty assets and logout errors | tests/e2e/audit.spec.ts panel retry/customer assets/AU08; full loading race regression |
| CAP-063 | HTTP proxy and HTTPS boundary / Web/API | PARTIAL | PARTIAL | HTTP proxy works/timeouts; HTTPS module configured but no real TLS fixture in this audit | clean-startup.json; tests/ui.test.ts; source protocol check |
| CAP-064 | OpenAPI endpoint index / Developer | PARTIAL | PARTIAL | Route summary exists; not a complete typed API/security specification | tests/audit.test.ts public endpoint; source inspection |
| CAP-065 | Expanded memberships/customer organizations / Future approved policy | NOT IMPLEMENTED | NOT IMPLEMENTED | Existing global IT grant preserved; narrower multi-membership policy unapproved | SRS/permission matrix/source inventory |
| CAP-066 | Assistant request UI / Human roles | REAL | PASS | Creates actual scoped ticket and displays explicitly mock recommendation | tests/e2e/audit.spec.ts assistant/catalog flow |
| CAP-067 | Public repository exposure review / Owner/security | PARTIAL | PARTIAL | No high-confidence credential pattern hits; known mailbox/demo identity evidence needs owner privacy review | public-history-scan.json; no history rewrite |

## Source, API, dependency and UI mapping

| ID | Source files | API/entrypoint | Dependencies | UI location |
|---|---|---|---|---|
| CAP-001 | apps/web/src/landing.ts | GET / | Native Node / validated JSON | Landing |
| CAP-002 | apps/web/src/server.ts; apps/web/public/* | GET /assets/{design.css,portal.js,public.js,grain.svg,atmosphere.svg} | Native Node / validated JSON | Landing/workspace |
| CAP-003 | apps/web/src/server.ts; apps/web/public/portal.js | None | Native Node / validated JSON | Sidebar/menu |
| CAP-004 | apps/api/src/auth.ts; apps/api/src/app.ts | GET /api/auth/identities; POST /api/auth/login | Native Node / validated JSON | Login |
| CAP-005 | infra/keycloak/*; docs/architecture/AUTHENTICATION_AUTHORIZATION.md | No live authentication route | Approved IdP/directory infrastructure unavailable | Not active |
| CAP-006 | apps/api/src/app.ts; apps/api/src/auth.ts | GET /api/auth/me | Native Node / validated JSON | User header/reload |
| CAP-007 | apps/api/src/app.ts; apps/api/src/auth.ts | GET /api/auth/me; protected routes | Native Node / validated JSON | Session boundary |
| CAP-008 | apps/api/src/app.ts; apps/web/src/server.ts | POST /api/auth/logout | Native Node / validated JSON | Sign Out |
| CAP-009 | packages/shared/src/index.ts; apps/api/src/app.ts | Protected ticket/asset routes | Native Node / validated JSON | All workspace panels |
| CAP-010 | apps/api/src/app.ts; packages/shared/src/index.ts | POST login; protected routes | Native Node / validated JSON | No interactive service portal |
| CAP-011 | apps/api/src/app.ts; apps/web/src/server.ts | GET /api/catalog | Native Node / validated JSON | Catalog/create selector |
| CAP-012 | apps/api/src/store.ts; packages/shared/src/index.ts | GET catalog; POST tickets | Native Node / validated JSON | Generic creation form |
| CAP-013 | apps/api/src/app.ts; apps/web/public/portal.js | GET /api/kb?q= | Native Node / validated JSON | Knowledge Base |
| CAP-014 | apps/api/src/app.ts; apps/web/src/server.ts | POST /api/tickets | Native Node / validated JSON | Create request |
| CAP-015 | apps/api/src/app.ts; apps/web/src/server.ts | GET /api/tickets?search=&status=&severity=&sbuId= | Native Node / validated JSON | Tickets/queue |
| CAP-016 | apps/api/src/app.ts; apps/web/public/portal.js | GET tickets?page=&pageSize= | Native Node / validated JSON | Previous/Next |
| CAP-017 | apps/api/src/app.ts; apps/web/src/server.ts | GET /api/tickets/:id | Native Node / validated JSON | Detail panel |
| CAP-018 | apps/api/src/app.ts; apps/web/public/portal.js | POST /api/tickets/:id/comments | Native Node / validated JSON | Conversation |
| CAP-019 | apps/api/src/app.ts; apps/web/public/portal.js | POST comments; GET detail | Native Node / validated JSON | Internal checkbox |
| CAP-020 | packages/connectors/src/index.ts | POST tickets invokes deterministic provider | Approved KB fixtures only | AI suggestion panel |
| CAP-021 | packages/connectors/src/index.ts TYPED_TOOL_REGISTRY | No arbitrary tool API | No network diagnostics or infrastructure execution | Suggested fixes |
| CAP-022 | packages/shared/src/index.ts; packages/connectors/src/index.ts | Ticket/comment/transition flows | Native Node / validated JSON | Input/recommendation boundary |
| CAP-023 | apps/api/src/app.ts | POST /api/tickets | Native Node / validated JSON | Severity/status |
| CAP-024 | packages/connectors/src/index.ts; apps/api/src/app.ts | POST tickets | Native Node / validated JSON | IT handoff |
| CAP-025 | packages/shared/src/index.ts; apps/api/src/app.ts | POST tickets/transition | Native Node / validated JSON | AI/IT proposal |
| CAP-026 | apps/api/src/app.ts; packages/shared/src/index.ts | POST tickets/:id/transition | Native Node / validated JSON | Confirm Resolution & Close |
| CAP-027 | apps/api/src/app.ts; apps/web/src/server.ts | POST transition REOPENED | Native Node / validated JSON | Unresolved button |
| CAP-028 | apps/api/src/app.ts; apps/web/src/server.ts | POST transition | Native Node / validated JSON | Start IT Progress/Propose Resolution |
| CAP-029 | apps/api/src/app.ts; apps/web/src/server.ts | POST tickets/:id/escalate-cto; POST transition | Native Node / validated JSON | CTO queue/detail |
| CAP-030 | packages/shared/src/index.ts; apps/api/src/app.ts | POST transition | Native Node / validated JSON | Status display/filter subset |
| CAP-031 | apps/api/src/app.ts | POST tickets | Native Node / validated JSON | IT queue |
| CAP-032 | No route/handler | Not implemented | Native Node / validated JSON | No assignment control |
| CAP-033 | apps/api/src/app.ts; apps/web/src/server.ts | GET /api/approvals | Native Node / validated JSON | Approval center |
| CAP-034 | apps/api/src/app.ts | POST /api/approvals/:id/decide | Native Node / validated JSON | Approve/Reject + rationale |
| CAP-035 | packages/connectors/src/index.ts | No real execution route | Native Node / validated JSON | Approval does not enable infrastructure writes |
| CAP-036 | apps/api/src/app.ts; apps/web/src/server.ts | GET /api/assets | Native Node / validated JSON | Equipment/custody |
| CAP-037 | apps/api/src/app.ts; apps/web/src/server.ts | POST /api/assets/:id/acknowledge | Native Node / validated JSON | Acknowledge Custody |
| CAP-038 | Asset model/history only | No CRUD/handover mutation routes | Native Node / validated JSON | List/ack only |
| CAP-039 | Comment metadata type only | No upload route | Native Node / validated JSON | No file control |
| CAP-040 | apps/api/src/app.ts; apps/web/public/portal.js | GET /api/notifications | Native Node / validated JSON | Notifications/Refresh updates |
| CAP-041 | packages/connectors/src/index.ts; apps/api/src/queue.ts | Inline mock send | Native Node / validated JSON | SENT means simulated |
| CAP-042 | apps/api/src/queue.ts | processPendingJobs, no public retry route | Native Node / validated JSON | FAILED/SENT feed |
| CAP-043 | apps/api/src/app.ts; apps/web/public/portal.js | GET /api/analytics/summary | Native Node / validated JSON | Overview/metrics |
| CAP-044 | apps/api/src/app.ts; apps/api/src/store.ts | GET /api/audit-logs | Native Node / validated JSON | Audit/monitoring |
| CAP-045 | apps/api/src/app.ts | GET /api/health | Native Node / validated JSON | Health pill/retry/audit |
| CAP-046 | packages/connectors/src/index.ts; apps/api/src/app.ts | GET /api/connectors/ad/lookup | Native Node / validated JSON | API only |
| CAP-047 | packages/connectors/src/index.ts | No live write route | Native Node / validated JSON | None |
| CAP-048 | packages/connectors/src/index.ts | No real provisioning route | Native Node / validated JSON | Catalog request routes to IT |
| CAP-049 | apps/api/src/store.ts; apps/api/src/app.ts | All operations | Native Node / validated JSON | Persistence boundary |
| CAP-050 | apps/api/src/store.ts; apps/api/src/persistence-schema.ts | All store writes and migration validation | Native Node / validated JSON | Backend |
| CAP-051 | docs/architecture/PERSISTENCE_RECOVERY.md; apps/api/src/store.ts | Offline controlled recovery | Native Node / validated JSON | No automatic lock stealing |
| CAP-052 | apps/api/prisma/*; scripts/json-import.ts | Separate disposable rehearsal | Disposable local PostgreSQL 18.6; Prisma 6.19.3 | Not runtime storage |
| CAP-053 | No API database repository | Not wired | Native Node / validated JSON | None |
| CAP-054 | package.json; pnpm-lock.yaml; scripts/verify-local.ts | No cloud/status API | Native Node / validated JSON | CLI |
| CAP-055 | .github/workflows/verify.yml; .github/actions/setup/action.yml | GitHub Actions | GitHub account unlock pending Support | PR checks |
| CAP-056 | .circleci/config.yml; docs/ci/* | No connected provider | Native Node / validated JSON | Prepared configuration only |
| CAP-057 | apps/api/src/prisma/seed.ts | CLI only | Native Node / validated JSON | No reset UI |
| CAP-058 | apps/worker/src/main.ts | CLI only | Native Node / validated JSON | None |
| CAP-059 | No timer/worker implementation | Not implemented | Native Node / validated JSON | SLA date display only |
| CAP-060 | apps/web/src/server.ts; apps/api/src/main.ts | Real API/web entrypoints | Native Node / validated JSON | Disposable localhost |
| CAP-061 | apps/api/src/auth.ts; apps/api/src/app.ts | auth endpoints/protected routes | Native Node / validated JSON | Fail-closed production |
| CAP-062 | apps/web/src/server.ts; apps/web/public/portal.js | Panel/login/logout requests | Native Node / validated JSON | Loading, retry, empty assets |
| CAP-063 | apps/web/src/server.ts | /api/* proxy | Native Node / validated JSON | Browser-to-API |
| CAP-064 | apps/api/src/app.ts | GET /api/openapi.json | Native Node / validated JSON | API only |
| CAP-065 | One-SBU user model only | No membership management | Native Node / validated JSON | None |
| CAP-066 | apps/web/public/portal.js | POST /api/tickets | Native Node / validated JSON | AI Assistant |
| CAP-067 | Tracked source/docs/reachable history | No source mutation | Native Node / validated JSON | Public GitHub |

No independent live OIDC/AD/mail/PostgreSQL runtime connection, full asset lifecycle, manual reassignment, attachments or autonomous SLA service was discovered. Do not substitute a schema, declared package, simulated output or passing related happy path for those missing capabilities.
