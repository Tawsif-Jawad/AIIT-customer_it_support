# API repository and parity

The paired fixture submits matching HTTP scenarios with the same seed through JSON and PostgreSQL. It checks HTTP statuses, top-level keys and error codes, plus selected workflow and authorization results. Browser tests cover the rendered state. The machine-readable results record each paired assertion. [Paired HTTP evidence](evidence/http-parity.json)

| Method and route | Relational data and exercised behavior |
| --- | --- |
| GET /api/live, /api/ready, /api/health, /api/openapi.json | Diagnostic mode and readiness, outage status, published API paths |
| GET /api/auth/config, /api/auth/identities | Runtime auth mode and development identities |
| GET /api/auth/oidc/login, /api/auth/oidc/callback | Development mode returns 503. Controlled enterprise flow establishes a session and rejects a reused callback. |
| POST /api/auth/login, /api/auth/logout | Trusted current identity and session digest. Invalid and disabled login, revocation and restart tested. |
| GET /api/auth/me | Current user, SBU and permissions. OIDC adds a session-bound CSRF token. |
| GET /api/catalog, /api/kb | Categories, dynamic schemas, SBUs and approved knowledge search |
| GET /api/tickets | Ownership and SBU access, search, severity and status filters, pagination and invalid input |
| POST /api/tickets | Shared triage, category validation, number allocation, audit, AI logs, approval, initial history and outbox |
| GET /api/tickets/:id | ID and number lookup, comments, approvals, AI logs and history. Cross-SBU and customer access denied. |
| POST /api/tickets/:id/comments | Validation and role-scoped internal notes with history |
| POST /api/tickets/:id/transition | IT work, employee resolution and reopening. Escalation status delegates to the same handler as the dedicated endpoint. |
| POST /api/tickets/:id/escalate-cto | 200 with exactly one active CTO. 409 when none or multiple are eligible. Audit and outbox commit together. |
| GET /api/approvals | IT/CTO queue. Customer access returns 403. |
| POST /api/approvals/:id/decide | Required role, rationale, history and immutable 409 replay |
| GET /api/assets | Custody and SBU scope |
| POST /api/assets/:id/acknowledge | Role and assignment scope, custody history, audit and idempotent replay |
| GET /api/notifications | Existing recipient and administrative visibility. PostgreSQL records worker results durably. |
| POST /api/notifications/:id/read | New recipient-only operation in both modes. Repeats preserve the original read time. Other recipients receive 404. |
| GET /api/analytics/summary | Shared ticket scope and aggregate counts |
| GET /api/audit-logs | IT/CTO audit visibility and employee denial |
| GET /api/connectors/ad/lookup | Authorized mock lookup and employee denial |

The existing portal uses automatic IT assignment. Notification read state is available through the API. The shared router still handles OPTIONS and unknown routes. The paired test compares representative scenarios per route and is complemented by existing security, integration and browser tests.

PostgreSQL redacts ticket descriptions at creation according to the prior repository policy. JSON retains its current description behavior, so searches involving redacted text can differ. JSON can synchronously record a mock delivery. PostgreSQL records an intent first and worker processing determines the later delivery state. Independent PostgreSQL API instances can return a serializable conflict under contention. Repeated standalone ticket creation without an idempotency key can create distinct requests in both modes.
