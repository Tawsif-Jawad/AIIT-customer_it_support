# Worker and outbox

Run `pnpm start:worker` with the explicit PostgreSQL test or development configuration. The worker uses PostgreSQL and mock mail. A claim locks the selected row with `FOR UPDATE SKIP LOCKED`, assigns a lease token, advances the attempt count and sets a deadline. The worker preserves recipient and channel and passes a stable delivery ID to the mock adapter. In-app-only jobs need no email dispatch.

The outbox completes the job and notification together, fences stale lease tokens and uses bounded backoff for unsuccessful delivery. Expired leases become reclaimable. Exhausted jobs remain visible as failed with sanitized diagnostics. Delivery semantics are at least once. An interrupted worker can lose its lease before it records success.

Tests exercised concurrent claims, unsuccessful transport, backoff scheduling, retry exhaustion, stale lease rejection, mock delivery, two worker process starts and a worker killed after a claim. The replacement worker reclaimed the interrupted job after the test advanced its lease deadline. Worker performance samples and the full command results are linked in [test execution](10_TEST_EXECUTION.md).
