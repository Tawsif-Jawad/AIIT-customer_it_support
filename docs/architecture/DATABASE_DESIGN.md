> Day 3: see [transactional repository and recovery contract](POSTGRES_REPOSITORY.md) for the new additive schema, isolated transaction/outbox implementation and tested restoration. JSON remains the active runtime; historical text below is retained.

# Persistence target schema and migration design — Day 2

Status: PostgreSQL/Prisma is the existing target in ADR-002, not a connected runtime. Existing Prisma and initial SQL were inspected; no SQL was executed. Their UUID/native-type mismatch still blocks applying the scaffold to current prefixed JSON IDs. The following refinements are a **proposal awaiting schema review**, not an applied migration. Keep the existing unexecuted migration unchanged until reviewed replacement sequencing is chosen.

## Logical schema proposal

Preserve prefixed external IDs using TEXT primary/foreign keys; choose this explicitly before generating replacement baseline migrations. Use timestamptz UTC timestamps; createdAt mandatory, updatedAt on mutable records; integer version on Ticket/Approval/Asset for compare-and-set. JSONB only for structured form data, historical metadata and tool output. Reject invalid enum states and unknown references; no blanket cascade deletion of audit/history.

| Entity / existing source | Keys, references and constraints | Index / concurrency |
|---|---|---|
| SBU / sbus | text PK, unique code, name, SLA tier | code |
| Role / roles | text PK, unique supported name; permissions | name |
| User / users | text PK; unique issuer+subject, canonical email; active flag; current roleId and sbuId FK | roleId, sbuId, active |
| Membership / proposed | userId+ sbuId composite PK, FKs; support assignment flag or separate support membership | sbuId,userId; owner-approved scope |
| Ticket / tickets | PK; unique ticketNumber; requester/category/SBU/nullable assignee FKs; status/severity checks, form JSONB, SLA and lifecycle dates | requesterId+createdAt, sbuId+status+slaDueAt, assigneeId+status; version CAS |
| TicketEvent / ticketEvents | PK, ticket/nullable actor FK; event type, state before/after, historical actor label, metadata, timestamp | ticketId+createdAt; append-only application grant |
| Comment / ticketComments | PK, ticket/author FK, historical author name/role, body, internal flag; attachment references | ticketId+createdAt; visibility policy |
| Asset / assets | PK, unique tag/serial, SBU/nullable assignee FK, status, custody acknowledgement | sbuId+status, assigneeId; version CAS |
| Custody / assets.history | PK, asset FK, actor and timestamp, action, notes; preserve legacy history | assetId+createdAt; append-only |
| Approval / approvals | PK; ticket/requester/approver FKs; requiredRole, PENDING/APPROVED/REJECTED; rationale; action type and exact validated parameter digest; expiry | ticketId+status, requiredRole+status; version+PENDING CAS |
| Notification / notifications | PK, optional ticket and recipient FKs, channel, content, QUEUED/PROCESSING/SENT/FAILED | status+nextAttemptAt; unique idempotency key, attempt limit, claim lease |
| AIActionLog / aiActionLogs | PK, ticket FK, provider/model/classification, redacted prompt, confidence, risk/policy, dry-run, tool output, result | ticketId+createdAt; no executable free text |
| AuditLog / auditLogs | PK, nullable actor/SBU FK and historical actor identity; operation/resource/decision, metadata, time | createdAt, resource+resourceId; separate append-only grants/export |
| KnowledgeArticle / knowledgeArticles | PK, unique slug, body/tags/category, approval flag, dates | approved+category; future visibility requires policy |
| AuthSession / authSessions | digest PK, user FK, expiry, revocation; never raw tokens | userId, expiresAt |

