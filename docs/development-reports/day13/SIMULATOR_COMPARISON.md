# Day 12 and Day 13 comparison

| Category | Day 12 | Day 13 evidence and remaining risk |
|---|---|---|
| Authentication | Signed synthetic OIDC with a local directory | Simulator role flows preserved; separate Keycloak discovery smoke. Federated user auth remains open. |
| Disabled account | Local allowlist plus application account status | Same tested revocation contract. Samba disable propagation remains unmeasured. |
| Directory synchronization and updates | In-memory fixtures | Offline credential-free manifest. Real attribute, group and sync behavior remains blocked. |
| Session revocation | Local account changes invalidate the session | Existing regression retained. External identity revocation requires a measured policy. |
| OIDC failures | Signed bad-token and unavailable-provider fixtures | Existing regressions retained. Real Keycloak token and callback failures remain open. |
| SMTP authentication | TLS sink without credentials by default | Actual AUTH PLAIN over trusted TLS; incorrect password denied. |
| TLS verification | Ephemeral trusted certificate and host checks | Wrong mail CA rejected. Separate Keycloak smoke verifies TLS and rejects host mismatch. |
| Temporary failure | Controlled 451 | Authenticated worker retry verified. |
| Permanent failure | Auth-required and exhaustion cases | Authenticated 550 wire rejection verified; bounded retry policy unchanged. |
| Notification retry and audit | Durable PostgreSQL outbox and terminal audit | Existing semantics preserved. Capture restart preserves Message-ID but duplicate reconciliation still requires an approved policy. |
| SLA and workflows | Eight checked scenarios | All eight rerun using authenticated SMTP. Federated workflow run remains open. |
