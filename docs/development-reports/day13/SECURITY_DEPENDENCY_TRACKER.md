# Day 13 — Upstream Security-Dependency Tracker

**Last Verified:** 2026-11-23  
**Branch:** `development`  
**Scanner & Policy:** Grype `0.122.1` (`--fail-on high`, unchanged) · Syft `1.57.2`  
**Official Grype v6 DB Timestamp & Digest:** `2026-11-22T06:19:59Z` · `sha256:baa591108fd0fafa273503769dea65bf0334ad337e84aeb7f08197849cea9f87`  
**Day 13 Engineering Verdict:** **PARTIAL / BLOCKED** (Sole engineering blocker: upstream container package patches for unchanged Grype `--fail-on high` gate)  
**Production Verdict:** **NO-GO** · **Day 14:** **ON HOLD**

---

## 1. Confirmed Vendor-Patched Findings (Already Present in Selected Images)

| Image | CVE / Advisory | Package & Installed Version | Vendor Advisory / Confirmation | Scanner Status & Discrepancy Note |
|---|---|---|---|---|
| **Keycloak `26.8.2` (`26.8.2-3`)** | `CVE-2026-114938` (Critical) | `java-21-openjdk-headless=1:21.0.13.1.2-1.2.el9` | **PATCHED** — Red Hat Security Data API confirms `RHSA-2026:100567` fixes `CVE-2026-114938` in `java-21-openjdk-1:21.0.13.1.2-1.2.el9`. | Cleared by Grype (not flagged). |
| **Samba (Debian Trixie)** | `CVE-2026-19499`, `CVE-2026-5435` (High) | `libc6=2.41-12+deb13u5`, `libc-bin=2.41-12+deb13u5` | **PATCHED** — Pinned in `Samba.Dockerfile`. | Cleared by Grype (4 High matches removed). |
| **Samba (Debian Trixie)** | `CVE-2026-85091` (High) | `zlib1g=1:1.3.dfsg+really1.3.1-1+deb13u1` | **PATCHED** — Pinned in `Samba.Dockerfile`. | Cleared by Grype (1 High match removed). |
| **Samba (Debian Trixie)** | `CVE-2026-24882` (High) | `dirmngr`, `gnupg`, `gnupg-l10n`, `gpg`, `gpg-agent`, `gpgconf`, `gpgsm` | **REMOVED** — Non-runtime packages purged via `apt-get purge -y` in `Samba.Dockerfile`. | Cleared by Grype (7 High matches removed). |
| **Samba (Debian Trixie)** | `CVE-2026-112314`, `CVE-2026-112320`, `CVE-2026-112321`, `CVE-2026-112322`, `CVE-2026-112323`, `CVE-2026-119079` (High, 24 matches) | `libgssapi-krb5-2`, `libk5crypto3`, `libkrb5-3`, `libkrb5support0` (`1.21.3-5+deb13u2`) | **PATCHED BY VENDOR (`DSA-6650-1`)** — Debian Security Tracker marks `trixie (security) \| 1.21.3-5+deb13u2 \| fixed \| DSA-6650-1`. | **Scanner Discrepancy:** Grype DB (`2026-11-22T06:19:59Z`) still reports `not-fixed`. No suppression applied; track Anchore Grype DB feed update. |

---

## 2. Unresolved Blocking Findings & External Upstream Dependencies (150 Remaining Package Matches)

### A. Keycloak `26.8.2` (`quay.io/keycloak/keycloak:26.8.2@sha256:7e66a96e4739239070aeaf72e4c5decf0f7f682cfc725b9f7ea2b336eaba38b3`) — 1 Critical, 5 High

