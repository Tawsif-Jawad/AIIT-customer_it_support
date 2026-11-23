# AIIT — Complete Branch Inventory & Consolidation Matrix

**Audit Timestamp:** 2026-11-23T11:32:00+06:00  
**Repository:** `https://github.com/Tawsif-Jawad/AIIT-customer_it_support`  
**Verified `main` Commit:** `b6fae621ad52d3fc6b633ad923db6df1a8de1fb8`  
**Verified Day 13 Source Commit (`development` baseline):** `2ff77f25a9ace9d296f8509f692dc853eb08c697`

---

## 1. Summary of Pre-Migration Repository State

- **Pre-Migration Remote Branches on GitHub:** 20 (`origin/*`)
- **Post-Creation Remote Branches on GitHub:** 21 (`origin/development` added; 0 branches deleted pending explicit owner authorization)
- **Local Branches in Primary Workspace:** 17 (including `development`)
- **Git Worktrees:** 4 registered worktrees audited

---

## 2. Git Worktree Inventory

| Worktree Path | Checked-Out Ref (Pre-Migration) | Checked-Out Ref (Post-Migration) | HEAD SHA | Working-Tree State |
|---|---|---|---|---|
| `/Users/tawsifjawad/Documents/Work/Cutomer_IT_Support_System` | `codex/day6-ingress-oidc-abuse-postgres-performance` | `development` (tracking `origin/development`) | `2ff77f25a9ace9d296f8509f692dc853eb08c697` (+ migration docs commit) | Clean tracked state; untracked local audit folders (`docs/audits/*`), Colab screenshots (`colab-*.png`), `.env`, and `.data/enterprise-db.json` preserved safely |
| `/Users/tawsifjawad/.codex/worktrees/aiit-audit-remediation/Cutomer_IT_Support_System` | Detached HEAD | Detached HEAD | `f0fd3a1fb682e7eec17b0345280a19207678f02a` | Clean (`git status --short` empty) |
| `/Users/tawsifjawad/.codex/worktrees/aiit-day10/Cutomer_IT_Support_System` | `codex/day13-synthetic-enterprise-integration` | `codex/day13-synthetic-enterprise-integration` (behind `origin` by 18 commits) | `7374bdbf65761b977370cca16341a682fbab5598` | Clean (`git status --short` empty) |
| `/Users/tawsifjawad/.gemini/antigravity/worktrees/Cutomer_IT_Support_System/day7_argon_review_v2` | `day7_argon_review_v2` | `day7_argon_review_v2` | `f0fd3a1fb682e7eec17b0345280a19207678f02a` | Clean (`git status --short` empty) |

---

## 3. Remote Branch Consolidation Matrix (All 20 Pre-Existing Remote Branches + `development`)

Every branch was audited using exact Git commit ancestry (`git merge-base --is-ancestor`), commit range inspection (`git log <day13>..<branch>`), and patch equivalence (`git cherry -v` and file history diffs).

