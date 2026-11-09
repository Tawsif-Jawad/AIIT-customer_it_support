# Day 2 permission matrix — 9 November 2026

Implemented policy resides in `packages/shared/src/index.ts`; route-specific approval, asset and directory guards remain in `apps/api/src/app.ts`. This is an interim policy, not generalized enforcement of the informational Role.permissions array.

| Operation | Customer / Employee | IT administrator | CTO | Service |
|---|---|---|---|---|
| Create support request | Own identity and current SBU | Own identity | Own identity | No interactive login |
| Ticket list/detail/comment | Own + same SBU | Organization-wide per existing SRS | Organization-wide per existing SRS | Denied interactive API |
| Confirm closure | Own ticket after proposed resolution | After proposed resolution | After proposed resolution | Denied |
| Reopen | Own ticket, valid graph edge | Valid graph edge | Valid graph edge | Denied interactive API |
| Escalate to CTO | Denied | Valid graph edge with reason | Valid graph edge with reason | Denied interactive API |
| Change CTO-escalated state | Denied | Denied pending CTO review | Valid graph edge | Denied |
| Decide IT approval | Denied | Pending, rationale required | Pending, rationale required | Denied |
| Decide CTO approval | Denied | Denied | Pending, rationale required | Denied |
| Directory fixture lookup | Denied | Allowed mock | Allowed mock | Denied interactive API |
| Audit | Denied | Existing route policy | Allowed | Denied interactive API |
| AI infrastructure writes | Denied | No real executor configured | Approval does not enable execution | Denied |

IT organization-wide scope is an explicit existing SRS grant, not inferred from title. Assigned support-SBU scopes, customer organizations within one SBU and multi-membership are **not implemented**. They require owner-approved mappings and schema changes before enterprise acceptance; Day 2 does not claim that expanded isolation gate passes.

Identity comes from a verified development token AND persisted server-side session AND current active user record. Body role/SBU/identity claims do not establish privilege. Token roles do not override current user roles. Production or missing explicit development opt-in denies development authentication. No service can use the interactive API. Internal SYSTEM_SERVICE state checks allow only triage states/targets; this is not a remotely callable worker authorization mechanism.

Approvals are one-time decisions and require server-side rationale. Exact action-parameter digest binding, expiry, versioning and separation of requester/approver are not yet implemented; approvals authorize **no actual AD/mail write**. These controls are release blockers before an executor exists. Failed state/permission checks preserve ticket state; security-denial audit entries may be committed.
