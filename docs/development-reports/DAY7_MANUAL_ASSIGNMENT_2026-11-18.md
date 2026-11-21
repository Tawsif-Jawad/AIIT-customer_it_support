# Day 7 development and verification

18 November 2026 · AIIT controlled manual assignment pilot

## Executive summary

Local engineering verification passed on JSON and disposable PostgreSQL. Day 7 adds IT-only assignment and reassignment, a portal assignment form, an assigned-to-me queue filter, history, and durable recipient notifications. Formal acceptance remains partial pending independent review and integration of Days 1–6. Production readiness remains open.

The initial Day 7 hosted run failed in the native suite before assignment code ran. Both tests copied an administrator with an empty OIDC subject, which the persistence schema rejects. The initial hosted result was 172 passed, 2 failed, 0 skipped on Ubuntu 24.04. The local focused reproduction failed both cases on the same invalid fixture. The corrected fixtures use unique, valid synthetic subjects. [Initial Day 7 run](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/44251215615)

## Repository and dependency baseline

PR #10 starts from PR #9 at `fc5e1b4418465d74ea896a25f308d6d62adc3ae3`. Its audited starting head was `cfb85bfb9a11da9d9a89f68e67fa84f859e6f106`. The Day 7 changes extend that branch. The original local checkout was on the Day 6 head. Work and verification used a separate clone of the exact Day 7 branch with isolated fixtures.

Each PR targets the branch named by the preceding PR, with #2 targeting main at `b6fae621ad52d3fc6b633ad923db6df1a8de1fb8`. All nine PRs were open and unmerged at audit. #3 was open for review and the others were drafts. GitHub returned zero submitted reviews across the stack.

| PR | Head at audit | Base | Hosted PR result at that head |
| --- | --- | --- | --- |
| #2 | `755ca6067ae038e44914d8642404eae32d6e32f8` | main | [Failed](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42604296311) |
| #3 | `4dfe6358d1eba120edaa50283e2fab2ea62d12f5` | #2 | [Failed](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42611874733) |
| #4 | `e8145e258e848e5c98e8a6e9b769259040a27f70` | #3 | [Failed](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42763456484) |
| #5 | `5d42b59ce0484512c851ee78c0ee24f0b77c3ad8` | #4 | [Failed](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42767066329) |
| #6 | `f151b88edfa4e63da8b240d6603a5728bf6b8391` | #5 | [Failed](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42976460416) |
| #7 | `9f57dd0c136d60c648380cdac3ec999d85964762` | #6 | [Failed](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42980339711) |
| #8 | `f0fd3a1fb682e7eec17b0345280a19207678f02a` | #7 | [Failed](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42983963903) |
| #9 | `fc5e1b4418465d74ea896a25f308d6d62adc3ae3` | #8 | [Passed](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/44247987897) |
| #10 | `cfb85bfb9a11da9d9a89f68e67fa84f859e6f106` | #9 | [Database job failed](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/44251215615) |

The Days 1–6 reports record the earlier billing lock, later hosted restoration, PostgreSQL request isolation and workflow parity, OIDC budgets and replay protection, ingress hardening, redaction, and dependency remediation. PR #9's hosted pass covers its head. The earlier PRs still require independent dispositions and approved verification for each integration step. Reverify the integrated main commit after the prerequisites are accepted and merged in order. [Days 1–6 final acceptance](DAY1_DAY6_AUDIT_REMEDIATION_2026-11-18/16_FINAL_ACCEPTANCE.md) · [Gate reverification](DAY1_DAY6_AUDIT_REMEDIATION_2026-11-18/17_GATE_REVERIFICATION.md)

## API and portal

- `GET /api/tickets/:id` exposes `assignment.revision` and eligible candidates as ID and display name to IT administrators on assignable tickets. IT and CTO ticket detail also includes the current assignee's display name.
- `POST /api/tickets/:id/assign` requires an explicit expected assignee (nullable), the revision returned by ticket detail, an eligible destination ID, and a trimmed 10–500 character reason. The revision is a required addition to the draft API contract. Clients read the detail again after a conflict and confirm or select the desired destination before retrying.
- `GET /api/tickets?assignedToMe=true` is IT-only and combines the authenticated administrator's ID with existing ticket visibility, filters and pagination.
- The portal allows an administrator to choose an assignee, shows the current owner and history, and preserves the draft reason when the ticket needs to be refreshed after a conflict. The recipient sees the assignment in the existing notification feed.

```json
{
  "assigneeId": "user-it-second",
  "expectedAssigneeId": "user-it-current",
  "expectedRevision": 3,
  "reason": "Workload handoff for the current IT queue"
}
```

The assignment states are `ASSIGNED_TO_IT`, `IN_PROGRESS` and `AWAITING_USER`. The authenticated actor and the active destination must have role `IT_ADMIN`. Existing global IT support authorization permits a cross-SBU assignment. Requesters retain ownership and current-SBU restrictions. CTO retains escalation governance. The endpoint writes the assignee and update timestamp while preserving status, approvals, SLA and escalation fields. An unowned eligible ticket uses `expectedAssigneeId: null`. A same-owner request with current preconditions returns `changed: false`.

