# Recovery readiness

The disposable PostgreSQL fixture initializes an empty cluster, runs the committed Prisma migrations, and starts the application against the migrated schema. The database suite covers referential integrity, atomic rollback, contention and retry, outbox leases, connection failure, and restart. The controlled rehearsal measured 1,868 ms for restart and 2,404 ms for synthetic restore. The restored dataset contained four tickets, eight ticket events, nine audit entries, four sessions, one notification and one outbox job. A separate runtime restore verified 21 tickets, 26 outbox jobs, 44 audit records and seven sessions with matching relationships. Timings reflect tiny local fixtures.

## Restore procedure for an isolated drill

1. Identify the approved source, its PostgreSQL version, and the backup's completion timestamp. Use a synthetic source for a local drill. Use an encrypted, access-controlled archive destination.
2. Run `pg_dump --format=custom --no-owner --file "$AIIT_BACKUP_FILE" "$AIIT_SOURCE_DSN"` with credentials injected securely. Record a checksum and backup timestamp.
3. Provision a fresh isolated database with approved credentials and restricted egress. Pause workers and use synthetic or disabled delivery. Run `pg_restore --exit-on-error --no-owner --dbname "$AIIT_RESTORE_DSN" "$AIIT_BACKUP_FILE"`.
4. Verify migration state, counts and relationships for tickets, audit history, sessions, notifications and durable jobs. Run API readiness and representative smoke checks against the restored database. Record completion time, backup age, failed checks and a signed handoff.
5. Validate replay behavior for pending jobs before allowing delivery. Preserve any failed restore for incident analysis in restricted storage.

Production recovery is blocked pending a real-size nonproduction drill with the selected PostgreSQL platform, backup schedule, encrypted retention, and recovery procedure. Proposed for owner review: RPO of 15 minutes if continuous WAL archiving is available and verified, and RTO of four hours for app and worker recovery. Both are proposed targets awaiting approval.
