# PostgreSQL projections

| Path | Change | Contract or permission boundary |
| --- | --- | --- |
| Approval decision | Fetch the target approval and its ticket only | Required role, immutable decision, ticket event and audit remain transactional |
| Approval list | Load approvals with just the ticket number and title from the relation | Gate on IT administrator or CTO before querying. Existing complete list retained |
| Asset acknowledgment | Fetch the target asset by ID | Existing assignee plus SBU check or administrative grant still applies |
| Asset list | Restrict ordinary roles by assigned user and SBU in PostgreSQL | Administrative inventory retains its existing global scope |
| Notification list | Filter employee/customer by recipient, cap administrative feed at 50, compute delivered email count in SQL | Recipient and existing administrative visibility preserved |
| Notification read marker | Existing targeted read by ID | Only the recipient may mark it read |
| Knowledge retrieval and triage | Exclude unapproved rows in database | Existing literal case-insensitive filtering and mock retrieval retained |
| Ticket list and analytics | Reuse Day 6 SQL pagination, aggregation and authorization | Ownership and SBU or previously approved global grants |
| Ticket detail | Existing per-ticket relations | History and internal note filtering keep their response contracts |

The approved knowledge collection and several successful responses remain unbounded. Pagination for those responses requires a reviewed contract change.

The additive migration indexes global notification feed ordering and recipient-scoped ordering. In the 10,000-notification fixture the administrator data plan changes from a 10,000-row sequential scan and full sort to an ordered index scan delivering 50 rows. The employee data and delivery-count paths use the recipient bitmap index for the 500 matching rows. The global delivery-count query still scans 10,000 rows. The probe records ten Prisma query events per warm request in both versions. The benefit comes from less data transferred and materialized and changes to the plans.

[Day 6 plans](evidence/projection-day6.json) · [Remediated plans](evidence/projection-remediated.json) · [Replay probe](evidence/projection-probe.mjs) · [Performance comparison](11_PERFORMANCE_COMPARISON.md)
