# 04 — Architecture and Implementation

The repository retains its native Node API/web architecture and explicit JSON/PostgreSQL runtime selection. The shared package, API, worker, PostgreSQL repository, outbox, migrations, connector boundaries and browser portal remain intact.

The implementation preserves existing development behavior, makes PostgreSQL opt-in, and keeps mock/disabled integrations explicit. S-01, concerning the legacy `assigneeId` payload field, remains an owner compatibility decision rather than an unapproved silent change.

New domain surfaces are implemented in `apps/api/src/functional-extension.ts`, `apps/api/src/app.ts`, `apps/api/src/postgres-store.ts`, `apps/api/src/postgres-repository.ts`, `apps/worker/src/notification-worker.ts`, and the authenticated web portal. New persistence fields and SlaPolicy/SlaJob/TicketAttachment models are in `apps/api/prisma/schema.prisma` and migration `20261121000000_functional_completion`.
