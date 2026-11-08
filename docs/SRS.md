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
