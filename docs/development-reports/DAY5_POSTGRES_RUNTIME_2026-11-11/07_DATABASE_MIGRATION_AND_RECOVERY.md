# Database migration and recovery

Disposable PostgreSQL applied the preserved migration chain plus the session-revocation trigger. Prisma client generation and schema diff passed. The database suite covered populated UUID-to-text upgrades, retained prefixed IDs, import/reimport checksum verification, conflicting-import rollback, protected history, foreign keys and backup/restore of initial and mutated repository state.

The runtime recovery test dumped the exercised HTTP dataset using `pg_dump` and restored it to a second database in the same disposable cluster. It compared ticket numbers and versions, requester/SBU links, ticket history/comment/AI/approval counts, notification recipients and ticket links, durable job states and attempts, audit count and session count. [Migration and restore evidence](evidence/database-integrity.json)

The API test terminated a PostgreSQL backend inside a job insert after earlier business writes. The API returned 503 and ticket, history, audit and job counts matched their pre-request values. Liveness stayed available during a cluster stop. Readiness returned 503 and recovered after restart, using a new pool after the failed probe. All destructive fault injection and restoration targeted test-owned clusters.
