# Exception Expiry, Review & Stop Conditions — AIIT-SYNTH-EXC-001

**Exception ID:** `AIIT-SYNTH-EXC-001`  
**Status:** `PENDING APPROVAL — NOT EFFECTIVE`

---

## 1. 14-Day Validity Rule & Expiry Calculation
- **Start of Validity Clock:** Starts **only** when the approving authority records explicit written approval (`APPROVE AIIT-SYNTH-EXC-001`) with a real UTC timestamp.
- **Maximum Duration:** **14 calendar days** (`336 hours` = `1,209,600,000 ms`) from the recorded UTC approval timestamp.
- **Automated Enforcement (`scripts/synthetic/day14-preflight.ts`):** Rejects missing/malformed timestamps, non-UTC offsets, future-dated `approvedAtUtc`, `expiresAtUtc <= approvedAtUtc`, durations `> 336 hours`, `nowUtcMs >= expiresAtUtc`, and `revoked: true` (or inclusion in `revokedExceptionIds`).
- **Revocation Procedure:** Either set `"revoked": true` in a newly signed envelope, remove the GitHub Environment secret `AIIT_PROTECTED_ENV_ATTESTED`, or rotate/remove the trusted public key; all subsequent Day 14 runs immediately fail closed.
- **No Automatic Renewal:** On reaching the exact UTC expiry timestamp, the exception terminates automatically.

---

## 2. Mandatory Actions Upon Expiry
1. **Stop** all new synthetic testing covered by `AIIT-SYNTH-EXC-001`.
2. **Preserve** all existing test results, SBOMs, Grype JSON reports, and CI logs.
3. **Maintain** Production Readiness = **NO-GO** and Day 13 Engineering = **PARTIAL / BLOCKED** (unless upstream patches have cleared the unchanged `grype --fail-on high` gate).
4. **Require** a fresh vulnerability recheck, updated risk review, and new explicit written approval before any further exception-covered work.

---

## 3. Mandatory Recheck Triggers (Before Expiry)
Re-evaluate and rescan immediately if any of the following occur:
1. Official Keycloak publishes a new release (`> 26.8.2`) or Red Hat publishes RHEL 9 `RHSA` updates for `sqlite-libs` or `java-21-openjdk`.
2. Debian Security Team publishes Trixie `DSA` updates for `python3.13`, `openssl`, `util-linux`, or other tracked Samba runtime packages.
3. Anchore publishes a newer Grype v6 database (`> 2026-11-22T06:19:59Z`) updating `DSA-6650-1` (`krb5`) or reporting new Critical/High findings.

---

## 4. Immediate Termination / Stop Conditions
Suspend all exception-covered synthetic testing **immediately** if any of the following occur:
1. Any network isolation check fails (`Internal != true`, unexpected published port, or reachable IPv4/IPv6/DNS egress probe).
2. Any real employee account, real corporate credential, real email address, or corporate network endpoint is introduced.
3. Either container image is replaced with an unreviewed image digest or expanded outside the approved synthetic test boundary.
4. Any new Critical vulnerability is actively exploited in the synthetic runtime or compromises the CI runner / host boundary.