Current one-role/one-SBU user fields remain source truth until multi-membership approved. User-role join table is only needed when multiple roles are authorized. Assignments/status changes/escalations use Ticket fields + append-only TicketEvent rather than speculative duplicate tables. Attachments currently have filename/type/size metadata only; persistent storage reference, checksum, malware screening and retention need requirements before upload support. Automation executions and integration configuration tables are deferred until real executors exist; then store actor/target/operation/policy/approval/result/idempotency, never connection secrets. Comment attachment JSON and asset history must be retained losslessly during normalization.

## Non-destructive sequence

1. Freeze writers, retain access-restricted original and hash manifest; prove restore on a disposable path. Never invoke seed/reset.
2. Run `node scripts/validate-json-migration.ts EXPLICIT_COPY_PATH` for read-only counts/hash/implemented core validation. It never opens a writable store. This is tested, but not comprehensive import acceptance.
3. Extend validator for all fields/references, duplicate emails/slugs/serials, historical metadata and malformed timestamps. Produce discrepancy records privately; do not delete or auto-fix source data.
4. Approve TEXT IDs or a total legacy-ID mapping; reconcile Prisma/raw SQL, then generate versioned migrations in an empty disposable PostgreSQL database. No running database was verified today.
5. Import all 13 collections plus sessions (or intentionally invalidate sessions with an explicit policy) in one transaction with deterministic source IDs and batch hash. Insert dependencies before dependants. Conflicting existing ID with differing data fails; same hash reimport is a no-op. Count/checksum/reference comparisons are mandatory.
6. Add transaction repositories for API and durable worker outbox; optimistic versions and database sequence allocate numbers. Business mutation+history+audit+outbox share one DB transaction. Workers claim jobs atomically, retry with bounded backoff and deduplicate delivery. No dual write.
7. Rehearse concurrent API/worker operations, database failure, opposing decisions, duplicate import, rollback and restore. Only then schedule reviewed cutover: stop JSON writes, fresh backup, validate/import, compare, switch one authoritative repository, smoke test, then enable workers.
8. Pre-cutover failures discard isolated target. Post-cutover rollback stops writes and reconciles DB-only changes; never copy an older JSON over newer committed records. Define RPO/RTO, monitoring, backup retention and recovery owner before cutover.

Implemented today: JSON containment, reset denial and read-only validator. Designed: schema refinements/cutover. Blocked: full importer, migration execution, Prisma parity, real database tests and backups/restore. Do not represent this document as a completed database migration.

## Final Day 2 verification update

Implemented compatibility migration `20261109000000_preserve_text_identifiers` transactionally converts the original UUID keys/references to TEXT without changing values. Prisma now matches raw SQL, including timestamptz/defaults, historical actor/comment labels, required approval requester reference, session table and queue/ticket lookup indexes. The original migration remains unchanged. Existing PostgreSQL direction is preserved; this user-authorized development compatibility work is not approval for operational cutover.

`tests/database.test.ts` creates a disposable PostgreSQL cluster, applies both migrations, imports all 13 seed collections plus synthetic sessions, reimports identically without duplicates, rejects conflicting rows/invalid FKs/duplicate ticket numbers, verifies transaction rollback, performs pg_dump/restore, and tests upgrade of populated UUID-backed records. Prisma migrate diff reports no schema difference. These commands were executed locally on PostgreSQL 18; CI targets a disposable PostgreSQL 16 cluster and remains blocked by GitHub billing before jobs schedule. The application still uses JSON; this is verified database foundation/import work, not a runtime cutover.

`persistence-schema.ts` now validates every declared source record field type and nested attachment/custody/form structures. Store validation adds natural-key uniqueness and historical/current foreign-key checks. The read-only validator reports whole-file and canonical per-record checksums. `scripts/json-import.ts` imports in a database transaction, retains historical fields, derives current role/SBU labels from relations, checks existing records for equality and refuses overwrites. Its CLI requires explicit source, explicit loopback aiit_test target and AIIT_IMPORT_DISPOSABLE=true; no production import was executed. SQL-level audit immutability, exact-action approvals, durable outbox claims and operational cutover remain Day 3+ work.
