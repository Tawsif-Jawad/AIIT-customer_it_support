# Recovery drill

The controlled disposable PostgreSQL drill started at 11:22:59.332 and finished at 11:23:00.789 on 22 November 2026 in Asia/Dhaka. Restore and API readback took 1,457 ms. Database interruption and readiness recovery took 832 ms. The archive was 72,644 bytes and approximately 1,193 ms old at the end of verification. Source and destination matched across four tickets, eight ticket events, nine audit entries, four sessions, one notification and one job. The restored notification/job matched field for field and the restored API returned committed ticket data. Separate database coverage exercises approvals, custody, and worker lease recovery.

## Repeatable production-like drill

Use a sanitized production-size dataset, a newly provisioned destination, an isolated worker with controlled delivery, and approved credentials. Record source row/byte counts and the checkpoint or backup completion time. Create an encrypted versioned backup, verify checksums, exercise `pg_restore --exit-on-error` or the chosen base backup and WAL recovery procedure, and document the selected recovery point. Verify migration state, integrity and relationships for tickets, approvals, assets, sessions, audits and both schedulers. Start services, validate readiness and business readback, and reconcile queued or ambiguous deliveries before worker egress. Report service recovery time and backup age separately. Confirm restricted storage, retention, key access, alert delivery and backup schedule with operations.

Production-sized recovery is BLOCKED. Proposed RPO is 15 minutes with tested WAL archiving and proposed RTO is four hours. Both require owner approval and measured target evidence.
