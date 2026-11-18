# Day 7 — Manual IT assignment and reassignment (18 November 2026)

## Gate and source baseline
- Development branch: `codex/day7-manual-assignment-pilot`, forked from PR #9 head `fc5e1b4418465d74ea896a25f308d6d62adc3ae3`.
- Depends on the complete PR sequence #2 → #3 → #4 → #5 → #6 → #7 → #8 → #9.
- Days 1–6 are **not formally closed**; independent review, dependency integration, main-branch checks, and owner release decisions remain outstanding.
- This change is a candidate for review, not a production release, approved business policy, or authorization for AD/mail provisioning.

## Scope
Introduce manual IT ownership changes on existing tickets, without altering the status state machine:
`POST /api/tickets/:id/assign`.

Request example:
```json
{
  "assigneeId": "user-it-second",
  "expectedAssigneeId": "user-it-current",
  "reason": "Workload handoff for the current IT queue"
}
```

Use `expectedAssigneeId: null` to assign an unowned eligible ticket. Both the expected and target assignee IDs must be explicit. No unassignment endpoint is introduced.

### Policy boundaries
- Only an authenticated `IT_ADMIN` may assign. Existing IT global support scope is retained; no new cross-SBU policy is invented.
- Recipient must be active and `IT_ADMIN`; `CTO`, customers, employees and service identities are ineligible.
- Eligible states: `ASSIGNED_TO_IT`, `IN_PROGRESS`, `AWAITING_USER`. CTO escalations, closed cases, pending user confirmation and AI-handled cases cannot be reassigned through this endpoint.
- Explicit compare-and-set on `expectedAssigneeId` returns 409 for a stale update, even when the client is attempting to restore an old assignee. Exact same-owner retry returns `200 { changed: false }` with no duplicate event or notification.
- Changing the assignee generates one `TICKET_REASSIGNED` event and audit entry and an email-and-in-app notification intent. Notes are redacted. Status, approval state, SLA and escalation authority do not change.
- Existing JSON single-writer transaction and PostgreSQL serializable request transaction are used. The PostgreSQL projection applies the assignee update with its event, audit and outbox intent atomically. The notification worker remains mock-only for this milestone.
- A notification/outbox write failure must roll back ownership, event and audit changes. PostgreSQL serialization conflicts may return a generic 409 and must be retried only after refreshing current ticket state.

## Verification commands (to be run on the exact Day 7 head)
Use Node 26.8.1 and pnpm 9.15.0, isolated fixtures and disposable PostgreSQL. Never operate on the office dataset.

```bash
npm exec --yes --package=pnpm@9.15.0 -- pnpm install --frozen-lockfile
npm exec --yes --package=pnpm@9.15.0 -- pnpm db:generate
npm exec --yes --package=pnpm@9.15.0 -- pnpm typecheck
npm exec --yes --package=pnpm@9.15.0 -- pnpm lint
NODE_ENV=test AUTH_MODE=dev_oidc MAIL_PROVIDER=mock node --test tests/day7-assignment.test.ts
node scripts/verify-local.ts
```

The complete CI workflow (quality, tests, PostgreSQL and Chromium) must pass on the exact head before independent review; skipped database checks are not acceptance. The independent reviewer must also check simultaneous assignment attempts, disabled destination identities, notification failure rollback, escaped/secret-bearing notes, role scope, and the existing CTO path.

## Remaining work / release gates
- Execute the listed verification commands and record exit codes and regression counts. No local commands have been executed in this connected GitHub-editing session.
- Independently review the Day 7 diff and replay JSON/PostgreSQL cases.
- Integrate prerequisites in dependency order and run post-merge main-branch verification.
- Decide the future support-group/SBU assignment model with Product and Security. Current `IT_ADMIN` cross-SBU scope is unchanged.
- Staging acceptance, real IdP/AD federation, approved SMTP, recovery objectives, and production infrastructure verification remain outside this PR.

## Next candidate milestone
For the limited office pilot: reviewed identity/SMTP adapters and staging rehearsal, while preserving a strict disabled-by-default boundary around privileged directory and mail writes. Broader asset management, SLAs, KB editorial workflow and LLM rollout require separate scope and evidence.
