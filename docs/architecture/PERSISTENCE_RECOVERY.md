# JSON persistence containment and recovery

Implemented and tested on Node 26.8.1, local filesystem. This is temporary containment pending the existing PostgreSQL target, not a database replacement.

Each API request attaches body listeners immediately, waits for its local request queue, acquires an exclusive `dataset.json.lock` with `open(wx)`, reloads and validates the authoritative file, performs business changes, audits and simulated notifications in memory, then validates and replaces the file once. Responses and cookie headers are buffered until commit. Server errors discard request state. Error/denial responses below 500 may commit security audit records; handlers validate permissions/state before mutation. Direct snapshot `persist()` obtains the same exclusive lease and rejects changed source bytes (`PERSISTENCE_CONFLICT`). Another process gets contention rather than silent overwrite. Retrying an entire request after 409 is explicit; no automatic retry of side effects.

The temporary file has a unique name, mode 0600, is fsynced and renamed over the original. Temp files are cleaned on ordinary failure and the lease is released. Failed replacements restore in-memory state, return 503 and leave the prior file intact (injected rename-failure test). The lease covers the whole async request, not just rename. All requests, including reads, currently take this lease: simple but limits throughput and lets slow requests block other clients. Direct `getState()` remains a mutable low-level interface; production business code must stay inside the API transaction.

The standalone JSON worker exits 1 before opening a dataset. API-local notification processing is the only supported worker path. API rejects non-mock mail transport because external side effects cannot be rolled back with this file. Durable outbox retries and multiple workers are not claimed. F08/F09 real delivery/retry remain open.

Validation covers all 13 collection shapes, required core text fields, creation timestamps, duplicate IDs/ticket numbers, user role/SBU references, ticket requester/category/SBU references, child ticket references, lifecycle enums and persisted session shape. It is not exhaustive field-by-field validation or an importer conflict/reference ledger; expand it before migration acceptance. Existing incompatible data fails closed and must be reviewed, never auto-deleted. Existing records/configuration were not rewritten by this work.

## Controlled recovery procedure

1. Stop every API/worker using the exact dataset. Ensure no writer remains, including another process/host. JSON sharing over network filesystems, symlink/path aliases and untrusted local directory users is unsupported.
2. Copy source, any abandoned temp file and lock metadata into access-restricted recovery storage. Calculate hashes. Do not log source records/tokens or publish backups.
3. Determine whether the lock owner is dead; PID alone is insufficient because PIDs can be reused. Never automatically expire/steal a lock. Only after proving no writer is alive may the operator remove the abandoned `.lock`.
4. Validate the preserved authoritative source with `node scripts/validate-json-migration.ts EXPLICIT_BACKUP_PATH`. If invalid, compare a verified backup and abandoned temp file offline. Do not merge/replace automatically.
5. Restore a chosen verified backup to a NEW disposable path and exercise read/count/reference checks and ticket workflows. Record any lost interval and obtain data-owner review before replacing an operational dataset.
6. Resume a single API owner, verify counts, sessions/authorization and a synthetic request. A stale direct store must be reconstructed and its whole operation retried; never force-persist stale memory.

Tests prove synthetic restart, failure rollback and cross-process exclusion. No real operational backup or restore was performed. Parent-directory fsync, power-loss durability, immutable audit, filesystem disaster recovery and exactly-once external side effects are **not proven**. A process killed before rename may leave a temp file and lock; availability intentionally fails closed until recovery. A response lost after commit leaves retry ambiguity; ticket creation has no idempotency key yet. Do not blindly replay POSTs after a network timeout.

## Final Day 2 executed recovery additions

`tests/integrity.test.ts` now injects a partial temporary write, kills a writer with SIGKILL while holding an uncommitted transaction, proves original bytes survive, verifies orphaned-lease denial, waits for child termination before removing only the disposable fixture lease, and reconstructs the store. A separate fixture backup/copy/restore verifies exact checksum/count/reference equality. Full source record schemas now enforce declared field types and nested structures; unknown metadata is preserved. Read-only preflight of the existing operational dataset passed without modifying it. No operational backup replacement, automatic abandoned-lock stealing, power-loss certification or multi-host JSON support is claimed.
