# Day 1–6 final engineering acceptance

Verified on 18 November 2026 for [draft PR #9](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/9). The review covered the remediation diff from Day 6 base `f0fd3a1fb682e7eec17b0345280a19207678f02a`, including migrations, PostgreSQL transaction and query changes, OIDC admission, portal hardening, data redaction, dependencies, CI, tests and the associated documentation and evidence.

The tested code and test revision is `8f7e234a8c6af7e50af87f657c8f374d12130069`. The review reproduced a browser regression at the previous head `5ebe2c4c4c7742727b1ab9690519468bea4f483c`. A 503 left the ticket details panel on “Loading ticket…”. The portal now displays a retryable error for the selected ticket. The regression failed on the previous code and passed in both storage modes after the fix.

**ENGINEERING PASS** for the tested code revision. All local and hosted engineering checks succeeded. The report-only follow-up is covered by the current PR head checks linked below.

## Local verification

Node 26.8.1, pnpm 9.15.0, PostgreSQL 18.6 and Playwright 1.65.0 Chromium on macOS. PostgreSQL was required for the native suite using `DB_REQUIRED=true`. Tests used disposable storage and mock integrations.

| Command | Exit | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| `pnpm test` | 0 | 172 | 0 | 0 |
| `pnpm test:unit` | 0 | 7 | 0 | 0 |
| `pnpm test:integration` | 0 | 9 | 0 | 0 |
| `pnpm test:security` | 0 | 50 | 0 | 0 |
| `pnpm test:db` | 0 | 56 | 0 | 0 |
| `pnpm test:e2e` | 0 | 24 | 0 | 0 |
| `pnpm test:e2e:postgres` | 0 | 17 | 0 | 0 |

The focused native suites overlap with the full native suite. PostgreSQL Chromium runs the audit and OIDC browser specs.

The pinned verifier exited 0. A clean frozen install with strict peer validation downloaded all 220 packages into a fresh pnpm store. It exited 0 with lifecycle scripts enabled and the lockfile hash matched the committed copy. The frozen CI-style install, Prisma client generation and schema validation, typecheck, lint, build and Chromium installation all exited 0. Both the full and production dependency audits at the moderate threshold exited 0 and reported zero known vulnerabilities. The full suite includes the regression for the patched Picomatch used by the TypeScript lint toolchain.

## Hosted verification

The workflow runs quality, tests, database and browser jobs on Ubuntu 24.04. The database job exercises PostgreSQL 16, including the native suite and PostgreSQL Chromium. All four jobs passed in the [pull request run for the tested code revision](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/44247645293). The [checks for the current PR head](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/9/checks) provide hosted evidence.

## Preservation and remaining gates

- The SHA-256 hashes of the original checkout's `.env` and `.data/enterprise-db.json` matched before and after verification. The code fix and regression test were made in an isolated checkout.
- **Independent review pending.** PR #9 has no submitted independent review. The engineering review and test replay above are self-verification. [Independent review instructions](15_INDEPENDENT_REVIEW_HANDOFF.md)
- **Release acceptance remains blocked.** The draft prerequisite stack and owner approvals remain open. Production federation and mail, edge capacity, backup and restore rehearsal, and operational policy decisions require separate evidence. [Release blockers](14_REMAINING_RELEASE_BLOCKERS.md)
- The patched Picomatch fork remains pinned. Upstream replacement and the measured ticket-list tail latency remain follow-up items. [Dependency and performance evidence](17_GATE_REVERIFICATION.md)
