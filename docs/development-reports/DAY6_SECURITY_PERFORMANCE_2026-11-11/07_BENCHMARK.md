# Staging-scale synthetic benchmark

Ran `node scripts/benchmark-postgres.ts` on macOS Darwin 25.5.0, Apple M3, eight logical cores, 8 GiB RAM, Node 26.8.1 and PostgreSQL 18.6. The script creates its own cluster and two independent API processes, each configured for up to eight Prisma connections. Three incrementally seeded workloads include 125 users, multiple SBUs, assignments, ticket events, approvals, audits and notification jobs. It issues five warmups and 120 measured HTTP requests per route and scale at concurrency eight. One mock worker processes a 150-job batch during the read workload. Connection and process measurements are point-in-time samples.

HTTP latency in milliseconds

| Seeded tickets | Latest page p50 / p95 / p99 | Owned category search p50 / p95 / p99 | Analytics p50 / p95 / p99 |
| ---: | ---: | ---: | ---: |
| 1000 | 8.24 / 34.98 / 81.28 | 6.36 / 10.41 / 13.80 | 5.41 / 8.50 / 9.34 |
| 10000 | 9.09 / 17.57 / 18.71 | 10.21 / 19.03 / 20.84 | 13.12 / 20.26 / 21.50 |
| 50000 | 17.05 / 27.50 / 30.44 | 15.17 / 23.72 / 31.18 | 43.61 / 78.25 / 82.39 |

| Seeded tickets | 20 creates elapsed | 409 retries | Mock jobs/s | Connections observed |
| ---: | ---: | ---: | ---: | ---: |
| 1000 | 117.65 ms | 10 | 333.7 | 12 |
| 10000 | 154.97 ms | 14 | 330.4 | 17 |
| 50000 | 132.36 ms | 10 | 253.1 | 17 |

At the largest scale, the indexed 25-row page query executed in 0.030 ms. The unbounded projection query on the same database executed in 8.254 ms. This comparison measures query paths on one database. The historical suffix scan took 62.626 ms versus 0.019 ms for the counter read. Grouped ticket analytics took 12.292 ms and its scoped approval count sample took 2.313 ms. The full evidence includes planner nodes and indexes, connection counts, API RSS and cumulative CPU time, and harness resource usage.

Each create batch allocated 20 unique ticket numbers after retries. Worker retry and crash behavior were fault-injected separately in the database suite. Proposed Day 7 rehearsal targets are p95 under 75 ms for listing and owned search and under 120 ms for analytics at this workload. Sustained throughput, host-level peaks and production targets require a representative staging environment. [Machine-readable benchmark](evidence/benchmark.json)
