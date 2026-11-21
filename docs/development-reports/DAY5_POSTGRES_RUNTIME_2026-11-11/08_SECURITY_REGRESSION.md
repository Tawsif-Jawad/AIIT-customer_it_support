# Security regression

The pinned security suite retains the baseline protocol and authorization regression coverage. The PostgreSQL tests directly checked ownership and cross-SBU denial, customer denial for approvals, internal note filtering, custody scope, recipient-only read acknowledgement, inactive identity denial, expiry, logout and rollback. A separate controlled-issuer browser rehearsal exercised enterprise sign-in, restoration, provider failure and expiry.

The API consults current database roles, SBU, user state and session digest. It reuses the existing origin and CSRF guard for writes. PostgreSQL preserves unique OIDC subject, append-only audit, history and AI records, and immutable approval decisions. No upstream OIDC tokens are stored. Unexpected request failures log a correlation ID and avoid logging raw errors or request parameters.

DEF-007 and DEF-008 remain release gates. The local rate limiter relies on the immediate peer and process memory. An approved ingress identity strategy, bounded rate-limit storage and shared protections for OIDC login initiation are required before a publicly exposed or multi-instance rollout.
