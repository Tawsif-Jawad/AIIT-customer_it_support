# Architectural Decision Records (ADRs)
**Project:** Enterprise Multi-SBU AI-Powered IT Support System

## ADR-001: Modular Monorepo Over Microservices
- **Context**: The platform must support multiple SBUs, ticketing, asset management, AI triage, approvals, AD lookups, and notifications with high maintainability.
- **Decision**: Use a single TypeScript monorepo (`apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `packages/connectors`) sharing strict domain types and RBAC logic.
- **Consequences**: Eliminates distributed transaction drift and schema duplication while allowing `api`, `web`, and `worker` processes to scale independently in production.

## ADR-002: Dual-Mode Persistence & Native TypeScript Execution for Resilient Verification
- **Context**: Production requires PostgreSQL + Prisma migrations and Redis + BullMQ, while local sandboxed or air-gapped verification environments may lack Docker daemons or outbound registry access.
- **Decision**: Provide the complete Prisma schema (`apps/api/prisma/schema.prisma`), SQL migration (`20261108000000_init/migration.sql`), and `infra/docker-compose.yml` alongside a zero-dependency transactional persistence store (`EnterpriseDataStore`) and native Node.js TypeScript execution.
- **Consequences**: Developers can run the full stack either with Docker Compose (`Postgres + Redis + Keycloak + Mailpit`) or immediately with native `node` commands offline.

## ADR-003: Deterministic Policy Engine & Typed Tool Registry Ahead of AI Execution
- **Context**: Untrusted ticket content could contain prompt injections or requests for destructive actions (e.g., AD privilege escalation, unauthorized mailbox creation).
- **Decision**: Place a deterministic policy engine, secret redactor (`redactSensitiveData`), and static `TYPED_TOOL_REGISTRY` between the ticket workflow and the AI provider. Mark `privileged_ad_account_unlock` and `privileged_mailbox_provision` as `HIGH_PRIVILEGED` (`requiresHumanApproval: true`), and use `DeterministicMockAIOrchestrator` in Milestone 1 clearly labeled as a non-live simulation.
- **Consequences**: Guarantees AI cannot execute arbitrary commands, alter AD, or send unauthorized emails even if a live LLM adapter is attached in Milestone 2+.

## ADR-004: Strict Separation of SMTP Notification Transport and Mailbox Provisioning
- **Context**: `tawsif.zawad@upstra.com` is a known user email address, not a verified server configuration, and the self-hosted mail server platform is not yet specified.
- **Decision**: Split email integration into `EmailTransportAdapter` (for ticket notifications via mock/Mailpit/configurable SMTP) and `MailboxProvisioningAdapter` (kept disabled until the actual mail platform API is approved).
- **Consequences**: Prevents unsafe assumptions or accidental external email transmission during Milestone 1 while supporting end-to-end notification queueing and testing.
