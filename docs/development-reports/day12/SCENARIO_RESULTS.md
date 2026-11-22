# Scenario results

`corepack pnpm synthetic:demo` exercises actual application HTTP routes over the portal proxy, runs the existing worker, and prints each successful case and SMTP accepted count. Assertions also run in `tests/synthetic-office.test.ts`.

| Case | Verified outcome |
|---|---|
| A Outlook | AI returned guidance. Employee reopened the proposed resolution and the ticket entered the IT queue. |
| B Internet | Wi-Fi fault observation was captured in the ticket passed to deterministic triage. IT advanced the request, a simulated repair restored availability, and IT recorded proposed resolution. |
| C Laptop | IT registered and assigned a laptop in the employee's SBU. Two acknowledgments produced one custody audit entry. |
| D Account | Employee could request access, employee decision was denied, and IT approved the bound request. Directory execution remained a dry run. Simulator disable/enable is separately audited and tested. |
| E CTO | IT escalated a critical ticket. IT was denied the CTO approval. CTO approved and updated the ticket with history persisted. |
| F SLA | A disposable past deadline triggered two competing worker calls. One completed breach job committed. |
| G Expiry | CTO decision on an expired approval returned HTTP 410 and the request remained pending. |
| H SBU | A second-SBU employee could not read the original ticket, and a different-SBU employee could not acknowledge the assigned asset. IT report access followed the existing policy. |

The 27 Day 11 cases remain the stakeholder acceptance plan. Day 12 adds automated role sign-in and these scenario checks. Stakeholder signoff and privileged office/SBU delegation remain pending. See [Day 11 UAT](../day11/UAT_TEST_PLAN.md).
