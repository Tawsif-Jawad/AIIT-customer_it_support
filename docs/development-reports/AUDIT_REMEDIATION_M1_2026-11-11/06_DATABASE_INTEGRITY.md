# Database integrity

The suite creates a loopback PostgreSQL cluster under a temporary directory and applies the existing four migrations. It checks Prisma schema parity, upgrades populated legacy UUID data, preserves historical identifiers and checks idempotent concurrent import and conflict rollback.

The sparse import fixture keeps `INC-2024-9100` and a separate imported watermark. Creation allocates above the maximum stored suffix and the persisted counter. Parallel writers retry explicitly reported serialization conflicts and produce distinct numbers. JSON checks empty history, year boundaries, deletion and restart, sparse history, identical concurrent submissions and rollback.

A late PostgreSQL notification job failure rolls back the ticket, event history, AI action, approval, audit, intent and counter. Existing tests also inject failures into escalation and approval. The JSON regression injects an intent failure in each workflow and compares the full state before and after.

Backup and restore checks compare the source import manifest and the full mutated repository state, including versions, counter and outbox. See the disposable PostgreSQL test log in [verification evidence](07_TEST_EXECUTION.md).
