# 09 — Findings and Remediation

Implemented remediations include stale-writer protection, approval compare-and-set, requester escalation protection, redaction, OIDC sessions, PostgreSQL transactions, durable worker claims, assignment compare-and-set, trusted ingress, isolation guards and outbox recovery bounds.

The verification dependency audit identified and this branch patched the vulnerable `effect` transitive package. Package manifest and lockfile now resolve `@prisma/config>effect` to `3.22.1`.

The remaining documented finding set requires independent review or external prerequisites; it is not silently risk-accepted.

Newly closed implementation gaps: configurable/durable SLA policies and overdue escalation, approval binding/expiry/consumption, asset custody lifecycle, attachments and role-scoped reports/SLA visibility.
