# Operations and rollback

1. Prepare pinned Node and pnpm, frozen dependencies and Prisma client. Review migration compatibility and capture a verified backup before applying ordered migrations. Run database, OIDC and mail checks in an authorized environment.
2. Start API, web and worker through the approved supervisor using the configured identity and private listeners. Confirm edge TLS, `/api/live` and `/api/ready`, worker `WORKER_READY` and queue progress. Current PostgreSQL/SMTP guards permit only local rehearsal.
3. Monitor availability, database readiness, worker process age, oldest available job, expired leases, exhausted deliveries and stale overdue SLA work. Correlate terminal audit entries with job state. Establish alerts, escalation ownership and redaction/retention in the target monitoring platform.
4. On rollback, stop or drain workers and stop new writes at the edge. Compare backward compatibility of application and schema. Revert to the approved application artifact for compatible migrations. If restore is required, use a fresh database, verify data and reconcile queued or ambiguous email before enabling workers. Preserve incident evidence and record any commits lost relative to the approved recovery point.

Disposable tests cover database interruption, liveness versus readiness, API restart, lease recovery and a restored API reading committed tickets. Target monitoring alert receipt, rollback and secrets injection are blocked pending an approved nonproduction environment and operations owner. See [recovery drill](RECOVERY_DRILL.md).
