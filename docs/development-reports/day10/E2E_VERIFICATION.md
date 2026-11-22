# End-to-end verification

Test invocations and observed totals are in [test evidence](TEST_EVIDENCE.md). Expected results below describe the synthetic contract exercised by the repository tests.

| Journey | Expected result | Evidence and limit |
|---|---|---|
| Employee request | Triage, classification, routing and visible history | API inventory, PostgreSQL parity, and employee Chromium lifecycle. |
| AI-assisted resolution | Safe proposal, user confirmation, unsupported actions gated | Integration, unit governance tests and portal guidance. Deterministic provider only. |
| IT escalation | Assigned IT accepts/updates with history or escalates | API inventory, synthetic role acceptance and Chromium reassignment. |
| CTO escalation | Correct recipient and role-bound approval with final history | Synthetic requester-to-CTO acceptance, database parity, role negatives and Chromium IT/CTO review. |
| Asset handover | Register, assign, acknowledge, audit and reject invalid transition | Functional lifecycle and PostgreSQL custody acknowledgment/replay. Parallel acknowledgment records one custody change and audit. |
| SLA breach | Mark overdue ticket, record escalation and suppress repeat work | Functional SLA review verifies repeat pass. Two PostgreSQL workers process one overdue ticket into one escalation, audit record, completed SLA job and queued CTO notification. |
| Cross-office/SBU | Deny unowned records and enforce recipient boundaries | Database/browser scope cases, report and approval regressions. Privileged cross-SBU authorization remains a release policy gate. |
| Worker recovery | Recover durable jobs on restart and expired lease | PostgreSQL runtime integration and TLS staging rehearsal. SMTP sink observed duplicate acceptance at crash boundary. |
| Concurrency | Preserve one approval decision, consistent ticket assignment and durable processing | PostgreSQL covers racing request instances in reassignment, opposing approvals, custody acknowledgments, parallel SLA workers and exclusive notification job claims. Browser also checks stale reassignment. |
