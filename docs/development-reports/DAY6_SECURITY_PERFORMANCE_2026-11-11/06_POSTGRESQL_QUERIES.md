# PostgreSQL query and pool analysis

Ticket list count, owner/SBU scope, status, severity, category, substring filter and pagination now execute inside PostgreSQL. The page joins display metadata only for the returned rows. Analytics groups ticket status and SBU and counts pending approvals in SQL. Both paths use the shared access policy. The API retains bounded JSON pagination and the existing response shape.

The migration initializes the existing ticket counter from historical suffixes and preserves larger imported floors. A trigger raises the floor when a ticket number is inserted or changed. Both creation paths now read or update the counter without scanning ticket history per creation. The exact ticket numbers and serializable conflict handling remain in force.

The ordered page uses the measured `Ticket_createdAt_id_idx` index. Owned search uses the existing requester index. The rehearsal did not select a proposed approval index, so it was omitted. Cross-SBU analytics and broad substring searches can still scan candidates. Offset pagination and exact counts retain the existing API contract. PostgreSQL case folding depends on collation, which may differ from JavaScript for some non-ASCII text.

Each measured API process uses a separate Prisma pool capped at eight connections in the harness. PostgreSQL admission writes occur before the business transaction. The test records connections visible in `pg_stat_activity` after traffic. The API still serializes its request-scoped business transactions per process, and concurrent writers can return a retryable 409. [Plans and measurements](evidence/benchmark.json)
