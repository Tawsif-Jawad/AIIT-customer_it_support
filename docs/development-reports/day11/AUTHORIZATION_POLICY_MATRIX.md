# Authorization policy matrix

| Principal | Tickets | Approvals | Assets | Notifications | Dashboards and audit |
|---|---|---|---|---|---|
| Employee | Own requester identity and same SBU | Decision denied | Assigned and same SBU, acknowledge own custody | Current recipient only | Own ticket analytics, report and audit denied |
| Assigned IT administrator | Assignment identifies owner; existing IT role can work across organization | IT decisions for valid bound requests | Existing global IT register and lifecycle | Current recipient only | Existing global ticket analytics and audit; report ticket, asset and approval totals limited to own SBU |
| Office-level IT administrator | Dedicated entitlement unimplemented | Unimplemented | Unimplemented | Recipient restriction remains | Per-office reporting entitlement unimplemented |
| SBU-level IT administrator | Dedicated entitlement unimplemented | Unimplemented | Unimplemented | Recipient restriction remains | Existing IT report filter alone does not delegate access |
| CTO | Existing global ticket scope and CTO state changes | IT and CTO decisions with valid binding; audited | Existing privileged views and operations | Current recipient only; worker routes resolution escalation to active CTO | Organization report and audit |
| Disabled account | Denied on local disable and session check | Denied | Denied | Denied | Denied |
| Service account | Interactive API denied | Denied | Denied | Interactive API denied | Denied |
| Unauthenticated or unmapped | Protected API denied | Denied | Denied | Denied | Denied |

Existing global grants remain pending stakeholder confirmation for production. Proposed default is deny across office/SBU unless an explicitly assigned support grant or an approved escalation grants visibility. An office/SBU membership model, assignment and revocation owner, and deterministic CTO delegation need approval before implementation. Where an IDP account is disabled, verify prompt propagation to local account state and session revocation. Ticket text and provider group claims confer no grants.
