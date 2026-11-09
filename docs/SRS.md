# Software Requirements Specification (SRS)
**Project:** Enterprise Multi-SBU AI-Powered IT Support System  
**Status:** Approved Baseline — Milestone 1 Implemented  
**Last Updated:** 2026-11-08

## 1. Purpose & Scope
The Enterprise IT Support System provides a unified, multi-SBU service desk, asset custody platform, and policy-governed AI triage engine for an enterprise organization operating across multiple Strategic Business Units (`SBU-TECH`, `SBU-FIN`, `SBU-CORP`, and future units). It supports Customers, Employees, IT Administrators, the Chief Technology Officer (CTO), and narrowly scoped System Service identities.

## 2. User Roles & Least-Privilege Access Model
| Role | Scope | Core Capabilities |
|---|---|---|
| `CUSTOMER` | Own requests within assigned SBU | Create authorized support requests, view own ticket status, add comments, view approved KB articles. |
| `EMPLOYEE` | Own tickets & assets within assigned SBU | Submit/track tickets, review AI troubleshooting suggestions, confirm or reject resolutions, inspect and digitally acknowledge assigned IT equipment custody. |
| `IT_ADMIN` | Cross-SBU operational scope | Manage IT queues, transition ticket states, decide IT-level approvals, manage asset handover/takeover, perform read-only AD lookups, escalate critical or unresolved tickets to the CTO. |
| `CTO` | Organization-wide executive scope | View cross-SBU SLA/ticket analytics, review the CTO Escalation Queue, approve/reject critical changes, resolve exceptional escalations, inspect immutable security audit logs. |
| `SYSTEM_SERVICE` | Non-interactive background tasks | Process queued notifications and execute policy-governed SLA checks. |

## 3. Core Functional Modules
1. **Authentication & Authorization**: Keycloak OpenID Connect (OIDC) login designed for LDAPS federation with on-premises Active Directory, paired with backend-enforced RBAC and SBU resource-level isolation.
2. **User & SBU Management**: Multi-SBU affiliation (`SBU-TECH`, `SBU-FIN`, `SBU-CORP`) with SLA tiers (`MISSION_CRITICAL`, `PRIORITY`, `STANDARD`).
3. **Configurable IT Service Catalog**:
   - Outlook & Mail Client Configuration (`outlook-configuration`)
   - Internet, Wi-Fi & VPN Connectivity (`internet-connectivity`)
   - IT Equipment Handover / Takeover (`equipment-handover`)
   - Official Self-Hosted Email Account Request (`email-provisioning`)
   - Active Directory Account & Permission Request (`ad-account-request`)
   - Critical Hardware / Infrastructure Incident (`hardware-incident`)
4. **Deterministic Ticket State Machine**:
   - Primary autonomous path: `NEW` -> `TRIAGED` -> `AI_HANDLING` -> `RESOLVED_PENDING_CONFIRMATION` -> `CLOSED`.
   - Human IT fallback path: `AI_HANDLING` -> `ASSIGNED_TO_IT` -> `IN_PROGRESS` -> `RESOLVED_PENDING_CONFIRMATION` -> `CLOSED`.
   - Executive escalation path: `ASSIGNED_TO_IT` / `IN_PROGRESS` -> `ESCALATED_TO_CTO`.
   - Additional supported states: `REOPENED`, `AWAITING_USER`, `AWAITING_APPROVAL`, `FAILED_RETRY`.
5. **AI Classification, Knowledge Retrieval & Governance**:
   - Provider-agnostic orchestration with PII/secret redaction, prompt-injection defense, deterministic policy engine, and typed low-risk diagnostic tool registry.
6. **Equipment Inventory & Handover/Takeover Custody**:
   - Tracks asset tag, serial number, SBU ownership, assigned employee, digital handover acknowledgment status, and custody history.
7. **Notifications & Resilient Queue Processing**:
   - Queues and delivers email and in-app notifications via a provider abstraction (`DevelopmentEmailTransport` / Mailpit / SMTP) that fails safely without losing tickets.

## Day 2 requirements and evidence (2026-11-09)

The earlier milestone label describes historical scope, not production acceptance or external sign-off. Current runtime is native Node HTTP + local JSON + explicitly opted-in development sessions. Production OIDC, multi-SBU memberships, immutable audit and resilient real mail are requirements/scaffolds, not implemented capabilities. Seed organizational structures are demo data.

| ID | Requirement and testable acceptance | Status / evidence |
|---|---|---|
| FR-D2-01 | Actor identity must be server verified; body role/SBU cannot grant privilege; missing dev opt-in denies login | Implemented; day2 test parallel requests/missing opt-in |
| FR-D2-02 | Employee/customer may list/read only own tickets in own SBU | Implemented existing shared policy; integration test 4 and day2 object authorization |
| FR-D2-03 | IT scope follows explicitly granted support assignments; current SRS grants global support | Existing global grant retained; narrower assignment model unresolved |
| FR-D2-04 | Only CTO may change escalated case state; closure requires proposed resolution | Implemented; F05 and object authorization tests |
| FR-D2-05 | AI failure enters IT queue; only authorized human escalation reaches CTO | Existing integration tests 5–7 pass; internal system triage narrowly bounded |
| FR-D2-06 | Approval requires authorized role, pending state and rationale; replay cannot change decision | Implemented; F04 and opposing-decision tests |
| FR-D2-07 | Approval must bind exact action parameters, expiry and segregation of duties before real privileged execution | Planned; actual AD/mail writes disabled |
| FR-D2-08 | Logout invalidates current bearer/cookie session; disabled accounts lose access | Implemented server digest allowlist; F03/account tests; production IdP revocation remains planned |
| FR-D2-09 | Record history/audit and notification intent with business changes; redact transition secrets | Implemented JSON request transaction and core redactor; failure/secret tests; immutable audit planned |
| NFR-D2-01 | Concurrent processes never silently replace committed records with stale snapshots | Implemented exclusive lease + stale CAS; F01 and child-process test |
| NFR-D2-02 | Failed pre-rename writes return failure, preserve source bytes and roll back memory | Implemented injected replacement-failure test; power-loss durability not proven |
| NFR-D2-03 | Invalid source core schemas/references fail closed; never reseed over existing records | Implemented core validator and reset rejection; full field validation outstanding |
| NFR-D2-04 | Recovery must preserve originals, validate backup and require quiesced writers | Runbook designed; synthetic restart tested; operational restore not executed |
| NFR-D2-05 | Enterprise persistence supports atomic business/audit/outbox transactions and durable worker retry | PostgreSQL target; schema/migration proposal; no DB execution |
| NFR-D2-06 | AD authentication uses verified LDAPS federation, least privilege and bounded revocation | Designed only; no live directory/IdP integration |
