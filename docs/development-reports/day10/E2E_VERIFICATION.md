# End-to-end verification

Test invocations and observed totals are in [test evidence](TEST_EVIDENCE.md). Expected results below describe the synthetic contract exercised by the repository tests.

| Journey | Expected result | Evidence and limit |
|---|---|---|
| Employee request | Triage, classification, routing and visible history | API inventory, PostgreSQL parity, and employee Chromium lifecycle. |
| AI-assisted resolution | Safe proposal, user confirmation, unsupported actions gated | Integration, unit governance tests and portal guidance. Deterministic provider only. |
| IT escalation | Assigned IT accepts/updates with history or escalates | API inventory, synthetic role acceptance and Chromium reassignment. |
| CTO escalation | Correct recipient and role-bound approval with final history | Synthetic requester-to-CTO acceptance, database parity, role negatives and Chromium IT/CTO review. |
| Asset handover | Register, assign, acknowledge, audit and reject invalid transition | Functional lifecycle and PostgreSQL custody acknowledgment/replay. Parallel custody contention remains unverified. |
| SLA breach | Mark overdue ticket, record escalation and suppress repeat work | Functional SLA review verifies repeat pass; source contains scheduled PostgreSQL worker path. Dedicated parallel scheduler coverage remains open. |
| Cross-office/SBU | Deny unowned records and enforce recipient boundaries | Database/browser scope cases, report and approval regressions. Privileged cross-SBU authorization remains a release policy gate. |
| Worker recovery | Recover durable jobs on restart and expired lease | PostgreSQL runtime integration and TLS staging rehearsal. SMTP sink observed duplicate acceptance at crash boundary. |
| Concurrency | Preserve one approval decision, consistent ticket assignment and durable processing | PostgreSQL conflicting approval and escalation cases, retry/lease checks, browser stale reassignment. Parallel custody and SLA races remain unverified. |
