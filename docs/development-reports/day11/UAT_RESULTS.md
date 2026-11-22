# UAT results

Engineering rehearsal used synthetic roles and automated API, database and Chromium tests. Formal stakeholder acceptance is pending for every case. The result column reflects the evidence available for the listed case.

## Employee

| Case | Actual result and evidence | Rehearsal | Stakeholder |
|---|---|---|---|
| E-01 · Login | Covered by passing OIDC Chromium. | PASS | Pending |
| E-02 · Dashboard | Covered by passing Portal Chromium. | PASS | Pending |
| E-03 · Ticket creation | Covered by passing Portal Chromium. | PASS | Pending |
| E-04 · Status tracking | Covered by passing Audit Chromium. | PASS | Pending |
| E-05 · AI troubleshooting | Covered by passing Portal and audit Chromium. | PASS | Pending |
| E-06 · Notifications | Covered by passing Audit Chromium and PostgreSQL recipient checks. | PASS | Pending |
| E-07 · Asset acknowledgment | Covered by passing PostgreSQL parallel custody. | PASS | Pending |
| E-08 · Closure | Covered by passing Audit Chromium. | PASS | Pending |
| E-09 · Mobile | Covered by passing Audit Chromium responsive cases. | PASS | Pending |

## IT administrator

| Case | Actual result and evidence | Rehearsal | Stakeholder |
|---|---|---|---|
| I-01 · Assigned queue | Covered by passing Day 7 assignment tests. | PASS | Pending |
| I-02 · Prioritization | Covered by passing Audit Chromium and API inventory. | PASS | Pending |
| I-03 · AI handoff | Covered by passing Integration API tests. | PASS | Pending |
| I-04 · Reassignment | Covered by passing Day 7 PostgreSQL and audit Chromium. | PASS | Pending |
| I-05 · SLA monitoring | Covered by passing Functional completion and PostgreSQL scheduler. | PASS | Pending |
| I-06 · Asset registration | Covered by passing Functional completion. | PASS | Pending |
| I-07 · Handover | Covered by passing Functional completion and PostgreSQL runtime. | PASS | Pending |
| I-08 · Maintenance | Verified maintenance state and custody history in functional completion. | PASS | Pending |
| I-09 · CTO escalation | Covered by passing Day 9 role acceptance and audit Chromium. | PASS | Pending |
| I-10 · Reporting | Covered by passing Functional completion and PostgreSQL parity. | PASS | Pending |

## CTO

| Case | Actual result and evidence | Rehearsal | Stakeholder |
|---|---|---|---|
| C-01 · Dashboard | Covered by passing Portal Chromium. | PASS | Pending |
| C-02 · Critical escalation | Covered by passing Audit Chromium and Day 9 role acceptance. | PASS | Pending |
| C-03 · Approval | Covered by passing Day 9 role acceptance and PostgreSQL runtime. | PASS | Pending |
| C-04 · Approval rejection | Covered by passing API inventory and PostgreSQL opposing decisions. | PASS | Pending |
| C-05 · Expiry | Expiry rejection verified with IT and CTO actors. | PASS | Pending |
| C-06 · Cross-SBU | Policy approval pending. | BLOCKED | Pending |
| C-07 · SLA breach | Covered by passing PostgreSQL parallel SLA and report parity. | PASS | Pending |
| C-08 · Audit | Covered by passing Audit Chromium and PostgreSQL runtime. | PASS | Pending |

See [test evidence](TEST_EVIDENCE.md) for execution totals. Signoff record fields: case ID, build SHA, role, tester, date, actual result, evidence URL, disposition and approver.
