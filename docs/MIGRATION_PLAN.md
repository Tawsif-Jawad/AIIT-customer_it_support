> Day 3 update (2026-11-10): A tested isolated PostgreSQL repository/outbox slice now exists; the application still runs on JSON. See [repository contract](architecture/POSTGRES_REPOSITORY.md) and [Day 3 acceptance](development-reports/DAY3_ACCEPTANCE_2026-11-10.md). Earlier statuses below are historical. Hosted checks, independent review, prerequisite integrations and production cutover remain gates.

> Day 2 update: JSON now uses exclusive transaction leases, reload/commit and direct stale-snapshot rejection; destructive reset is disabled. Historical Day 1 findings below remain evidence of the prior implementation. Current schema proposal and dry-run validator limitations are in architecture/DATABASE_DESIGN.md; no database migration was executed.

# AIIT non-destructive migration plan — Day 1

Date: 8 November 2026. **Plan only. No migration, reset, production connection or data conversion was executed.** Day 3 is proposed implementation work, subject to Day 2 schema/identity decisions.

## Current storage and evidence

The active `EnterpriseDataStore` reads `.data/enterprise-db.json` once into memory and persists the entire object through a temporary file and rename. `DATABASE_URL`/`STORAGE_MODE` do not select an implemented PostgreSQL repository. The API and worker each construct independent snapshots. Probe F01 reproduced a lost update between independent writers. Single-writer/API reconstruction reloads persisted tickets and audit events (P04/P05).

At audit start the shared file contained 3 SBUs, 5 roles, 5 users, 6 service categories, 5 tickets, 13 ticket events, 1 comment, 3 assets, 2 approvals, 2 notifications, 4 AI logs, 10 audit logs and 3 knowledge articles. These are development records, not validated company master data. The file hash is recorded in `audits/evidence/initial-baseline.json`; the final comparison confirms it was unchanged. It is not a backup.

No JSON-level foreign-key, uniqueness, full schema validation, cross-process transaction, fsync-based durability or backup/restore procedure is implemented. Existing corrupt JSON is rejected instead of overwritten. Missing storage automatically seeds demo records. The seed command unconditionally resets the configured local file and must not be part of migration startup.

## Documented target and approval boundary

`docs/DECISIONS.md` ADR-002, Prisma schema and SQL scaffold describe PostgreSQL/Prisma as the intended enterprise persistence path. This plan follows that existing direction; it does not approve a new database or framework. Reconcile the ADR's inaccurate dual-mode implementation claims and confirm the schema/compatibility decisions before Day 3. No company server, hosting region or credentials are inferred.

## Blocking schema questions

1. The SQL migration uses UUID keys; existing IDs include human-readable prefixes and prefixed UUIDs. Prisma String fields lack explicit native UUID annotations. Decide whether to preserve string IDs using compatible text keys, or use UUID keys with a stable legacy-ID mapping and API compatibility layer. Do not silently regenerate identifiers or break ticket links.
2. Runtime JSON duplicates role/SBU display information and actor names absent from SQL. Preserve historical actor display context deliberately rather than discarding it.
3. Decide customer organization, user memberships, support-SBU assignments, KB visibility and SYSTEM_SERVICE identity models from the approved permission matrix.
4. Define ticket/asset lifecycles, approval state/version/parameter bindings, notification attempts/idempotency and audit retention.
5. Reconcile Prisma/native column types, defaults, indexes, foreign keys and migration tooling. No migration ledger has been applied by this runtime. The SQL creates `uuid-ossp`; confirm extension policy with the database owner.

## Required backup before any approved conversion

- Quiesce API/worker writes or acquire an application-wide consistent snapshot. Do not copy a changing file and assume a consistent export.
- Copy the original JSON plus schema/configuration metadata into access-restricted backup storage; preserve an immutable original and SHA-256 manifest. Never put secrets or the raw dataset in Git or the public audit report.
- Verify that the backup parses, has the expected collections and counts, and can be restored to a separate disposable path. Record who verified it and the recovery procedure.
- For any already-existing target database, take and verify its own backup before approved schema work. Do not assume it is empty.

No backup or restore was performed on the shared dataset today; that is a required migration gate, not completed work.

## Proposed Day 3 implementation sequence

1. Implement a read-only exporter/validator accepting an explicit source path. Refuse default production paths, malformed collections, duplicate keys and broken references; generate a discrepancy report instead of deleting or auto-correcting records.
2. Reconcile the schema in a disposable database. Review generated migrations against the existing SQL; do not apply the scaffold blindly to an existing schema.
3. Build an explicit, versioned import mapping. Preserve ticket numbers, statuses, approvals, authorship, timestamps, histories, comments, AI logs and audit order. If IDs change internally, persist a deterministic mapping for every reference, including metadata and generic audit resource references.
4. Import into a new namespace/database with transaction boundaries, a migration batch identifier and idempotency rules. Do not switch the application yet. Stop and roll back the import on validation failures.
5. Compare source and target using collection/table counts, key uniqueness, referential integrity, per-record canonical checksums and field-specific normalization reports. Distinguish intentionally derived fields from dropped data.
6. Exercise ticket creation, comments, transitions, escalation, one-time approvals, asset custody and notifications against the new repository. Test concurrent processes, sequence allocation and failure rollback.
7. Re-import the same snapshot to verify no duplicates or altered history. Perform an isolated restore drill.
8. Only after review and explicit cutover authorization: freeze old writes, capture a fresh verified backup/delta, import and validate, switch a controlled nonproduction application, and run smoke/security tests. Keep the original source untouched.

## Risks and validation gates

| Risk | Required validation / mitigation |
| --- | --- |
| Concurrent JSON writers | Single-writer freeze before export; multi-process tests for the target |
| UUID / prefixed ID mismatch | Approved compatibility choice; total reference mapping, never silent ID loss |
| Undetected malformed data | Full schema, uniqueness and cross-collection checks; quarantine discrepancies |
| Loss of audit/history context | Record-level comparisons and historical actor/context preservation |
| Sensitive notes in logs | Review retention/redaction policy and restrict access; do not silently change historical evidence |
| Duplicate approvals/jobs | Atomic status/version checks, exact parameters, idempotent import/job keys |
| Wrong target / destructive seed | Explicit environment/path checks; never invoke db:seed during conversion |
| Unknown PostgreSQL availability | Use an approved disposable test instance; client psql 18.6 is not proof of a server |
| Unverified recovery goals | Approve RPO/RTO and prove restore; old deployment numbers are targets, not achievements |

## Recovery strategy

Before cutover, a failed import is discarded or rolled back within its isolated target; the original JSON remains authoritative. After a controlled cutover, stop writes before rollback and reconcile any target-only changes before returning to the preserved source. Do not overwrite newer production records with an older JSON snapshot. Define a journal/delta procedure and decision owner before enabling dual systems. Keep reverse-import/rollback tooling separate from automatic startup.

Day 3 acceptance: verified backup/restore, schema parity, lossless/idempotent import, transaction/concurrency tests, documented discrepancy handling and a reviewed cutover/rollback plan. No production cutover is implied.
