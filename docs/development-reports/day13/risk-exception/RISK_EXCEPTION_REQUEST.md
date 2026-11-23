# Risk Exception Request — AIIT-SYNTH-EXC-001

| Field | Value |
|---|---|
| **Exception ID** | `AIIT-SYNTH-EXC-001` |
| **Exception Title** | Temporary Synthetic Enterprise Container Vulnerability Risk Acceptance |
| **Status** | **PENDING APPROVAL — NOT EFFECTIVE** |
| **Repository & Branch** | `https://github.com/Tawsif-Jawad/AIIT-customer_it_support` · `development` |
| **Baseline Commit** | `ea130215a2ba837bdd4f36ae34a91c0f8ca6b6c4` |
| **Proposed Duration** | Maximum **14 calendar days** from recorded UTC approval timestamp (no automatic renewal) |
| **Day 13 Engineering Verdict** | **PARTIAL / BLOCKED** |
| **Production Readiness Verdict** | **NO-GO** |
| **Day 14 Status** | **ON HOLD** (Pending explicit approval of `AIIT-SYNTH-EXC-001` and separate authorization to start Day 14) |

---

## 1. Purpose and Rationale

All functional, federation, authentication, authorization, authenticated TLS SMTP, isolation, teardown, and full directory container stop/start recovery checks for Day 13 have passed in hosted CI on `development` ([Run 45128932124 / Job 137540306980](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45128932124/job/137540306980)).

However, the mandatory container vulnerability gate (`grype 0.122.1 --fail-on high`) continues to fail on upstream unpatched third-party packages in both selected synthetic infrastructure images:

| Image | Pinned Source Digest / Scanned Image ID | Critical Matches | High Matches | Raw Grype Gate |
|---|---|---:|---:|---|
| **Keycloak `26.8.2` (`26.8.2-3`)** | Registry Index: `quay.io/keycloak/keycloak:26.8.2@sha256:7e66a96e4739239070aeaf72e4c5decf0f7f682cfc725b9f7ea2b336eaba38b3`<br>amd64 Image ID: `sha256:4938c322f47d3736c580fc57bb335d35c784489bc7e6d8fbbd52dbdd1b27e72e` | 1 | 5 | **FAIL** |
| **Samba AD DC on Debian Trixie** | Base Index: `debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2` (built via `infra/synthetic-enterprise/Samba.Dockerfile`, `libc6`/`libc-bin`/`zlib1g` pinned + 7 non-runtime GnuPG packages purged) | 5 | 139 | **FAIL** |

*(Counts are package-level vulnerability matches from Grype `0.122.1` using official v6 DB `2026-11-22T06:19:59Z`, `sha256:baa591108fd0fafa273503769dea65bf0334ad337e84aeb7f08197849cea9f87`. See [SECURITY_DEPENDENCY_TRACKER.md](../SECURITY_DEPENDENCY_TRACKER.md) and [MINIMIZED_HIGH_CRITICAL.tsv](../MINIMIZED_HIGH_CRITICAL.tsv).)*

Because no newer supported upstream Keycloak release (`> 26.8.2`), Red Hat RHEL 9 `sqlite-libs`/`java-21-openjdk` errata, or Debian Trixie patches for `python3.13`, `openssl`, `util-linux`, and remaining runtime libraries have been published, this formal, time-limited, synthetic-only risk exception is requested solely to permit sequencing of isolated synthetic validation work while upstream fixes are awaited.

---

## 2. Strict Scope of Authorization

### Permitted Scope (If Explicitly Approved)
1. The existing AIIT synthetic development and validation environment on `development`.
2. Only the two specific reviewed container images pinned above (`quay.io/keycloak/keycloak:26.8.2@sha256:7e66a96e...` and `Samba.Dockerfile` on `debian:trixie-slim@sha256:a72b4433...`).
3. Local disposable synthetic resources and authorized GitHub Actions synthetic integration jobs (`ubuntu-24.04` ephemeral runners).
4. Strictly fictional employees (129 accounts, 6 OUs), fictional assets, fictional tickets, `example.test` addresses, and ephemeral per-run generated credentials.
5. Day 14 full-office simulation and (if separately authorized) Day 15 synthetic testing — **only after** explicit approval of `AIIT-SYNTH-EXC-001` **and** separate explicit instruction to start Day 14.

### Explicitly Prohibited Scope (Never Authorized by This Exception)
- Production deployment or promotion of affected images into production or `main`.
- Any real office network connectivity, corporate Active Directory connection, real SMTP/mail relay, or production identity provider.
- Any real employee accounts, customer data, corporate credentials, or production secrets.
- Unreviewed container image substitutions or public-facing deployment of affected services.
- Weakening or disabling `grype --fail-on high`, adding `.grype.yaml` suppressions, or deleting vulnerability evidence.

---

## 3. Non-Negotiable Governance Separation

Approving `AIIT-SYNTH-EXC-001` authorizes only a narrowly scoped **project sequencing decision** for isolated synthetic testing. It does **not** alter the following independent statuses:
- **Functional testing:** PASS
- **Vulnerability scan (`image-scan`):** FAIL (`grype --fail-on high` remains unchanged and blocking)
- **Synthetic-only exception (`AIIT-SYNTH-EXC-001`):** PENDING APPROVAL (until explicitly signed)
- **Day 13 engineering acceptance:** PARTIAL
- **Production readiness:** NO-GO

---

## 4. Decision Requested from Owner

Explicit written approval using the exact statement:

> **`APPROVE AIIT-SYNTH-EXC-001`**

accompanied by acknowledgement of the six mandatory conditions in [EXCEPTION_APPROVAL_RECORD.md](EXCEPTION_APPROVAL_RECORD.md).
