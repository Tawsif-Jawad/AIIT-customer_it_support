# Day 5 PostgreSQL runtime integration

The native Node HTTP API and portal can run against PostgreSQL with explicit development or test configuration. Both storage modes use the same HTTP workflow and authorization handlers. PostgreSQL persists digest-backed sessions, ticket state, history, audit records and notification jobs. A separate worker consumes those jobs with a mock mail transport.

The source starts from Milestone 1 commit `f151b88edfa4e63da8b240d6603a5728bf6b8391`. The draft targets the Milestone 1 branch. [Draft PR #7](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/7)

See [final acceptance](13_FINAL_ACCEPTANCE.md), [command results](10_TEST_EXECUTION.md) and [structured evidence](DAY5_RESULTS.json).
