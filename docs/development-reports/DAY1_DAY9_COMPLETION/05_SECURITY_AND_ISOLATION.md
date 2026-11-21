# 05 — Security and Isolation

The office isolation policy remains enforced. Verification used synthetic identities and data, loopback listeners, disposable PostgreSQL and local TLS/Mailpit-style sinks. No live AD, SMTP, office database, employee/customer source, or production target was accessed.

OIDC, Origin/CSRF, session revocation, role/SBU, redaction, ingress, proxy trust, abuse budgets and XSS/CSP controls have local or synthetic evidence. Real target TLS, federation, certificate, proxy and directory configurations remain pending.
