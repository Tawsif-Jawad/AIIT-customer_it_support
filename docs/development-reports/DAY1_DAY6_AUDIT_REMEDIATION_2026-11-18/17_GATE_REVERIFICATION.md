# Day 1–6 gate reverification

## Source and setting

PR #9 continues to target Day 6 at `f0fd3a1fb682e7eec17b0345280a19207678f02a`. The follow-up started from `e451915e8eaea7cbe3e7ba0d64f2bc803cfda772` on the same remediation branch. For independent acceptance, take the exact current SHA from [draft PR #9](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/9). The prior reports retain evidence from their recorded revisions.

The owner reported GitHub Support removed the account billing lock. Authenticated repository permissions returned `enabled: false` independently of the workflow file's active state. With explicit owner authorization, the API update supplied only `enabled: true`. Readback confirmed enabled. The first [hosted replay](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/44244225030) executed the four jobs on the old SHA and failed in quality at the then-unresolved full audit. The workflow now also runs the production audit, the full native suite with PostgreSQL available and the PostgreSQL Chromium suite. See the final PR head checks for candidate acceptance.

## Dependency resolution

The original full registry audit reported CVE-2026-112366 for two transitive Picomatch versions. Tailwind 3.4.17 introduced 2.3.2 through Chokidar/micromatch and 4.0.7 through Sucrase/tinyglobby. The required TypeScript ESLint parser/plugin introduced 4.0.7 via typescript-estree, tinyglobby and fdir. The native portal builds no Tailwind assets and the repository has no Tailwind invocation. Removing that unused dependency eliminated the 2.x paths. Registry inspection found 4.0.7 the latest official release, with no fixed upstream release. Older typescript-estree candidates switch to fast-glob, which also resolves affected Picomatch 2.x. The latest parent still uses tinyglobby.

A targeted pnpm override resolves only tinyglobby's matcher to `@ryotsu/picomatch@4.0.7-a`, including fdir's optional peer. The npm tarball SHA-512 matched its recorded provenance, which binds the package to fork source commit `3ab5a7627d480259e3d9ca67fbc14c125d374f0e`. Published JavaScript, entry points and license matched the pinned source. The reviewed diff changes the repeated-star branch handling and contains additional bracket, newline and globstar corrections. The reproduction timed out in isolated Picomatch 4.0.7 and completed against the pinned fork. The committed regression checks the actual matcher behind the TypeScript parser, ordinary matching, and dangerous non-matches under a subprocess timeout. Required ESLint, TypeScript and browser tooling remain in place. The application accepts no HTTP glob patterns into this development matcher. No audit ignore or severity change was applied.

