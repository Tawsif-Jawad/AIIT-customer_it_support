# AIIT System Architecture

> Verified runtime correction (2026-11-08): The running frontend and API use Node HTTP and local JSON storage. Next.js, NestJS, PostgreSQL/Prisma and BullMQ entries below describe intended/scaffolded architecture. Live RS256/JWKS OIDC and Redis are not implemented. Development HMAC authentication is disabled in production; see IMPLEMENTATION_STATUS.md.
**Project:** Enterprise Multi-SBU AI-Powered IT Support System

## 1. High-Level Topology
The platform is organized as a modular TypeScript monorepo (`pnpm` workspaces) avoiding premature microservice complexity while maintaining clean domain boundaries:

```
Cutomer_IT_Support_System/
├── apps/
│   ├── web/          # Enterprise Portal UI (Next.js App Router + Accessible Web Server & API Proxy)
│   ├── api/          # Modular REST API, RBAC Guard, State Machine, OpenAPI 3.1, Prisma Schema
│   └── worker/       # Background Notification & SLA Queue Processor (BullMQ / Resilient Local Queue)
├── packages/
│   ├── shared/       # Domain Models, RBAC Policies, Ticket State Machine, Schema Validators, Redactor
│   └── connectors/   # AD Adapter, Self-Hosted Mail & Mailbox Provisioning Adapters, AI Policy Engine
├── infra/            # Docker Compose (PostgreSQL 16, Redis 7, Keycloak 26, Mailpit) & Realm Blueprint
├── docs/             # Enterprise Architecture, Security, Integration & Operational Documentation
└── tests/            # Unit, Full-Stack Integration, and Playwright E2E Browser Suites
```

## 2. Data & Control Flow
1. **Authentication**: Users authenticate via Keycloak OIDC (`/realms/upstra-enterprise`) or the development OIDC identity provider (`POST /api/auth/login`), receiving a locally signed development JWT (`HS256`; production JWKS flow remains unimplemented) carrying `sub`, `role`, `sbuId`, and `sbuCode`.
2. **Ticket Submission & AI Triage (`POST /api/tickets`)**:
   - Input is validated by `validateCreateTicketInput`.
   - Ticket is persisted in `NEW` state, transitioned through `TRIAGED` to `AI_HANDLING`.
   - Untrusted ticket text is scrubbed of secrets/tokens via `redactSensitiveData`.
   - `DeterministicMockAIOrchestrator` evaluates the ticket against approved Knowledge Base articles and the `TYPED_TOOL_REGISTRY`.
   - **Low-risk eligible issues** (e.g., Outlook TLS setup, Wi-Fi/DNS check) transition to `RESOLVED_PENDING_CONFIRMATION` with step-by-step guidance.
   - **Privileged, uncertain, or high-severity issues** (e.g., AD group changes, mailbox provisioning, hardware outages) create an `Approval` record if required and route to `ASSIGNED_TO_IT`.
3. **IT Queue & CTO Escalation**:
   - IT Administrators work tickets in `ASSIGNED_TO_IT` / `IN_PROGRESS` and can escalate critical or unresolved tickets via `POST /api/tickets/:id/escalate-cto` to `ESCALATED_TO_CTO`.
   - The CTO reviews cross-SBU escalations and pending executive approvals.
4. **Resilience & Graceful Degradation**:
   - If the AI provider, Redis broker, or SMTP server is unreachable, ticket creation and state transitions still succeed transactionally; notifications remain safely `QUEUED` for retry.
