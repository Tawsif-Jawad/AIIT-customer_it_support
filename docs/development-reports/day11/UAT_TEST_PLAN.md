# Stakeholder UAT test plan

Use the isolated nonproduction portal with three named test roles, synthetic fixtures, controlled outgoing mail, resettable state, and an assigned observer. Provision two SBUs and obtain the approved privilege matrix before cross-SBU cases. Capture the timestamp, tested build, sanitized ticket/job IDs and observed outcome. Put signed decisions in the stakeholder issue or approved evidence store.

## Employee

| Case | Preconditions and steps | Expected result |
|---|---|---|
| E-01 · Login | Use the Employee test account. Sign in via the synthetic issuer. | Session identifies the employee. |
| E-02 · Dashboard | Use the Employee test account. Open the workspace after login. | Employee panels are available. |
| E-03 · Ticket creation | Use the Employee test account. Submit an Outlook request with required fields. | Ticket number and history appear. |
| E-04 · Status tracking | Use the Employee test account. Open the ticket list and detail. | Current state and authorized timeline agree. |
| E-05 · AI troubleshooting | Use the Employee test account. Read guidance and confirm or reject it. | Outcome is recorded without privileged execution. |
| E-06 · Notifications | Use the Employee test account. Open notifications after a ticket update. | Own updates are visible. |
| E-07 · Asset acknowledgment | Use the Employee test account. Open assigned device and acknowledge it twice. | Custody is recorded once. |
| E-08 · Closure | Use the Employee test account. Confirm proposed resolution and reopen detail. | Closed state remains visible. |
| E-09 · Mobile | Use the Employee test account. Repeat list and detail at 320 px and 390 px. | Navigation and keyboard remain usable. |

## IT administrator

| Case | Preconditions and steps | Expected result |
|---|---|---|
| I-01 · Assigned queue | Use the IT administrator test account. Filter tickets assigned to the signed-in operator. | Only matching assignments appear. |
| I-02 · Prioritization | Use the IT administrator test account. Filter routed tickets by severity. | Result rows match their persisted severity. |
| I-03 · AI handoff | Use the IT administrator test account. Open a request requiring manual handling. | IT assignment and handoff are recorded. |
| I-04 · Reassignment | Use the IT administrator test account. Reassign an eligible ticket and retry with stale revision. | One commit and recipient update. |
| I-05 · SLA monitoring | Use the IT administrator test account. Run a controlled overdue review and open SLA state. | Breach and status are visible. |
| I-06 · Asset registration | Use the IT administrator test account. Register a synthetic device. | Unique asset identifiers are stored. |
| I-07 · Handover | Use the IT administrator test account. Assign and obtain employee acknowledgment. | Custody history records both steps. |
| I-08 · Maintenance | Use the IT administrator test account. Move a synthetic asset into maintenance and inspect history. | Lifecycle state and audit agree. |
| I-09 · CTO escalation | Use the IT administrator test account. Escalate an unresolved ticket with rationale. | CTO receives the routed record. |
| I-10 · Reporting | Use the IT administrator test account. Compare ticket, asset and approval facts against report. | SBU report scope and totals agree. |

## CTO

| Case | Preconditions and steps | Expected result |
|---|---|---|
| C-01 · Dashboard | Use the CTO test account. Sign in and view executive panels. | CTO views and actions are present. |
| C-02 · Critical escalation | Use the CTO test account. Open a critical ticket routed by IT. | Authorized escalation and reason are visible. |
| C-03 · Approval | Use the CTO test account. Decide a current bound request. | One decision and audit record commit. |
| C-04 · Approval rejection | Use the CTO test account. Reject a pending approval with rationale. | Rejection is visible and immutable. |
| C-05 · Expiry | Use the CTO test account. Attempt a decision after expiry. | Decision is refused without consumption. |
| C-06 · Cross-SBU | Use the CTO test account. Verify access under the stakeholder-approved matrix. | Only explicitly approved scope is visible. |
| C-07 · SLA breach | Use the CTO test account. Run a synthetic resolution breach and inspect the report. | Single escalation and CTO notification. |
| C-08 · Audit | Use the CTO test account. Open audit and reports after a decision. | Decision and actor are traceable. |
