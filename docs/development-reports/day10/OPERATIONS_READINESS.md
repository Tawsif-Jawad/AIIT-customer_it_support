# Operations readiness

The active runtime entry points are `start:web`, `start:api` and `start:worker`. Use pinned Node and pnpm, frozen install, Prisma client generation and ordered `prisma migrate deploy` against the approved isolated target. The test worker uses mock egress by default and stops its loop on SIGINT/SIGTERM before disconnecting. The API exposes `/api/live` and `/api/ready`. Worker emits structured readiness, outage and startup events; production needs a service supervisor and queue-age/lease monitoring with an exercised alert path.

| Area | Configuration and gate |
|---|---|
| HTTPS and proxy | Review `APP_PUBLIC_URL`, authenticated ingress-peer configuration, upstream origin and edge HSTS. Backend listeners should be private. Synthetic edge rehearsal exercised forwarding controls. |
| Identity | Review issuer, registered client, fixed callback, TLS trust and session lifetime. Keep secrets in approved injection and restrict logs. |
| PostgreSQL | Review `STORAGE_MODE`, `DATABASE_URL`, migration and runtime grants, transport trust and startup readiness. Current destination guards admit disposable targets only. |
| Mail | Keep `MAIL_PROVIDER=mock` on test runs; enable only the owned test sink for rehearsal. Production transport and egress need approval and implementation validation. |
| Observability | Monitor API readiness, service restarts, worker job age, expired leases, failed deliveries, abuse and access-denial rates. Verify routing, alert receipt, escalation, payload redaction and retention with operations. |
| CI and dependencies | Frozen install, Prisma generation, full and production advisory audits. GitHub verification requests `contents: read`. Establish required checks and protected deployment credentials independently of verification. |
| Rollback | Preserve the previous app revision and tested recovery point. Review migration compatibility before switching the previous app back. Pause workers during recovery and confirm outbox delivery state before resuming. |

Production startup, services, alerting, backup scheduling and rollback have not been rehearsed against a release topology. See [deployment guidance](../../DEPLOYMENT.md) and [checklist](DEPLOYMENT_CHECKLIST.md).
