# AIIT — Two-Branch Git Policy (`main` + `development`)

**Effective Date:** 2026-11-23  
**Repository:** `https://github.com/Tawsif-Jawad/AIIT-customer_it_support`  
**Status:** Active Permanent Policy

---

## 1. Permanent Branch Structure

The AIIT repository operates with **exactly two permanent branches**:

| Branch | Purpose | Baseline / Starting Commit | Governance Rules |
|---|---|---|---|
| `main` | Stable and approved application baseline | `b6fae621ad52d3fc6b633ad923db6df1a8de1fb8` | Protected baseline. Never used for daily development. No direct pushes, no force pushes, no deletion. Requires passing exact-commit CI checks and authorized independent review before merging from `development`. |
| `development` | All ongoing application development | `2ff77f25a9ace9d296f8509f692dc853eb08c697` (Day 13 baseline, followed by migration docs) | Primary integration and daily development branch for both Antigravity and Codex. No separate permanent branches for individual days (e.g., Day 14, Day 15). Preserves full application and Git history. |

---

## 2. Permanent Development and Release Workflow

### Daily Development Workflow (`development`)
```text
development -> implement -> test -> commit -> push (origin/development)
```
1. **No Day-Numbered Branches:** Do not create `codex/day14-*`, `codex/day15-*`, or similar milestone branches. All ongoing engineering work happens directly on `development`.
2. **Traceability:** Every commit pushed to `development` must be atomic, tested, and traceable.
3. **Truthful Verification:** Never pretend failing CI checks have passed. Security gates (such as the Day 13 Grype container image scan) must remain visible until genuinely remediated.
4. **Short-Lived PR Trade-Off Policy:** If short-lived topic branches are ever required solely to isolate a high-risk experimental change for external review before landing on `development`, the agent must explicitly report that workflow trade-off and request owner approval rather than silently creating branches.

### Release Promotion Workflow (`development -> main`)
```text
development -> PR (base: main, head: development) -> independent review -> exact-commit CI -> main
```
Do **not** promote unfinished or unapproved changes to `main`. Before merging `development` into `main`:
1. All required engineering acceptance gates must pass.
2. All blocking security findings (including the Day 13 container image vulnerabilities in `synthetic-enterprise.yml`) must be resolved.
3. Independent review must be completed and approved.
4. Exact-commit GitHub Actions checks (`quality`, `tests`, `database`, `browser`, and required synthetic enterprise checks) must pass.
5. Explicit operational and owner release approval must be granted.

---

## 3. Antigravity and Codex Synchronization Rules

Because both **Antigravity** and **Codex** operate against `development`:

1. **Active Antigravity Checkout:**
   - Workspace path: `/Users/tawsifjawad/Documents/Work/Cutomer_IT_Support_System`
   - Active branch: `development` tracking `origin/development`
2. **Codex Synchronization:**
   - Before starting any session in Codex, run:
     ```bash
     git fetch origin
     git switch development
     git pull --ff-only origin development
     ```
   - If Codex is using a secondary worktree (such as `/Users/tawsifjawad/.codex/worktrees/aiit-day10/Cutomer_IT_Support_System`), remember that Git prevents two worktrees from checking out the same branch (`development`) simultaneously. Either:
     - Operate in the primary workspace (`/Users/tawsifjawad/Documents/Work/Cutomer_IT_Support_System`) with sequential tool handoff, or
     - Prune/retire unused legacy worktrees once authorized.
3. **No Concurrent Unsynchronized Edits:**
   - Never run Antigravity and Codex concurrently on the same working tree without committing/pushing or explicitly synchronizing state via `git status` and `git pull --ff-only origin development`.
