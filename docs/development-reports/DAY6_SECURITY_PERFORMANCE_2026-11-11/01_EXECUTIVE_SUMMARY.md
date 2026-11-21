# Day 6 security and PostgreSQL performance

Day 6 adds authenticated proxy forwarding, shared PostgreSQL rate budgets and one-time OIDC state shared across API processes. Ticket list and analytics queries now apply authorization scope inside PostgreSQL, and ticket creation reads the historical numbering floor from one database row. The existing Node API, portal and worker run with the same storage selection and workflow policy.

See [acceptance](13_FINAL_ACCEPTANCE.md), [verification outcomes](08_VERIFICATION.md) and [benchmark results](07_BENCHMARK.md).
