# Production Security Blockers (Distinct from Synthetic Exception)

**Production Readiness Verdict:** **`NO-GO`**

Approving `AIIT-SYNTH-EXC-001` (for isolated synthetic testing) does **not** clear any production release blocker. The AI IT Support System remains **NOT APPROVED** for production deployment until all items below are resolved:

1. **Container & Dependency Vulnerability Remediation:**
   - All High and Critical container vulnerabilities in Keycloak (`CVE-2026-91403`, `CVE-2026-119373`/`-119374`/`-119379`/`-119586`, `GHSA-xxph-c9ww-hj94`) and any production directory/runtime images must be resolved via supported upstream patches or formally adjudicated under the organization's production security release policy.
   - The unchanged `grype --fail-on high` CI gate must pass on the production release candidate.
2. **Authorized Real Enterprise Infrastructure Integration:**
   - Explicit owner and organizational authorization to connect to non-production/production corporate Active Directory (LDAPS), corporate OIDC/Keycloak identity provider, and corporate SMTP relay.
   - End-to-end verification against real enterprise contracts (synthetic testing cannot replace real enterprise validation).
3. **Identity & Session Revocation Policy:**
   - Formal enterprise policy decision and implementation for session/token revocation bounds upon AD account disablement (Day 13 verified that existing AIIT sessions and tokens are not instantaneously revoked on directory disablement).
4. **Operational, Performance & Recovery Readiness:**
   - Production deployment topology, PostgreSQL operational backup/restore and RPO/RTO verification, alerting/observability, and rollback rehearsal.
5. **Governance & Promotion (`development -> main`):**
   - Independent security and code review, stakeholder UAT sign-off against the 27-case UAT plan, exact-commit CI pass on `development -> main` promotion PR, and formal production release authorization.