| # | Branch Name | Current HEAD SHA | Ahead of `main` / Behind Day 13 | Unique Commits Not in Day 13 (`2ff77f25`) | Content Missing from Day 13 | Related PR | Preservation Decision | Safe Retirement Status |
|---|---|---|---|---|---|---|---|---|
| 1 | `main` | `b6fae621ad52d3fc6b633ad923db6df1a8de1fb8` | 0 / 119 | 0 (Direct ancestor) | None | PR #1 (merged), Base of PR #2, PR #13 | **PERMANENT BRANCH 1** — Keep unchanged as protected stable baseline | **NEVER RETIRE** (Permanent branch) |
| 2 | `development` | `2ff77f25a9ace9d296f8509f692dc853eb08c697` (base) | 119 / 0 | 0 (Created from `2ff77f25`) | None | Active permanent development line | **PERMANENT BRANCH 2** — All ongoing development | **NEVER RETIRE** (Permanent branch) |
| 3 | `feature/day2-data-integrity-security` | `2d6c4dbc169bd946bad99731e4590b322c228a80` | 0 / 120 | 0 (Direct ancestor of `main` & Day 13) | None | PR #1 (Merged into `main`) | Full history in `main` and `development` | **SAFE TO RETIRE** (after owner approval) |
| 4 | `fix/day2-closure-severity-ci` | `755ca6067ae038e44914d8642404eae32d6e32f8` | 20 / 99 | 0 (Direct ancestor) | None | PR #2 (Head), PR #3 (Base) | Full history in `development` and backup bundle | **SAFE TO RETIRE** (after PR #2/#3 disposition & owner approval) |
| 5 | `audit/day1-day2-full-functional-review` | `4dfe6358d1eba120edaa50283e2fab2ea62d12f5` | 26 / 93 | 0 (Direct ancestor) | None | PR #3 (Head), PR #4 (Base) | Full history in `development` and backup bundle | **SAFE TO RETIRE** (after PR #3/#4 disposition & owner approval) |
| 6 | `codex/day3-transactional-postgres` | `e8145e258e848e5c98e8a6e9b769259040a27f70` | 35 / 84 | 0 (Direct ancestor) | None | PR #4 (Head), PR #5 (Base) | Full history in `development` and backup bundle | **SAFE TO RETIRE** (after PR #4/#5 disposition & owner approval) |
| 7 | `codex/day4-enterprise-auth-security` | `5d42b59ce0484512c851ee78c0ee24f0b77c3ad8` | 39 / 80 | 0 (Direct ancestor) | None | PR #5 (Head), PR #6 (Base) | Full history in `development` and backup bundle | **SAFE TO RETIRE** (after PR #5/#6 disposition & owner approval) |
| 8 | `codex/audit-remediation-m1-business-workflows` | `f151b88edfa4e63da8b240d6603a5728bf6b8391` | 42 / 77 | 0 (Direct ancestor) | None | PR #6 (Head), PR #7 (Base) | Full history in `development` and backup bundle | **SAFE TO RETIRE** (after PR #6/#7 disposition & owner approval) |
| 9 | `codex/day5-postgres-runtime-integration` | `9f57dd0c136d60c648380cdac3ec999d85964762` | 47 / 72 | 0 (Direct ancestor) | None | PR #7 (Head), PR #8 (Base) | Full history in `development` and backup bundle | **SAFE TO RETIRE** (after PR #7/#8 disposition & owner approval) |
| 10 | `codex/day6-ingress-oidc-abuse-postgres-performance` | `f0fd3a1fb682e7eec17b0345280a19207678f02a` | 50 / 69 | 0 (Direct ancestor) | None | PR #8 (Head), PR #9 (Base) | Full history in `development` and backup bundle | **SAFE TO RETIRE** (after PR #8/#9 disposition & owner approval) |
| 11 | `codex/audit-remediation-concurrency-20261118` | `fbf2a70105e3d1bb23b473eef59833f99a16b4e2` | 51 / 69 | **1 unique commit:** `fbf2a70` (`fix(postgres): scope transaction and projection to each async request`) | **None functionally missing.** Superseded 17 minutes later by `26036d9771d31d9add8d39c0e729fed25acdad47` (`Isolate PostgreSQL request transactions while preserving JSON serialization`) in `codex/audit-remediation-day1-day6` and Day 13. | None (No open PR) | Preserved in Git backup bundle (`aiit_full_backup_20261123.bundle`). Do **not** cherry-pick (already superseded by fuller implementation `26036d9`). | **SAFE TO RETIRE** (after owner review of superseded commit `fbf2a70`) |
| 12 | `codex/audit-remediation-day1-day6` | `fc5e1b4418465d74ea896a25f308d6d62adc3ae3` | 71 / 48 | 0 (Direct ancestor) | None | PR #9 (Head), PR #10 (Base) | Full history in `development` and backup bundle | **SAFE TO RETIRE** (after PR #9/#10 disposition & owner approval) |
| 13 | `codex/day7-manual-assignment-pilot` | `25d97a93252bfd36810cd15e320e1fb1494b4b29` | 79 / 40 | 0 (Direct ancestor) | None | PR #10 (Head), PR #11 (Base) | Full history in `development` and backup bundle | **SAFE TO RETIRE** (after PR #10/#11 disposition & owner approval) |
| 14 | `codex/day8-controlled-staging-rehearsal` | `dd4c97e1ab453874d610f0a37c82ad8d909894dc` | 81 / 38 | 0 (Direct ancestor) | None | PR #11 (Head), PR #12 (Base) | Full history in `development` and backup bundle | **SAFE TO RETIRE** (after PR #11/#12 disposition & owner approval) |
| 15 | `codex/day9-reliability-performance-release-readiness` | `80e8225c8b02947123f3dac1c9582fb57b732218` | 82 / 37 | 0 (Direct ancestor) | None | PR #12 (Head) | Full history in `development` and backup bundle | **SAFE TO RETIRE** (after PR #12 disposition & owner approval) |
| 16 | `tawsif-jawad-day1-9-remediation` | `41050cbd1ab2fc435c0f4a8f4856b099a3ff540e` | 89 / 30 | 0 (Direct ancestor) | None | PR #13 (Head), PR #14 (Base) | Full history in `development` and backup bundle | **SAFE TO RETIRE** (after PR #13/#14 disposition & owner approval) |
| 17 | `codex/day10-integration-release-readiness` | `b51bd8a73e58d33d36f126d1d57b5402f149ea55` | 92 / 27 | 0 (Direct ancestor) | None | PR #14 (Head), PR #15 (Base) | Full history in `development` and backup bundle | **SAFE TO RETIRE** (after PR #14/#15 disposition & owner approval) |
| 18 | `codex/day11-release-gate-closure-uat` | `78b3fc5298d09592370574a0cb5c540904ca1c63` | 93 / 26 | 0 (Direct ancestor) | None | PR #15 (Head), PR #16 & PR #17 (Base) | Full history in `development` and backup bundle | **SAFE TO RETIRE** (after PR #15/#16/#17 disposition & owner approval) |
| 19 | `codex/roadmap-days12-15-synthetic-office` | `93968db94c428512c1a4187fde52f2ce04257fd0` | 94 / 26 | **1 unique commit:** `93968db` (`docs(roadmap): sequence Days 12–15 through isolated synthetic office readiness`) | **40 lines in `docs/ROADMAP.md`** prepending the Days 12–15 synthetic office roadmap table above the historical Day 1–6 notes. | PR #16 (Open Draft PR targeting `codex/day11-release-gate-closure-uat`) | **REQUIRES AUTHORIZED REVIEW** — Independent documentation commit on PR #16 not merged into Day 12/13. Retain branch until PR #16 is either cherry-picked/merged into `development` or closed by owner decision. | **HOLD — REVIEW REQUIRED** (Retain until PR #16 decision) |
| 20 | `codex/day12-full-synthetic-enterprise-office` | `fb1b87f66bd225ea1ebca71f12efd40cc7a3c738` | 95 / 24 | 0 (Direct ancestor) | None | PR #17 (Head), PR #18 (Base) | Full history in `development` and backup bundle | **SAFE TO RETIRE** (after PR #17/#18 disposition & owner approval) |
| 21 | `codex/day13-synthetic-enterprise-integration` | `2ff77f25a9ace9d296f8509f692dc853eb08c697` | 119 / 0 | 0 (Identical to `development` creation point) | None | PR #18 (Head); checked out at older SHA `7374bdb` in `.codex/worktrees/aiit-day10` | Exact source commit of `development`. Retain temporarily while PR #18 review/CI history is referenced and `.codex/worktrees/aiit-day10` is active. | **HOLD — WORKTREE & PR #18 ACTIVE** |