Both full and production dependency audits report zero known advisories on the resolved graph. The narrow fork pin is a maintenance decision. Revisit it when a verified upstream fix is published. [Advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) · [Fork source](https://github.com/ryotsu-kankichi/secured-picomatch/tree/3ab5a7627d480259e3d9ca67fbc14c125d374f0e) · [Before audit](evidence/closure/audit.json) · [After audit](evidence/closure/audit-after.json) · [Isolated matcher reproduction](evidence/closure/matcher-replay.json)

## Remediation rechecks

| Finding | Current evidence |
| --- | --- |
| IMP-01 | Stack remains #2 → #3 → #4 → #5 → #6 → #7 → #8 → #9. Restored hosted execution reached the previously blocked job steps. |
| IMP-03 | Blocked-write regression, concurrent reads, numbering, approval/escalation decisions, session isolation and revocation, atomic audit/outbox, rollback and worker recovery are covered by the PostgreSQL suite. |
| IMP-04 | Localized abuse, IPv4/IPv6 grouping, two-process counters, expiry, provider/database failure and callback replay are exercised. The eight shared partitions bound admission and isolate some local floods. Clients behind the same network group share availability, and distributed sources can saturate all groups. Production issuer and ingress capacity remain unverified. |
| IMP-10 | Replayed ticket pagination and role-scoped approvals/assets. Moved the protected knowledge query after authorization while preserving approved-only results and literal case-insensitive search. The notification probe verifies the indexed 50-row administrator feed and recipient-scoped employee feed. The API exposes no notification cursor or page parameter. Existing complete authorized responses retain their contract. |
| IMP-11 | Nonce CSP denies the injected script while Chromium covers employee, IT and CTO workflows and session restoration. Isolated TLS tests verify HTTPS origin requirements and edge-owned HSTS. The Playwright modes now use separate trace directories after a concurrent local run exposed an artifact cleanup race. |
| IMP-13 | Reproduced a synthetic secret persisting through new ticket titles and free-text service fields. Shared workflow now redacts titles and textarea fields as well as descriptions before persistence and derived approvals/notifications. Tests inspect JSON and PostgreSQL records, reads/search, AI logs and audit records. Validated identifiers, enumerations, booleans and historical data preserve their contract. |

## Repeated performance comparisons

Replayed three paired rounds with two API processes, eight concurrent read clients, 120 samples per route, disposable PostgreSQL 18.6 and Node 26.8.1. The first two remediation rounds used `4b250fb`; the third used code revision `485a85e`. One targeted privacy test ran during the experiment, so treat results as development observations. At 50,000 synthetic tickets all 20 writes committed per round with unique numbers.

| Metric | Day 6 median | Remediation median |
| --- | ---: | ---: |
| Ticket-list p95 | 23.92 ms | 17.25 ms |
| Ticket-list p99 | 27.64 ms | 35.56 ms |
| Ticket-list throughput | 352.4 requests/s | 633.6 requests/s |
| Administrator notification p95 | 338.74 ms | 8.24 ms |
| Create retries per 20 tickets | 18 | 10 |
| Total time for 20 creates | 126.35 ms | 122.41 ms |

Ticket-list p99 varied from 22.60–34.42 ms on Day 6 and 19.93–39.24 ms on the remediation branch. The higher median p99 remains a performance trade-off alongside higher throughput. The earlier write-retry increase did not reproduce across these rounds. No production SLO is approved, so the measured tail remains relevant for an ingress-scale rehearsal. [Raw results](evidence/closure/additional-exits.txt) · [Latest notification query plans](evidence/closure/projection-final.json)

## Local verification and preservation

The tested code candidate was `485a85e97b7f148ec3fa481ffd171ea9159ae83f`. All twelve pinned pnpm commands exited 0. Native, security, PostgreSQL, default Chromium and PostgreSQL Chromium reported 172, 50, 56, 23 and 16 passes respectively, with zero skips. The verifier and browser tests used disposable fixtures. The original `.env` and operational JSON match their pre-remediation SHA-256 hashes.

[Verifier command and exit record](evidence/closure/summary.json) · [PostgreSQL Chromium log](evidence/closure/candidate-postgres-browser.log) · [Production audit](evidence/closure/candidate-audit-prod.log) · [Preservation hashes](evidence/closure/preservation.json)

## Independent reviewer package

1. Record PR #9's exact head and base, then run `git diff --name-status f0fd3a1fb682e7eec17b0345280a19207678f02a...HEAD`.
2. Use Node 26.8.1 and pnpm 9.15.0. Run `node scripts/verify-local.ts`, then `npm exec --yes --package=pnpm@9.15.0 -- pnpm test:e2e:postgres` and `npm exec --yes --package=pnpm@9.15.0 -- pnpm audit --prod --audit-level=moderate`. Use disposable data and capture exits and skip counts.
3. Run `node --test tests/dependency-security.test.ts`. Confirm the lockfile and package provenance and review the original versus fork timeout evidence. Verify both audits and the complete pnpm dependency graph.
4. Replay the PostgreSQL isolation, OIDC, TLS, browser and privacy cases from the [original reviewer instructions](15_INDEPENDENT_REVIEW_HANDOFF.md). For performance, use the benchmark script with `AIIT_BENCH_API_PROCESSES=2` and compare complete distributions and retries across multiple paired trials.
5. Confirm the four successful hosted jobs against the exact PR SHA and verify preservation evidence. Record independent disposition on every mandatory gate and the final verdict. Independent acceptance requires this external disposition. Production identity, SMTP, edge capacity and AI rollout remain separate release decisions.
