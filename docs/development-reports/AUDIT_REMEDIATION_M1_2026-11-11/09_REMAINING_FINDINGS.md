# Remaining findings and owner decisions

| Finding | Remaining work |
| --- | --- |
| DEF-001 | Complete the common HTTP repository and session contract, transactional storage selection, and durable worker integration before a nonproduction runtime rehearsal. |
| DEF-004 | Decide whether to support multiple trusted OIDC issuers and review identity linking and revocation before changing uniqueness. |
| DEF-005 | Approve retention, erasure and audit actor treatment before changing foreign-key behavior. |
| DEF-007 and DEF-008 | Establish trusted ingress identity, bound rate-limit storage and protect shared OIDC login-initiation capacity. |
| DEF-009 | The source-truth audit did not reproduce stale localhost service code. Runtime revision visibility remains a diagnostic improvement. |
| DEF-010 | Review strict CSP and HTTPS/HSTS behavior under approved ingress. |
| DEF-011 | Reconcile unused framework scaffolding with the actual native runtime. |
| DEF-012 | Bring the legacy Keycloak deployment blueprint into line with the approved OIDC settings and rehearse it in a disposable environment. |
| DEF-013 remainder | Label structured mock diagnostics explicitly. |

Owners still need to approve routing among multiple eligible CTOs and any alternative to blocking an escalation when no recipient is available. Owners also need to define canonical privacy rules for ticket text, catalog data and downstream records, category minimum severity rules, and any approval required for real execution. A JSON snapshot predating the watermark can recover only numbers still present in its ticket history. Identical standalone create requests remain separate business requests. The browser blocks repeated in-flight submission, and the stores roll back unsuccessful attempts and protect versioned operations from replay. No create idempotency key or exact-once delivery contract was introduced.
