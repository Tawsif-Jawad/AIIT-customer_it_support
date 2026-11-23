# AIIT — Recovery Baseline, Backup Verification & Rollback Procedure

**Backup Timestamp:** 2026-11-23T11:31:35+06:00  
**Repository:** `https://github.com/Tawsif-Jawad/AIIT-customer_it_support`

---

## 1. Recovery Baseline Artifacts (Stored Outside Repository)

Before creating `development` or modifying any branch references, a complete recovery baseline was captured outside the repository at:

`/Users/tawsifjawad/.gemini/antigravity/brain/3a4b5d1b-5b41-4c95-9e40-90cbcd6cab4b/scratch/recovery_baseline/`

| Artifact File | Purpose | Verification / Checksum |
|---|---|---|
| `aiit_full_backup_20261123.bundle` | Complete Git bundle (`git bundle create ... --all`) containing all 1,954 objects, 16 local branches, 20 remote tracking branches, and 18 PR head refs (`refs/remotes/origin/pr/1`..`18`). | **SHA-256:** `d84f143d7fa90ebb27258599b7c9ccfb1d06a913ed4c4f2ec9020693cf85638b`<br>**Status:** `git bundle verify` -> `The bundle records a complete history. ... is okay` |
| `all_refs_pre_migration.txt` | Exact refname, SHA-1 object ID, and commit subject for every local and remote ref prior to migration. | Verified 54 refs recorded |
| `github_prs_pre_migration.jsonl` | Complete JSONL snapshot of PR #1 through PR #18 from GitHub API (`number`, `state`, `draft`, `head_ref`, `head_sha`, `base_ref`, `base_sha`, `html_url`). | Verified 18 PR records |
| `worktrees_pre_migration.txt` | Porcelain worktree inventory (`git worktree list --porcelain`) prior to migration. | Verified 4 worktrees |
| `status_pre_migration.txt` | Working tree status (`git status --short --branch`) prior to branch switch. | Verified clean tracked tree + preserved untracked files |

> **Security & Governance Compliance:** The backup bundle is stored strictly in the local private scratch directory outside the Git repository, is **not** committed into the repository, and has **not** been published publicly.

---

## 2. Pre-Migration Local FileProvider / iCloud Eviction Recovery Note

During the initial local repository audit on macOS (`2026-11-23`), macOS FileProvider had marked several older files in `/Users/tawsifjawad/Documents/Work/Cutomer_IT_Support_System` with the `SF_DATALESS` (`dataless`) flag:
- 27 loose objects and 5 log files under `.git/`, plus `.git/index` and `.git/FETCH_HEAD`
- 72 tracked working-tree files on `codex/day6-ingress-oidc-abuse-postgres-performance`
- `node_modules` files from an earlier Nov 11 install

**Non-Destructive Recovery Performed:**
1. Quarantined the dataless `.git/` stub files into `.git/quarantine/` without deleting user data.
2. Retrieved a complete mirror packfile from `origin` (`https://github.com/Tawsif-Jawad/AIIT-customer_it_support.git`) and verified repository object connectivity via `git fsck --connectivity-only` (exit code `0`, zero missing objects).
3. Hydrated all 72 tracked working-tree files directly from their exact Git blob hashes in `HEAD` and confirmed zero local modifications existed prior to switching to `development`.
4. Replaced the stale evicted `node_modules` directory (moving the old directory to `.git/quarantine/node_modules_evicted_old`) with the fully materialized Day 13 `node_modules` from `/Users/tawsifjawad/.codex/worktrees/aiit-day10/Cutomer_IT_Support_System/node_modules` (`0` dataless files).

---

## 3. Rollback Procedures

### A. Restoring Any Historical Branch or Commit from the Git Bundle
If any historical branch or commit ever needs to be inspected or restored locally after future branch cleanup:

```bash
# 1. Verify the bundle integrity
git bundle verify /Users/tawsifjawad/.gemini/antigravity/brain/3a4b5d1b-5b41-4c95-9e40-90cbcd6cab4b/scratch/recovery_baseline/aiit_full_backup_20261123.bundle

# 2. List all refs recorded in the bundle
git bundle list-heads /Users/tawsifjawad/.gemini/antigravity/brain/3a4b5d1b-5b41-4c95-9e40-90cbcd6cab4b/scratch/recovery_baseline/aiit_full_backup_20261123.bundle

# 3. Restore a specific branch (e.g., codex/roadmap-days12-15-synthetic-office) into the local repository
git fetch /Users/tawsifjawad/.gemini/antigravity/brain/3a4b5d1b-5b41-4c95-9e40-90cbcd6cab4b/scratch/recovery_baseline/aiit_full_backup_20261123.bundle \
  refs/remotes/origin/codex/roadmap-days12-15-synthetic-office:refs/heads/codex/roadmap-days12-15-synthetic-office
```

### B. Full Repository Clone from the Recovery Bundle
To reconstruct the entire pre-migration repository in a separate directory:

```bash
git clone /Users/tawsifjawad/.gemini/antigravity/brain/3a4b5d1b-5b41-4c95-9e40-90cbcd6cab4b/scratch/recovery_baseline/aiit_full_backup_20261123.bundle /tmp/aiit-restored-repo
```

### C. Reverting the Primary Antigravity Checkout to Pre-Migration State
Because no historical branches were deleted and `main` was not modified, rolling back the primary workspace checkout requires only:

```bash
git switch codex/day6-ingress-oidc-abuse-postgres-performance
```
(Or switching to `codex/day13-synthetic-enterprise-integration` at `2ff77f25a9ace9d296f8509f692dc853eb08c697`).