## Persistence and security

Both stores compare the current owner and the number of durable append-only ticket events inside the request transaction. Checking only the owner allowed an old command to pass if the assignee changed and later returned to that owner. The revision also captures automatic routing and status changes recorded in history. No migration or data backfill is required. The PostgreSQL projection reads only the requested ticket's history for assignment and uses the existing serializable transaction. JSON uses its exclusive file lease and reloads state before evaluating the command. The HTTP wrapper buffers success through commit. Stale requests return 409 and contention can return a generic 409. Clients can refresh and retry deliberately.

A successful change creates one `TICKET_REASSIGNED` event, one corresponding audit entry, and a recipient notification in the same transaction. PostgreSQL persists the notification and outbox job together. Injected enqueue failure in JSON and a database trigger that rejects the outbox insert in PostgreSQL verify rollback. Requester-facing history retains the assignment event with internal metadata removed. The redactor handles the existing credential, bearer and card patterns plus quoted credential values for assignment. Assignment reasons are excluded from notification bodies. The browser escapes the displayed reason. The API emits generic failure messages and structured failure identifiers. Redaction is pattern-based and cannot recognize arbitrary credentials embedded in prose.

Verification exercised unauthenticated requests, employee/customer/CTO mutation denial, cross-SBU denial for requesters, approved cross-SBU IT assignment, inactive and invalid destinations, unowned tickets, two competing requests, stale and same-owner requests, owner changes away and back, durable history and audit, outbox failure, malformed payloads, secret redaction, browser escaping, and synthetic OIDC cookie/Origin/CSRF checks in both browser storage modes.

## Local verification evidence

macOS 26.5.2 ARM64, Node.js 26.8.1, pnpm 9.15.0, Prisma 6.19.3, PostgreSQL 18.6 (Homebrew), Playwright 1.65.0 and Chromium 158.0.8127.18. Runtime checks used test mode, mock mail, disposable loopback databases and local OIDC issuers. `DB_REQUIRED=true` required database coverage. The checkout contained no office `.env` or operational database. Counts are per command and include overlaps.

| Command | Exit | Passed | Failed | Skipped | Evidence |
| --- | ---: | ---: | ---: | ---: | --- |
| `pnpm install --frozen-lockfile` | 0 | — | — | — | Locked workspace install |
| `pnpm db:generate` | 0 | — | — | — | Generated Prisma Client 6.19.3 |
| `pnpm typecheck` | 0 | — | — | — | TypeScript exited cleanly |
| `pnpm lint` | 0 | — | — | — | ESLint exited cleanly |
| `pnpm build` | 0 | — | — | — | TypeScript plus module/browser-syntax verification |
| `pnpm test` | 0 | 174 | 0 | 0 | Full native suite, including both assignment stores |
| `pnpm test:security` | 0 | 50 | 0 | 0 | Dedicated security subset |
| `pnpm test:db` | 0 | 56 | 0 | 0 | Disposable PostgreSQL subset, including recovery |
| `pnpm test:e2e` | 0 | 26 | 0 | 0 | Default Chromium suite |
| `pnpm test:e2e:postgres` | 0 | 19 | 0 | 0 | PostgreSQL Chromium suite |
| `node --test tests/day7-assignment.test.ts` | 0 | 2 | 0 | 0 | Focused JSON and PostgreSQL assignment replay |
| `pnpm audit --audit-level=moderate` | 0 | — | — | — | No known vulnerabilities reported |
| `pnpm audit --prod --audit-level=moderate` | 0 | — | — | — | No known production dependency vulnerabilities reported |

An intermediate typecheck found that the test injection type only permitted object payloads. It now accepts unknown input so tests can exercise parser rejection. Typecheck and build passed on replay. Command logs are retained in the local Day 7 evidence directory. For exact-commit hosted results, see the [PR #10 checks](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/10/checks).

## Day 7 acceptance checklist

- [x] Review the complete Day 7 diff and dependency ancestry.
- [x] Verify role and state guards, status preservation, conflict behavior, redaction, history, audit and notification rollback in both stores.
- [x] Verify the portal assignment form, assigned queue, recipient feed and enterprise session protections locally.
- [x] Complete pinned local verification with zero required tests skipped.
- [ ] Obtain independent security, data integrity and workflow acceptance.
- [ ] Accept and integrate prerequisite PRs in order and verify main.
- [ ] Complete production staging and release gates.

## Outstanding risks and Day 8

Production review still needs target-database performance at representative history sizes, edge and real issuer capacity, approved SMTP and identity integration, audit retention and integrity controls, backup and restore objectives, and stakeholder UAT. Granular support-group and customer-organization assignment policies remain owner decisions. The manual assignment changes preserve current SBU and role grants. Privileged execution requires separate exact-action authorization and approval controls.

Prioritize a controlled pilot staging rehearsal in Day 8. Validate identity mapping and approved outbound mail with isolated test tenants and synthetic recipients. Exercise queue recovery, backup restore, and role-specific workflows on the target infrastructure. Keep privileged directory and mail provisioning disabled during that milestone. The 10 December 2026 target depends on independent approvals, prerequisite integration and operational acceptance.
