# Defect remediation

| Finding | Reproduced Day 4 behavior | Milestone correction |
| --- | --- | --- |
| CODEX-AUDIT-001 | JSON escalation returned 200 and queued intent to a disabled CTO. | The shared selector filters authoritative active CTO accounts. Zero or multiple matches produce `CTO_ROUTING_UNAVAILABLE` before ticket mutation. |
| DEF-003 | PostgreSQL created an in-app-only intent addressed to the requester. | PostgreSQL records the CTO's email-and-in-app intent and durable job in the escalation transaction. Status, CRITICAL severity, redacted reason and dedicated history and audit commit together. |
| DEF-002 | PostgreSQL returned NEW with one event and omitted the AI action and pending approval for the privileged AD fixture. | Shared deterministic planning applies category defaults, the classifier severity floor, AI policy, IT assignment and approval gates. PostgreSQL commits the ticket, four events, AI action, optional approval, audit and outbox together. |
| DEF-006 | The portal omitted catalog fields. The direct API accepted a privileged AD ticket with an empty payload. | Both forms use the selected schema. Both stores check required fields, types, select options, declared keys, and mailbox formats. Historical payloads remain readable. |
| DEF-013, numbering | JSON used a fixed year and the current ticket count, allowing collisions with sparse history. | Both stores use a UTC year, a shared INC/REQ format and a monotonically increasing suffix. JSON persists an optional watermark on successful creation and the importer advances the PostgreSQL counter. |
