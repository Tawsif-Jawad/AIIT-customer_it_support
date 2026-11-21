# JSON and PostgreSQL compatibility

JSON remains the default, including the legacy `auto` spelling. PostgreSQL remains opt-in and restricted to development and test. The existing native portal, ticket workflows, authorization grants and durable mock worker are retained. Shared request protection and shared OIDC flow state apply to PostgreSQL, while JSON is a single-process development runtime with bounded local admission state.

Paired HTTP cases verify owned and cross-SBU ticket scope, category filtering, invalid enum filters, literal search characters, large page offsets, analytics, approvals, audit and notifications. A privacy regression test verifies the established difference: PostgreSQL searches its redacted description, while JSON retains its existing representation. Neither mode receives a new path to search unredacted PostgreSQL content. [Paired test evidence](evidence/http-parity.json)
