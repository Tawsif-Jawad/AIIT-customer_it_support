# Day 1 / Day 2 tuning report

Date: 2026-11-09. Scope: existing development functionality. No Day 3 implementation or architecture cutover.

| ID | Feature | Observed problem | Priority | Implemented tuning | Implemented? | Evidence under evidence/day1-day2 |
|---|---|---|---|---|---|---|
| AU01 | Asset acknowledgment | Retired/unassigned asset could be resurrected | P1 | Reject incompatible lifecycle states with 409 | Yes | defects-before.log; tests/audit.test.ts |
| AU02 | Custody history | Repeated acknowledgment created duplicate custody/audit | P1 | Return existing acknowledgment without mutation | Yes | defects-before.log; tests/audit.test.ts |
| AU03 | Read persistence | Every read replaced/fsynced the JSON file | P2 | Skip unchanged canonical state; retain lease and raw CAS | Yes | performance-before.json; performance-after.json |
| AU04 | Mailpit health | TCP-only stub reported delivery without SMTP | P1 | Report unavailable/undelivered; preserve mock-only API configuration | Yes | defects-before.log; tests/audit.test.ts |
| AU05 | Notification recovery | FAILED records were never retried; thrown transport errors escaped | P1 | Retry failed records on next explicit cycle; sanitize exceptions | Yes | defects-before.log; tests/audit.test.ts |
| AU06 | Pagination | Nonfinite/fractional pagination accepted | P2 | Validate finite safe integers before normal clamping | Yes | defects-before.log; tests/audit.test.ts |
| AU07 | Simulation labels | Low-risk mock reported dryRun=false; audit/asset labels overstated guarantees | P2 | Set dryRun=true and truthful local-audit/custody labels | Yes | Source comparison; API assertions; browser screenshots |
| AU08 | Logout feedback | Failed logout silently cleared local UI session | P1 | Keep session and show retry feedback on failure | Yes | browser-defects-before.log; browser-audit.log |
| AU09 | Ticket detail race | Delayed earlier response replaced latest selected detail | P1 | Discard response when selected ticket changed | Yes | browser-defects-before.log; browser-audit.log |
| AU10 | Cookie parsing | Malformed encoded cookie caused logout 500 | P2 | Reuse safe session-token extraction | Yes | cookie-before.log; tests/audit.test.ts |
| AU11 | Notification privacy | Requester saw global mock delivered count | P1 | Scope count to recipient; preserve approved privileged scope | Yes | notification-scope-before.log; tests/audit.test.ts |

Seven P1 and four P2 findings were fixed; no new P0 was confirmed. The first six API regressions failed on the base and passed after fixes. AU08/AU09 failed against the exact base web source in a disposable harness. AU10/AU11 have individual failing-before logs. AU07 is supported by source comparison and final assertions, not a separate complete baseline execution. Initial browser harness selector/module/fixture errors are retained separately and are not application defects.

## Measured optimization

100 sequential injected GET /tickets requests on synthetic data, same local probe: file replacements 100 → 0; median 5.048625 → 0.439209 ms; p95 6.595875 → 0.865750 ms. See JSON measurements and scripts/audit-performance.ts. This is a single paired local sample without network, not production throughput or a load/soak benchmark. Read locking, validation, mutation durability and conflict checks remain in place.

## Deferred tuning and preserved behavior

P1 before enterprise deployment: replace development identity, adopt the approved runtime PostgreSQL repository, durable queue/retry/backoff and dependency readiness, externally protected audit storage. These are incomplete foundations, not features silently implemented here. Hosted CI remains a release gate.

P2: category-specific form rendering/validation, complete OpenAPI schemas, real TLS proxy fixture, broader accessibility/screen-reader and load/soak testing, request cancellation and conditional data fetching. No measured memory-growth or production capacity claim is made.

Preserved: existing product design, deterministic AI fixtures, ownership/current-SBU rules and approved IT/CTO global scope, ticket state graph, approval replay protections, fail-closed production configuration, JSON lease/CAS/atomic writes, and disabled corporate writes. Changing these would add unapproved policy or Day 3 scope. Retry is only on an explicit processing cycle, without durable scheduling or exactly-once delivery.
