# Day 13 image security remediation

Day 13 remains open on draft PR #18. The gate is Grype 0.122.1 with `--fail-on high`. The workflow publishes raw JSON, filtered High/Critical matches, immutable image identifiers, Grype database metadata and Syft 1.57.2 CycloneDX SBOMs even when the scan exits nonzero. Both scanner binaries are verified against pinned archive checksums.

| Image assessment | Critical matches | High matches | Disposition |
|---|---:|---:|---|
| Original Keycloak CI table | 1 | 4 | Failed |
| Original Samba CI table | 5 | 151 | Failed |
| Fresh Keycloak 26.8.2 scan | 1 | 5 | Failed |
| Fresh Trixie Samba scan, before package patch | 5 | 151 | Failed |
| Debian Bookworm LTS Samba candidate | 3 | 124 | Rejected before promotion |
| Patched Trixie Samba | 5 | 146 | Failed |

Counts are package/advisory matches rather than unique CVEs. The additional fresh Keycloak match is a Grype Guava package finding. The scan database was built at 2026-11-22T06:19:59Z (12:19:59 on 22 November in Asia/Dhaka). See [original scan](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45110338077/job/137481003417) and [fresh scan and SBOM archives](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45113068728#artifacts).

## Keycloak

The official download page still lists 26.8.2. The existing official image remains pinned. Red Hat lists RHEL 9 OpenJDK 21 as Will not fix for CVE-2026-91403. The fresh scan also reported four High SQLite package findings and a High Guava advisory with an upstream package fix. No supported replacement Keycloak release or repackaging was verified to resolve the complete set. Swapping the Java or application jars independently was not adopted. [Keycloak downloads](https://www.keycloak.org/downloads) · [Red Hat OpenJDK advisory](https://access.redhat.com/security/cve/CVE-2026-91403) · [Guava advisory](https://github.com/advisories/GHSA-xxph-c9ww-hj94)

## Samba

Kept the working Trixie base and Samba runtime. The patched image pins libc6 and libc-bin to `2.41-12+deb13u5` and zlib1g to `1:1.3.dfsg+really1.3.1-1+deb13u1` using the existing Debian repositories. Those versions address published fixes for the scanner's glibc and zlib findings. Python remains required by the fixture provisioning code and Samba tooling. Debian still lists the current Trixie Python 3.13 package as vulnerable for CVE-2026-19445. Moving an unstable package into the stable image or suppressing the scanner result was not adopted. [Debian glibc tracker](https://security-tracker.debian.org/tracker/CVE-2026-19499) · [Debian zlib tracker](https://security-tracker.debian.org/tracker/CVE-2026-85091) · [Debian Python tracker](https://security-tracker.debian.org/tracker/CVE-2026-19445)

A pinned Debian Bookworm LTS image built and scanned successfully as a candidate evaluation. It failed the same threshold, so it was not selected or sent through the federation suite. Its Critical matches involve SQLite and glibc; they were not cleared by correcting the Trixie Python advisory. [Debian LTS announcement](https://www.debian.org/News/2026/20260712) · [Candidate scan](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45113068728/job/137489576446)


The patched Samba SBOM verified all three package pins. Grype no longer reported CVE-2026-19499 or CVE-2026-5435 against libc-bin/libc6 or CVE-2026-85091 against zlib1g. This removed five High package matches. Keycloak remained at 1 Critical and 5 High. The repository retains the upstream blocks and the same severity threshold. [Patched image scan](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45113469691/job/137490861415) · [Patched SBOMs and JSON](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45113469691#artifacts)
