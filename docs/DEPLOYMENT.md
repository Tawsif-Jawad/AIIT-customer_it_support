# Deployment and operations

## Verified local paths

Use Node 26.8.1 and the pinned pnpm 9.15.0 commands in the README. JSON is the default development store and uses mock transport. For disposable PostgreSQL, apply the full ordered Prisma migration history with `pnpm exec prisma migrate deploy --schema apps/api/prisma/schema.prisma`, then run with explicit `NODE_ENV=development`, `STORAGE_MODE=postgres`, and `MAIL_PROVIDER=mock`. Point `DATABASE_URL` at a confirmed disposable database. Use the disposable test fixtures for local setup, import/restore and outbox rehearsal. The runtime restricts PostgreSQL to development and test. Current operator guidance and release gates are in the [remediation acceptance report](development-reports/DAY1_DAY6_AUDIT_REMEDIATION_2026-11-18/16_FINAL_ACCEPTANCE.md).

## Proposed production topology

Development verification covers native HTTP services behind an isolated TLS edge and PostgreSQL with mock delivery. Configure an approved HTTPS `APP_PUBLIC_URL` and authenticated ingress peers for a production-mode web process. Terminate TLS and set HSTS at the edge. Keep HTTP-to-backend listeners private and prevent direct public access. Configure exact Keycloak callback origin and authenticated proxy hops for both web and API. Use `/api/live` for liveness and `/api/ready` for storage readiness. [TLS and security evidence](development-reports/DAY1_DAY6_AUDIT_REMEDIATION_2026-11-18/07_SECURITY_HARDENING.md)

The following earlier topology details are planning inputs, pending owner review and deployment rehearsal.

## 2. Production Topology & Network Segmentation
1. **DMZ / Reverse Proxy Tier**:
   - NGINX or Envoy Ingress Controller terminating TLS 1.3 (corporate PKI or ACME certificates), enforcing HSTS (`Strict-Transport-Security`), WAF rules, and routing `/` to `apps/web` and `/api/*` to `apps/api`.
2. **Application Tier (Private App VLAN)**:
   - Stateless `apps/api`, `apps/web`, and `apps/worker` containers running as non-root UID (`10001`) with read-only root filesystems.
   - Outbound network policy restricted strictly to:
     - Internal PostgreSQL (`5432/tcp`)
     - Internal Keycloak OIDC (`8443/tcp`)
     - Corporate Self-Hosted SMTP Relay (`587/tcp` STARTTLS)
     - Corporate Active Directory Domain Controllers (`636/tcp` LDAPS — read-only service identity)
3. **Data & Identity Tier (Restricted Data VLAN)**:
   - PostgreSQL 16 HA cluster with streaming replication, encrypted volumes (LUKS/KMS), and `pgBackRest` point-in-time recovery (PITR).
   - Keycloak HA cluster backed by PostgreSQL, federating with on-premises Active Directory over LDAPS.

## 3. Secrets Management, Backup & Recovery
- **Secrets Management**: Inject `DATABASE_URL`, `JWT_SIGNING_SECRET`, `KEYCLOAK_CLIENT_SECRET`, `AD_BIND_PASSWORD`, and `SMTP_PASSWORD` from HashiCorp Vault, Kubernetes External Secrets, or encrypted systemd credentials. Never store production secrets in `.env` files or Git.
- **Backup & Disaster Recovery**:
  - Set approved recovery objectives before selecting backup and continuous WAL archiving schedules. Verify time-to-restore with synthetic data.
  - Quarterly restore drills verified in an isolated staging environment.
- **Monitoring & Alerting**:
  - Monitor liveness and readiness separately. Alert the approved operations team if readiness returns 503, if notification queue backlog exceeds threshold, or if `UNAUTHORIZED_TICKET_ACCESS_BLOCKED` / `SECURITY_POLICY_VIOLATION_ATTEMPT` audit events spike.