| Finding ID(s) | Severity | Package & Installed Version | Matches | Vendor Source & Disposition | Available Fix | Responsible Upstream Project | Recommended Recheck Trigger |
|---|---|---|---:|---|---|---|---|
| `CVE-2026-91403` | **Critical** | `java-21-openjdk-headless` (`1:21.0.13.1.2-1.2.el9`) | 1 | [Red Hat CVE-2026-91403](https://access.redhat.com/security/cve/CVE-2026-91403) — RHEL 9 `java-21-openjdk`: **Will not fix** | None published for RHEL 9 OpenJDK 21 | Red Hat OpenJDK / Keycloak UBI base | Red Hat advisory revision, Keycloak migration to newer UBI/JDK base, or explicit owner governance decision |
| `CVE-2026-119373`, `CVE-2026-119374`, `CVE-2026-119379`, `CVE-2026-119586` | **High** | `sqlite-libs` (`3.34.1-11.el9_8`) | 4 | [Red Hat CVE-2026-119373](https://access.redhat.com/security/cve/CVE-2026-119373) — RHEL 9 `sqlite`: **Affected** | None published for RHEL 9 `sqlite-libs` | Red Hat Enterprise Linux 9 (`sqlite`) | Publication of RHEL 9 `RHSA` for `sqlite-libs` followed by official Keycloak image rebuild |
| `GHSA-xxph-c9ww-hj94` | **High** | `com.google.guava:guava` (`33.6.0-jre`) | 1 | [GHSA-xxph-c9ww-hj94](https://github.com/advisories/GHSA-xxph-c9ww-hj94) — Uncontrolled memory allocation in deserialization | `33.7.2` (Maven upstream; not yet in official Keycloak `26.8.2`) | Keycloak / Quarkus | Publication of official `quay.io/keycloak/keycloak` release `> 26.8.2` bundling `guava >= 33.7.2` |

### B. Samba on Debian Trixie (`debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2`) — 5 Critical, 139 High

| Finding ID(s) | Severity | Source / Binary Package(s) & Installed Version | Matches | Vendor Source & Disposition | Available Fix in Debian Trixie | Responsible Upstream Project | Recommended Recheck Trigger |
|---|---|---|---:|---|---|---|---|
| `CVE-2026-19445` | **Critical** | `python3.13`, `python3.13-minimal`, `libpython3.13`, `libpython3.13-minimal`, `libpython3.13-stdlib` (`3.13.5-2+deb13u5`) | 5 | [Debian Security Tracker](https://security-tracker.debian.org/tracker/CVE-2026-19445) — Trixie `vulnerable` (`wont-fix` in Grype) | None (`3.13.5-2+deb13u5` is latest) | Debian Security Team (`python3.13`) | Debian `DSA` / point-release update for `python3.13` in Trixie |
| `CVE-2026-15308`, `CVE-2026-19553`, `CVE-2026-7210`, `CVE-2026-82049` | **High** | `python3.13*` / `libpython3.13*` (`3.13.5-2+deb13u5`) | 20 | Debian Security Tracker — Trixie `vulnerable` (`wont-fix` in Grype) | None | Debian Security Team (`python3.13`) | Debian `DSA` / point-release update for `python3.13` in Trixie |
| `CVE-2026-112314`, `-112320`, `-112321`, `-112322`, `-112323`, `-119079` | **High** | `libgssapi-krb5-2`, `libk5crypto3`, `libkrb5-3`, `libkrb5support0` (`1.21.3-5+deb13u2`) | 24 | Debian `DSA-6650-1` — **Fixed in `1.21.3-5+deb13u2`** (already installed); Grype DB discrepancy | Already installed (`DSA-6650-1`) | Anchore Grype vulnerability DB feed | Next Grype v6 DB build (`> 2026-11-22T06:19:59Z`) incorporating `DSA-6650-1` |
| `CVE-2026-107778` | **High** | `krb5` (`1.21.3-5+deb13u2`) | 4 | Debian Security Tracker — Trixie `vulnerable` (`wont-fix` in Grype) | None | Debian Security Team (`krb5`) | Next Debian `krb5` security update |
| `CVE-2026-107493`, `-107496`, `-121482`, `-124709`, `-84786`, `-88823`, `-95691`, `-95692` | **High** | `libssl3t64`, `openssl`, `openssl-provider-legacy` (`3.5.9-1~deb13u1`) | 24 | Debian Security Tracker — Trixie `vulnerable` (`not-fixed` in Grype) | None (`3.5.9-1~deb13u1` is latest) | Debian Security Team (`openssl`) | Debian `DSA` / point-release update for `openssl` in Trixie |
| `CVE-2026-76642`, `-78408`, `-78409`, `-78410` | **High** | `bsdutils`, `libblkid1`, `liblastlog2-2`, `libmount1`, `libsmartcols1`, `libuuid1`, `login`, `mount`, `util-linux` (`2.41.5-0+deb13u1`) | 36 | Grype DB `wont-fix`; no Debian Trixie update beyond `2.41.5-0+deb13u1` | None | Debian Security Team (`util-linux`) | Debian Trixie `util-linux` update |
| `CVE-2025-69720` | **High** | `libncurses6`, `libncursesw6`, `libtinfo6`, `ncurses-base`, `ncurses-bin` (`6.5+20250216-2`) | 5 | Debian Security Tracker — Trixie `vulnerable` (`wont-fix`) | None | Debian (`ncurses`) | Debian Trixie `ncurses` update |
| `CVE-2026-102010`, `CVE-2026-95619` | **High** | `gcc-14-base`, `libgcc-s1`, `libstdc++6` (`14.2.0-19`) | 6 | Debian Security Tracker — Trixie `vulnerable` (`wont-fix`) | None | Debian (`gcc-14`) | Debian Trixie `gcc-14` update |
| `CVE-2026-113351`, `-115506`, `-117610`, `-118370` | **High** | `libexpat1` (`2.9.0-1~deb13u1`) | 4 | Grype DB `wont-fix` / `not-fixed` | None | Debian (`expat`) | Debian Trixie `expat` update |
| `CVE-2026-119373`, `-119374`, `-119379` | **High** | `libsqlite3-0` (`3.46.1-7+deb13u2`) | 3 | Debian Security Tracker — Trixie `vulnerable` (`wont-fix`) | None | Debian (`sqlite3`) | Debian Trixie `sqlite3` update |
| `CVE-2026-34980`, `CVE-2026-34990` | **High** | `libcups2t64` (`2.4.10-3+deb13u2`) | 2 | Debian Security Tracker — Trixie `vulnerable` | None | Debian (`cups`) | Debian Trixie `cups` update |
| `CVE-2026-54369`, `CVE-2026-54370` | **High** | `libacl1` (`2.3.2-2+b1`) | 2 | Debian Security Tracker — Trixie `vulnerable` (`wont-fix`) | None | Debian (`acl`) | Debian Trixie `acl` update |
| `CVE-2026-107161` | **High** | `libsasl2-2`, `libsasl2-modules-db` (`2.1.28+dfsg1-9`) | 2 | Debian Security Tracker — Trixie `vulnerable` (`wont-fix`) | None | Debian (`cyrus-sasl2`) | Debian Trixie `cyrus-sasl2` update |
| `CVE-2026-84243` | **High** | `libc6`, `libc-bin` (`2.41-12+deb13u5`) | 2 | Debian Security Tracker — Trixie `vulnerable` (`wont-fix`) | None | Debian (`glibc`) | Debian Trixie `glibc` update |
| `CVE-2026-82560`, `CVE-2026-9538` | **High** | `perl-base` (`5.40.1-6+deb13u1`) | 2 | Debian Security Tracker — Trixie `vulnerable` (`wont-fix`) | None | Debian (`perl`) | Debian Trixie `perl` update |
| `CVE-2026-69249` | **High** | `python3-cryptography` (`43.0.0-3+deb13u1`) | 1 | Debian Security Tracker — Trixie `vulnerable` (`wont-fix`) | None | Debian (`python-cryptography`) | Debian Trixie `python-cryptography` update |
| `CVE-2026-128089` | **High** | `python3-dnspython` (`2.7.0-1+deb13u1`) | 1 | Debian Security Tracker — Trixie `vulnerable` (`not-fixed`) | None | Debian (`dnspython`) | Debian Trixie `dnspython` update |
| `CVE-2019-25781` | **High** | `python3-markdown` (`3.7-2+deb13u1`) | 1 | Debian Security Tracker — Trixie `vulnerable` (`wont-fix`) | None | Debian (`python-markdown`) | Debian Trixie `python-markdown` update |
