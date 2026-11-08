# Security, Governance & Privacy Controls
**Project:** Enterprise Multi-SBU IT Support System

## 1. Access Control & Multi-SBU Isolation
- **Backend-Enforced RBAC**: Every REST API route extracts and verifies the signed OIDC JWT (`apps/api/src/auth.ts`). Unauthenticated calls receive `401 UNAUTHORIZED`.
- **Resource-Level SBU Scoping**: `canAccessTicket(user, ticket)` in `packages/shared/src/index.ts` enforces that `EMPLOYEE` and `CUSTOMER` identities can only read or update tickets where `ticket.requesterId === user.id && ticket.sbuId === user.sbuId`. Cross-user or cross-SBU access attempts return `403 FORBIDDEN_RESOURCE` and generate an `UNAUTHORIZED_TICKET_ACCESS_BLOCKED` audit event.
- **Role-Gated State Transitions**: Only `IT_ADMIN`, `CTO`, or policy-governed `SYSTEM_SERVICE` can transition tickets to `ESCALATED_TO_CTO`.

## 2. AI Safety, Prompt-Injection Defense & Data Privacy
- **Untrusted Input Handling**: Ticket titles, descriptions, comments, and KB articles are treated strictly as untrusted data, never executable instructions.
- **Secret & PII Redaction**: `redactSensitiveData()` scrubs passwords, API keys, Bearer tokens, and payment card patterns before recording prompts in `AIActionLog` or sending payloads to any external LLM adapter.
- **Prompt Injection & Command Blocking**: Attempts to override instructions (`ignore previous instructions`, `grant domain admin`, `rm -rf`, `drop table`) are deterministically intercepted, flagged as `SECURITY_POLICY_VIOLATION_ATTEMPT`, blocked (`BLOCKED_BY_POLICY`), and routed to IT Security.
- **Typed Tool Allowlist**: Only explicitly registered low-risk diagnostic tools (`diag_network_gateway_check`, `diag_outlook_autodiscover_guide`, `kb_lookup_handover_policy`) can run without human approval. High-risk operations (`privileged_ad_account_unlock`, `privileged_mailbox_provision`) are blocked from autonomous execution and require `IT_ADMIN`/`CTO` approval.
- **Data Residency & External LLM Risks**: Before enabling an external cloud LLM provider in Milestone 2+, the organization must review corporate data residency requirements, execute a Data Processing Agreement (DPA) with zero-data-retention guarantees, or deploy a local on-premises model (e.g., via internal vLLM/Ollama endpoint).

## 3. Application & Infrastructure Security
- **Zero Hardcoded Secrets**: All credentials in `.env.example` and `infra/docker-compose.yml` are clearly marked local development placeholders (`CHANGE_ME_*`).
- **HTTP Security Headers & Rate Limiting**: API responses enforce `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cache-Control: no-store`, `HttpOnly; SameSite=Lax` session cookies, 1MB body size limits, and per-IP rate limiting (250 req/min).
- **Network Binding**: All Docker Compose ports (`5432`, `6379`, `8080`, `1025`, `8025`) and local Node services bind strictly to `127.0.0.1` so databases, Redis, and admin consoles are never exposed to external networks.
- **Audit Retention**: All authentication events, ticket creations, status changes, approval decisions, asset acknowledgments, and blocked access attempts are logged to `AuditLog`. Production deployments should retain immutable audit logs in append-only storage/SIEM for a minimum of 365 days.
