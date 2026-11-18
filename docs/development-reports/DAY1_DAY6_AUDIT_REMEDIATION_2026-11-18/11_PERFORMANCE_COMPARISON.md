> Follow-up evidence and current gate state are in [gate reverification](17_GATE_REVERIFICATION.md). This report records the original remediation submission.

# PostgreSQL performance comparison

Day 6 SHA `f0fd3a1fb682e7eec17b0345280a19207678f02a` and remediation code SHA `28d3bb2fb2544bec84d295d448f34ff20426ec76` used the same benchmark harness, Node 26.8.1, PostgreSQL 18.6, a disposable cluster, and a mock worker during the read phase. One- and two-process runs use eight concurrent clients and 120 observations per route and size. Dataset sizes were 1,000, 10,000 and 50,000 seeded tickets. The legacy unpaginated approval feed was sampled up to 10,000 tickets after an exploratory 50,000-ticket run was stopped for duration. All four comparable runs exited 0. These are single local trials.

| API processes | Seeded tickets | Route | p50 ms before → after | p95 ms before → after | p99 ms before → after | Requests/s before → after |
| ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 1 | 50,000 | Latest tickets | 26.84 → 12.62 | 47.18 → 17.40 | 50.56 → 19.73 | 176.6 → 555.9 |
| 1 | 50,000 | Analytics | 90.03 → 32.36 | 154.01 → 38.97 | 168.27 → 40.26 | 52.1 → 213.7 |
| 1 | 50,000 | Admin notifications | 336.61 → 6.90 | 661.67 → 9.11 | 673.36 → 9.60 | 12.1 → 993.5 |
| 1 | 50,000 | Employee notifications | 408.47 → 35.58 | 705.55 → 40.67 | 856.47 → 42.66 | 11.3 → 212.1 |
| 1 | 10,000 | Approval list | 1027.78 → 83.69 | 1930.52 → 96.33 | 2044.10 → 99.18 | 4.1 → 90.2 |
| 2 | 50,000 | Latest tickets | 15.76 → 9.91 | 23.54 → 20.34 | 28.20 → 39.31 | 352.2 → 578.6 |
| 2 | 50,000 | Analytics | 37.97 → 30.63 | 70.72 → 45.24 | 72.00 → 47.28 | 114.9 → 206.8 |
| 2 | 50,000 | Admin notifications | 171.76 → 6.97 | 334.00 → 7.82 | 346.73 → 9.70 | 24.1 → 1045.5 |
| 2 | 50,000 | Employee notifications | 185.95 → 25.04 | 342.37 → 30.15 | 348.21 → 32.08 | 23.7 → 286.4 |
| 2 | 10,000 | Approval list | 548.79 → 66.79 | 1028.52 → 80.68 | 1111.82 → 101.55 | 7.8 → 109.0 |

The two-process ticket list improved p95 and throughput, while its p99 rose from 28.20 to 39.31 ms. The two-process create run also took longer and saw three additional retries. Treat these as measured regressions in this trial and repeat at the intended production concurrency before cutover.

## Concurrent writes

Each stage issued 20 creates with a retry budget and checked the resulting ticket numbers were unique. Removing the global queue initially exposed avoidable same-process races on the ticket counter. The final code queues ticket creation only within an API process, before opening its database transaction. Other routes still use request-local concurrent transactions.

| Processes at 50,000 tickets | Created before → after | Conflicts before → after | Total elapsed ms before → after |
| ---: | ---: | ---: | ---: |
| 1 | 20 → 20 | 0 → 0 | 130.9 → 124.1 |
| 2 | 20 → 20 | 13 → 16 | 132.5 → 171.0 |

## Resource observations

At 10,000 tickets, the single-process API RSS sample after traffic was 605808 → 377040 KiB. Database connection snapshots were 9 → 10, including the harness connection. Full samples and query plans are in the JSON. Peak pool usage, per-route allocation and steady-state host saturation were outside these samples.

The separate notification probe recorded ten Prisma query events per warm request in both revisions, including session, abuse and transaction events. At 10,000 synthetic notifications the day 6 feed fetched 10,000 rows for either actor. The indexed revision returns 50 data rows for an administrator using the ordered index and 500 data rows for a 5% employee recipient using the recipient index. Delivery totals are computed by separate aggregate queries. The global delivery count still scans all matching rows. See [query plans and row counts](06_DATABASE_QUERY_OPTIMIZATION.md).

[Day 6 with one process](evidence/benchmark-day6-one-process.json) · [Day 6 with two processes](evidence/benchmark-day6-two-processes.json) · [Remediation with one process](evidence/benchmark-remediated-one-process.json) · [Remediation with two processes](evidence/benchmark-remediated-two-processes.json) · [Preliminary write-contention run](evidence/benchmark-preliminary-contention.json)
