# GitHub integration plan

Live GitHub API confirmed the seven prerequisites are open. The order is #2 → #3 → #4 → #5 → #6 → #7 → #8 → remediation.

| PR | Current head | Current base | Stage-specific verification after the standard gate |
| --- | --- | --- | --- |
| [#2](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/2) draft | `755ca6067ae038e44914d8642404eae32d6e32f8` | `main` | `pnpm test:security`, Day 2 closure behaviors |
| [#3](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/3) open | `4dfe6358d1eba120edaa50283e2fab2ea62d12f5` | `fix/day2-closure-severity-ci` | `pnpm test`, audit replay on synthetic fixtures |
| [#4](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/4) draft | `e8145e258e848e5c98e8a6e9b769259040a27f70` | `audit/day1-day2-full-functional-review` | `DB_REQUIRED=true pnpm test:db`, migrate/import/restore |
| [#5](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/5) draft | `5d42b59ce0484512c851ee78c0ee24f0b77c3ad8` | `codex/day3-transactional-postgres` | `pnpm test:security`, OIDC Chromium with controlled issuer |
| [#6](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/6) draft | `f151b88edfa4e63da8b240d6603a5728bf6b8391` | `codex/day4-enterprise-auth-security` | `DB_REQUIRED=true pnpm test:db`, ticket workflow parity and routing |
| [#7](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/7) draft | `9f57dd0c136d60c648380cdac3ec999d85964762` | `codex/audit-remediation-m1-business-workflows` | `pnpm test:e2e:postgres`, worker kill and recovery |
| [#8](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/pull/8) draft | `f0fd3a1fb682e7eec17b0345280a19207678f02a` | `codex/day5-postgres-runtime-integration` | `DB_REQUIRED=true pnpm test:db`, shared OIDC and benchmark |
| Remediation draft | See PR head | `codex/day6-ingress-oidc-abuse-postgres-performance` | [Independent replay commands](15_INDEPENDENT_REVIEW_HANDOFF.md) |

Use the branch's pinned `npm exec --yes --package=pnpm@9.15.0 -- pnpm` for each pnpm command. Run `node scripts/verify-local.ts` wherever present. For earlier prerequisites run their declared frozen install, Prisma generation, quality and available suites. Verify current base/head, `git merge-base --is-ancestor <base> <head>`, reviewed diff and default-branch protection before each merge. Obtain eligible code-owner/maintainer approvals for each PR under repository review rules and domain review for security, identity and migrations. The four hosted jobs quality, tests, database and browser must execute successfully for the exact integration candidate. Capture PostgreSQL Chromium evidence separately.

The workflow API lists `verify.yml` as active. The latest Day 6 PR run ended in failed jobs with zero steps and a live billing-lock annotation. Maintainer-only repository Actions permissions and organization/billing settings were outside the verified read scope. [Day 6 hosted run](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42983963903)

Maintain stack ancestry if possible. Squash/rebase merges can make already-reviewed changes reappear and can conflict in migration order, shared routes and milestone docs. Before retargeting, inspect the actual merge-base and diff, replay in an integration branch, and validate ordered migration names and checksums on a clean cluster and populated fixture. Pause at the first failing stage, retain the prior known-good candidate and evidence, and fix through a reviewed follow-up. If a bad merge reached main, use a reviewed revert PR and a separately rehearsed database recovery plan. Final main acceptance requires integrated prerequisites, a green fresh run, independent replay, a restored-backup drill, and no unexplained evidence gaps. Release authorization is separate.
