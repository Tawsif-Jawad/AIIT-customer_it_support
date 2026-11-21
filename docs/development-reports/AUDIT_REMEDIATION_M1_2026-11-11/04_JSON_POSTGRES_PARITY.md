# JSON and PostgreSQL parity

The paired fixture checks both implementations against expected outcomes as well as each other.

| Scenario | Expected workflow |
| --- | --- |
| Low-risk Outlook | LOW with a resolution proposal awaiting confirmation |
| Hardware incident | HIGH, assigned to IT with a pending CTO approval |
| Explicit HIGH Outlook | HIGH and assigned to IT |
| LOW request with critical outage classification | CRITICAL and assigned to IT |
| AD access and mailbox provisioning | At least MEDIUM, assigned to IT with a pending IT approval |
| Catalog approval gate and low-risk text | Assigned to IT with a pending approval |
| Restricted instructions | Blocked by the mock policy and routed to IT |
| Mock AI outage | MEDIUM and routed to IT with an AI fallback record |
| CTO escalation | CRITICAL, with one CTO email-and-in-app intent and attributed history and audit |
| Invalid input and out-of-scope reads | Rejected, with no successful business records |

Creation comparisons cover authoritative requester and SBU, assignee, form data, four workflow events, approval role and status, mock provider and policy decision, audit actor and resulting state, and intent recipient and channel. PostgreSQL also records the queued durable job.

The API's JSON runtime retains ticket descriptions in the operational record. PostgreSQL continues redacting descriptions before persistence. Both redact the mock prompt and notification text. JSON has HTTP status and request audit IP context. The PostgreSQL slice returns repository records or typed business errors and has no HTTP request IP. JSON uses an in-process mock queue, and PostgreSQL persists a durable outbox intent. No runtime or transport switch was exercised.
