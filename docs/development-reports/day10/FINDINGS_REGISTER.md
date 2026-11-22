# Findings register

| ID | Severity | Component and evidence | Status and test | Residual risk |
|---|---|---|---|---|
| D10-01 | Medium | `GET /api/reports/summary` previously used organization-wide pending approvals alongside SBU-filtered IT report data. | Fixed by limiting approval counts to the report's ticket set. Functional regression checks IT and CTO totals. | Shared organization-wide operational access remains subject to owner review. |
| D10-02 | Low | Approval decision handler previously returned record-dependent responses before checking whether the caller had a decision role. | Fixed by checking role before lookup. Functional regression checks uniform denials for employees. | Authorized approvers retain record lookup; organization-wide access is policy-dependent. |
| D10-03 | High | `postgres-runtime.ts`, `isolation.ts` and the worker enforce development/test destinations and mock or owned test transports. The requested production topology cannot start under these guards. | Open release blocker. Runtime startup and isolation tests verify the guards. | Approved production configuration and real environment evidence remain outstanding. |
| D10-04 | High | Shared ticket policy grants IT and CTO global access. Asset, approvals and audit handlers also expose privileged views across SBUs. | Open policy gate. Existing requester scope and privileged-path tests document current behavior. | Stakeholders must approve these entitlements or specify delegated office permissions before release. |
| D10-05 | Medium | Controlled SMTP acceptance can repeat after worker termination before database acknowledgment. Rehearsal records two acceptances and one durable job with a stable Message-ID. | Open. Controlled staging rehearsal covers the ambiguous-delivery boundary and retry behavior. | Relay-side deduplication and handling of repeated delivery remain unresolved. |
| D10-06 | Medium | Concurrent custody and parallel durable SLA processing lack separately identified contention evidence in the exercised suite. | Open verification gap. Lifecycle and sequential SLA checks pass; test fixtures are listed in E2E verification. | Release qualification needs explicit concurrent cases and final-state assertions. |

Critical findings were not confirmed in the reviewed scope. Evidence for the fixed issues is limited to source review and defensive regression coverage.
