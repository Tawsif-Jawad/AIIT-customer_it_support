# Day 2 follow-up: verified repository remediation and unresolved acceptance gates

Date: 2026-11-09. Repository baseline: main at b6fae621ad52d3fc6b633ad923db6df1a8de1fb8.

## Changes on this branch

- Restrict employee/customer state changes to confirming a resolution or reopening, blocking an owner from advancing a reopened ticket into the IT-controlled IN_PROGRESS state.
- Enforce a priority floor from the deterministic classifier: a caller cannot downgrade a critical classification to LOW. Preserve a user-reported higher severity.
- Require IT review for HIGH/CRITICAL tickets even when the issue text matches low-risk knowledge assistance.
- Add policy and API regression cases, including authorized IT transition and unauthorized employee transition, plus high/critical ticket creation cases.
- Clarify the native-runtime GitHub workflow triggers and step names. This does **not** prove hosted CI works.

## Evidence and limitations

All edits are on a review branch. Repository/source diff and presence of tests were checked via connected GitHub. The new tests have **not** been executed in this session: private repository Git cloning is unavailable in the local test container and hosted Actions is not scheduling jobs. Do not claim any new passing count or merge without validation.

GitHub reports synthetic Actions runs with empty workflow name, path `BuildFailed`, conclusion `startup_failure`, **zero jobs**, for both main and the remediation branch. Example run: https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42590858218 . Since no jobs start, failures are not evidence that application tests failed. GitHub-side Actions configuration, billing/usage, and workflow registration must be checked by the repository owner. If those are normal, escalate to GitHub Support with run IDs, workflow ID and the zero-job symptom.

## Required acceptance before merge

1. Run `npm test` on Node 26.8.1 against disposable fixtures, record pass/fail counts, including the new tests.
2. Run `npm run lint` and `npm run build`, acknowledging they only perform import/browser-syntax smoke verification.
3. Run the Day 2 HTTP smoke script and ensure no operational datasets were modified.
4. Obtain a successful GitHub Actions workflow with actual jobs. If GitHub Actions is unavailable, document alternate runner verification but keep the hosted CI gate open.
5. Complete compiler/ESLint/Playwright and real PostgreSQL, Keycloak/AD, backup/restore and staging acceptance separately. The original Day 2 report identifies these unfulfilled prerequisites.

Status: **candidate fixes committed to review branch; not yet accepted or production-ready**.
