# Remaining risks and owner decisions

| Area | Pending decision or verification |
| --- | --- |
| CTO routing | Exactly one active CTO receives escalation. Zero or multiple eligible CTOs block it. The owner must approve any alternate policy. |
| Canonical privacy | Approve a common retention and redaction policy for ticket descriptions, category data and downstream copies. JSON and PostgreSQL description policies differ today. |
| OIDC identity | Review any future multi-issuer account linking and revocation before changing global subject uniqueness. Keycloak federation and real directory verification remain separate. |
| Retention and erasure | Approve append-only retention, audit actor treatment, cascading deletion and erasure policy before changing database constraints. |
| Real execution | Approve category minimum severity and parameter-bound action authorization before any live AI or privileged operation. |
| Email | Review transport, retry semantics and provider idempotency before live delivery. The worker uses mock mail and at-least-once processing. |
| DEF-007 and DEF-008 | Approve trusted ingress and shared abuse controls before public or multi-instance exposure. |
| DEF-009 through DEF-013 | Review revision visibility, CSP/TLS, unused scaffolding, Keycloak blueprint and remaining diagnostic labels. PostgreSQL mode and worker logs now identify the runtime and mock transport. |
| Performance | Shared HTTP filtering remains in-process. Run staging-scale query, pool and multi-instance contention tests before release. |
| Hosted acceptance | Restore GitHub Actions eligibility and obtain independent verification before considering cutover. |
