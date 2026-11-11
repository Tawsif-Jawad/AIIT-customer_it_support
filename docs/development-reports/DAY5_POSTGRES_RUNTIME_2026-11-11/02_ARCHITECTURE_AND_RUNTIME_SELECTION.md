# Architecture and runtime selection

Start the API with the existing entry point. Missing `STORAGE_MODE`, `STORAGE_MODE=json` and the legacy `STORAGE_MODE=auto` select JSON. `STORAGE_MODE=postgres` requires `NODE_ENV=development` or `test`, an explicit `DATABASE_URL`, the applied schema and the enabled identity-revocation trigger. Startup fails before listening on configuration or database errors. Run migrations and synthetic seeding as explicit setup steps against a disposable database. Start the existing web proxy against that API using its configured upstream URL.

The PostgreSQL request store loads a relational projection for the route. The existing request handler applies shared authorization and ticket creation rules. The store writes targeted inserts and updates in a serializable transaction. The API buffers the response until the commit. PostgreSQL serialization and uniqueness conflicts surface as 409 and callers may retry the request. The database protects ticket number uniqueness, approval decisions, append-only records and custody history. The Day 3 operation-level repository remains available to its existing callers.

- `GET /api/live` reports the API process, storage mode and environment.
- `GET /api/ready` probes storage and returns 503 when the probe fails. `GET /api/health` retains the integration diagnostics.
- Structured API errors include a generated request ID. Responses expose the same ID in `X-Request-Id`.
- Worker readiness logs describe a successful polling cycle and aggregate queued, processing and failed counts. Logs label delivery as mock.
