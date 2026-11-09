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

## ADR-005: Day 2 JSON containment (implemented interim decision)

Problem: F01 proves independent snapshots overwrite committed data. Atomic rename alone and in-process mutexes cannot protect API/worker processes.

Alternatives: immediately switch to PostgreSQL (target but unavailable and schema incompatible); lifetime single-writer process ownership (would need lifecycle cleanup across existing embedding/tests); per-request local filesystem exclusive lease plus complete reload/atomic commit; elaborate expiring distributed lock (rejected).

Selected interim: one request transaction owner in API, local serial queue, exclusive `open(wx)` lease across processes, reload at start, buffered response, one validated fsynced-temp/rename commit; direct persistence checks source bytes under the same lease. Standalone snapshot worker and non-mock mail are disabled. No automatic abandoned-lock stealing. See PERSISTENCE_RECOVERY.md.

Consequences: prevents silent stale writes and enables whole-request rollback; sacrifices throughput and availability on contention/crash. Filesystem sharing/path aliases unsupported. Not a replacement for PostgreSQL; no power-loss/exactly-once claim. Authorized as reversible Day 2 containment, not enterprise architecture approval.

## ADR-006: Identity/session and scope boundary (interim implemented + target proposal)

Problem: default dev authentication and nonrevocable bearer tokens; ambiguous expanded SBU scope.

Selected interim: explicit development opt-in, persisted hashed session allowlist, transactional logout, current active user role lookup, no interactive service identity. Preserve existing SRS cross-SBU IT/CTO grants; narrower support assignments remain an unapproved schema/policy refinement. Alternative of trusting token/body role or relying on cookie deletion rejected.

Target proposal: existing Keycloak/AD LDAPS direction with PKCE, server sessions, group/SBU mapping and privilege refresh. Binding approvals to exact actions is required before real execution. No live connector implemented or approved by this ADR.

## ADR-007: Database ID compatibility (proposed, awaiting review)

Problem: existing SQL UUID keys cannot import prefixed source IDs; Prisma/raw SQL parity unverified.

Proposed: preserve IDs with text PK/FKs and explicit source mapping, atomic import and checksums. Alternative UUID surrogate + durable legacy-ID map adds compatibility work. Existing initial SQL is retained unchanged pending a reviewed replacement sequence. See architecture/DATABASE_DESIGN.md. No migration executed.

### Correction to ADR-002 and ADR-003 historical claims

ADR-002 records the PostgreSQL/Prisma target. Its earlier “transactional” local store and Docker dual-mode wording was inaccurate: Docker starts dependencies only, runtime database switching is absent. Day 2 implements local containment, not that target integration. ADR-003 constrains the current fixed simulated tool registry; it cannot guarantee safety for an arbitrary future LLM adapter without reviewed execution-policy enforcement and adversarial tests.

## ADR-008: Final Day 2 toolchain and database compatibility

Implemented under the explicit final-completion request: retain Node 26.8.1 native application, pnpm 9.15.0 and a checked-in lockfile; run actual TypeScript/ESLint plus native smoke build. Previously unused framework/integration declarations remain scaffolds, updated to registry-verified releases to remove known advisories; no Next/Nest application replacement occurred. Targeted transitive overrides remediate PostCSS, Prisma config deepmerge-ts and TypeScript-ESLint minimatch advisories; compiler/lint/Prisma/migration tests execute against those resolutions. Ignored installation scripts are followed by explicit Prisma generation and Playwright browser installation.

Implement text-ID compatibility as an additive transactional migration after the preserved UUID baseline; maintain existing UUID values and prefixed JSON IDs without remapping links. Disposable import/reimport, populated UUID upgrade, rollback, schema parity and backup/restore are tested. This resolves ADR-007's development compatibility decision; operational cutover and expanded organization policy remain unapproved. GitHub hosted CI acceptance is blocked by its explicit account-payment/spending-limit diagnostic, not by a passing-job claim.
