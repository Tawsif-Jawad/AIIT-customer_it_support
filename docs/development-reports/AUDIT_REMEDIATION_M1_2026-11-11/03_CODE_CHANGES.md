# Code changes

- `apps/api/src/ticket-workflow.ts` contains the shared ticket creation plan, ticket-number format and escalation message. Persistence and actor resolution remain in each store's transaction.
- `packages/shared/src/index.ts` holds the catalog payload validator, active CTO selector and the existing PostgreSQL integer bound for the sequence.
- `apps/api/src/app.ts` uses the shared plan inside the existing JSON transaction. `apps/api/src/store.ts` accepts the optional sequence watermark. An existing file acquires it on the next successful creation.
- `apps/api/src/postgres-repository.ts` persists the shared plan and CTO intent in serializable transactions. The counter upsert and transition version check prevent duplicate effects from contention. `scripts/json-import.ts` advances the counter on import when a watermark is present.
- `apps/web/src/server.ts` and `apps/web/public/portal.js` render and submit catalog fields for the ordinary form and assistant. The catalog shortcut invokes the same renderer. Category changes clear category fields and preserve title and description.
- `tests/m1-workflows.test.ts`, `tests/support/m1-parity.ts` and `tests/database.test.ts` cover isolated JSON and PostgreSQL workflow behavior. Existing API and browser fixtures supply catalog values for valid submissions. Browser tests exercise labeled fields, native validation, and switching at 390 and 1280 pixels.

Implementation choices include failing escalation atomically for ambiguous recipients, choosing the first active IT administrator by creation time and ID when a ticket requires assignment, and rejecting undeclared payload keys for new submissions. Mailbox validation uses a domainless prefix and a syntactically valid manager email. It does not look up a mailbox or manager.
