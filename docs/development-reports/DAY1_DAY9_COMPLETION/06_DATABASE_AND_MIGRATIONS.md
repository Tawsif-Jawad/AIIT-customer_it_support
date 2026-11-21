# 06 — Database and Migrations

Prisma schema validation passed with a synthetic `DATABASE_URL`. PostgreSQL tests passed migration, import, rollback, concurrency, session, outbox and restore scenarios against disposable PostgreSQL 18.6.

The migration suite reported 57 database tests passing. Operational migration, target backup/restore, RPO/RTO and compatibility review remain formal gates.

Migration `20261121000000_functional_completion` adds ticket SLA fields, approval binding/expiry fields, asset lifecycle fields, SLA policy/job tables and ticket attachments. Prisma migrate diff and disposable PostgreSQL migration tests pass.
