> Day 2 safety correction: do not run db:seed against existing data; it now refuses reset. Standalone worker is disabled in JSON mode. Use explicit NODE_ENV=development AUTH_MODE=dev_oidc MAIL_PROVIDER=mock for local API only. No production/staging deployment has been verified; instructions below are historical targets. See README and the Day 2 report.

# Production Deployment & Operations Guide
**Project:** Enterprise Multi-SBU AI-Powered IT Support System

## 1. Local Development Startup
### Option A: Zero-Dependency Native Node.js Startup (Works Immediately Without Docker)
```bash
cp .env.example .env
npm run db:seed
npm run start:api     # Starts REST API on http://127.0.0.1:4000
npm run start:web     # Starts Web Portal & API Proxy on http://127.0.0.1:3000
npm run start:worker  # Starts Background Notification Queue Worker
```

### Option B: Full Containerized Infrastructure with Docker Compose
```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d
# Apply PostgreSQL schema migration:
psql "$DATABASE_URL" -f apps/api/prisma/migrations/20261108000000_init/migration.sql
npm run db:seed
npm run start:api &
npm run start:worker &
npm run start:web
```

## 2. Production Topology & Network Segmentation
1. **DMZ / Reverse Proxy Tier**:
   - NGINX or Envoy Ingress Controller terminating TLS 1.3 (corporate PKI or ACME certificates), enforcing HSTS (`Strict-Transport-Security`), WAF rules, and routing `/` to `apps/web` and `/api/*` to `apps/api`.
2. **Application Tier (Private App VLAN)**:
   - Stateless `apps/api`, `apps/web`, and `apps/worker` containers running as non-root UID (`10001`) with read-only root filesystems.
   - Outbound network policy restricted strictly to:
     - Internal PostgreSQL (`5432/tcp`)
     - Internal Redis (`6379/tcp`)
     - Internal Keycloak OIDC (`8443/tcp`)
     - Corporate Self-Hosted SMTP Relay (`587/tcp` STARTTLS)
     - Corporate Active Directory Domain Controllers (`636/tcp` LDAPS — read-only service identity)
3. **Data & Identity Tier (Restricted Data VLAN)**:
   - PostgreSQL 16 HA cluster with streaming replication, encrypted volumes (LUKS/KMS), and `pgBackRest` point-in-time recovery (PITR).
   - Redis 7 Sentinel/Cluster with AOF persistence and TLS authentication.
   - Keycloak HA cluster backed by PostgreSQL, federating with on-premises Active Directory over LDAPS.

## 3. Secrets Management, Backup & Recovery
- **Secrets Management**: Inject `DATABASE_URL`, `JWT_SIGNING_SECRET`, `KEYCLOAK_CLIENT_SECRET`, `AD_BIND_PASSWORD`, and `SMTP_PASSWORD` from HashiCorp Vault, Kubernetes External Secrets, or encrypted systemd credentials. Never store production secrets in `.env` files or Git.
- **Backup & Disaster Recovery**:
  - Daily automated full PostgreSQL backups + continuous WAL archiving (RPO < 5 minutes, RTO < 30 minutes).
  - Quarterly restore drills verified in an isolated staging environment.
- **Monitoring & Alerting**:
  - Poll `GET /api/health` every 15 seconds. Alert IT Operations if `status !== 'HEALTHY'`, if notification queue backlog exceeds threshold, or if `UNAUTHORIZED_TICKET_ACCESS_BLOCKED` / `SECURITY_POLICY_VIOLATION_ATTEMPT` audit events spike.