---

## 4. Local-Only Branches Inventory

In addition to local tracking branches corresponding to the remote branches above, the local repository contains 3 local-only review branches created at the Day 6 commit:

| Local Branch Name | Local HEAD SHA | Ancestor of `development`? | Unique Commits | Worktree Association | Safe Retirement Status |
|---|---|---|---|---|---|
| `day7_argon_review_v2` | `f0fd3a1fb682e7eec17b0345280a19207678f02a` | Yes (0 unique commits) | 0 | Checked out in `/Users/tawsifjawad/.gemini/antigravity/worktrees/Cutomer_IT_Support_System/day7_argon_review_v2` | Safe to retire after removing/Detaching worktree with owner approval |
| `day7_independent_review` | `f0fd3a1fb682e7eec17b0345280a19207678f02a` | Yes (0 unique commits) | 0 | None | **SAFE TO RETIRE** (after owner approval) |
| `day7_independent_review_audit` | `f0fd3a1fb682e7eec17b0345280a19207678f02a` | Yes (0 unique commits) | 0 | None | **SAFE TO RETIRE** (after owner approval) |

---

## 5. Detailed Analysis of the Two Divergent Branches

### A. `codex/audit-remediation-concurrency-20261118` (`fbf2a70105e3d1bb23b473eef59833f99a16b4e2`)
- **Parent Commit:** `f0fd3a1fb682e7eec17b0345280a19207678f02a` (Day 6 HEAD)
- **Author & Date:** `Tawsif-Jawad`, `2026-11-18 10:25:41 +0600`
- **Diff Summary:** Modified `apps/api/src/postgres-store.ts` (15 insertions, 15 deletions) to replace `private state?: DatabaseState; private tx?: Tx;` on `PostgresRequestStore` with `AsyncLocalStorage<{ tx: Tx; state: DatabaseState }>`.
- **Disposition:** Seventeen minutes later (`2026-11-18 10:42:34 +0600`), commit `26036d9771d31d9add8d39c0e729fed25acdad47` (`Isolate PostgreSQL request transactions while preserving JSON serialization`) was committed on `codex/audit-remediation-day1-day6` (which is in `development`'s ancestry). Commit `26036d9` includes the exact `AsyncLocalStorage` transaction isolation in `apps/api/src/postgres-store.ts` **plus** serial queue bypassing for Postgres in `apps/api/src/app.ts` and comprehensive concurrency tests in `tests/postgres-runtime.test.ts`. Therefore, `fbf2a70` is completely superseded in `development` and requires no cherry-pick.

### B. `codex/roadmap-days12-15-synthetic-office` (`93968db94c428512c1a4187fde52f2ce04257fd0`)
- **Parent Commit:** `78b3fc5298d09592370574a0cb5c540904ca1c63` (Day 11 HEAD)
- **Author & Date:** `Tawsif-Jawad`, `2026-11-22 11:52:28 +0600`
- **Related PR:** Open Draft PR #16 (`Docs: Update Days 12–15 for synthetic office validation`)
- **Diff Summary:** Prepends 40 lines to `docs/ROADMAP.md` documenting the revised Days 12–15 synthetic office roadmap table and implementation rules.
- **Disposition:** Because Day 12 (`codex/day12-full-synthetic-enterprise-office`) branched directly from Day 11 (`78b3fc52`) rather than from `93968db9`, this documentation update in `docs/ROADMAP.md` was never merged into Day 12 or Day 13. Per migration rules ("Do not blindly cherry-pick or merge. Preserve them for authorized review"), this branch and PR #16 are preserved intact for owner decision on whether to cherry-pick `93968db94c428512c1a4187fde52f2ce04257fd0` onto `development`.
