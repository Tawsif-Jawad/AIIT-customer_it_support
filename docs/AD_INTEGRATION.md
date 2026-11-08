# On-Premises Active Directory Integration Design
**Status:** Milestone 1 Read-Only Mock & Keycloak Federation Blueprint Implemented; Production Writes Disabled

## 1. Architectural Principles
- **No Unverified Assumptions**: We do not assume Active Directory domain names, domain controller IPs/hostnames, base DNs, OU hierarchy, or service account credentials.
- **Authentication via Keycloak OIDC + LDAPS Federation**: Application login uses OpenID Connect through Keycloak (`infra/keycloak/upstra-enterprise-realm.json`). In production, Keycloak federates with on-premises AD over **LDAPS (TCP 636)** with strict TLS certificate validation (`useTruststoreSpi: always`, `editMode: READ_ONLY`).
- **AI Prohibition**: The AI orchestrator is strictly prohibited from executing AD commands, unlocking accounts, resetting passwords, or modifying group memberships.

## 2. Typed Connector Interface (`packages/connectors/src/index.ts`)
`ActiveDirectoryAdapter` exposes:
- `lookupUserByEmail(email: string): Promise<ADUserRecord | null>`
- `lookupGroupsForUser(email: string): Promise<ADGroupRecord[]>`
- `proposeWriteAction(proposal: ADWriteActionProposal)`: Enforces that an explicit human approval (`IT_ADMIN` or `CTO`) exists before even dry-run validation succeeds. In Milestone 1, `isProductionEnabled` is `false` and all write proposals return `BLOCKED_PRODUCTION_DISABLED` or `REQUIRES_APPROVAL`.

## 3. Future Production Write Bridge (Milestone 2+)
When corporate AD parameters are provided and approved:
1. Provision a dedicated, least-privileged AD service account (`svc-itsupport-ro` for lookups; separate `svc-itsupport-operator` scoped only to designated non-admin OUs for approved fulfillment).
2. Deploy an on-premises execution bridge that verifies cryptographic approval signatures from `IT_ADMIN`/`CTO` before executing any group membership or account unlock change.
3. Log every LDAP operation in `AuditLog` with the approving administrator's identity and ticket reference.
