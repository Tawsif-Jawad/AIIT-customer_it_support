# Day 13 synthetic enterprise integration

Day 13 extends the host-native lab with authenticated SMTP over verified TLS, an offline fictional directory manifest, and a separate Keycloak container smoke profile. The existing Day 12 demo is preserved. The verified starting head was PR #17 at `fb1b87f66bd225ea1ebca71f12efd40cc7a3c738`. Day 13 targets `codex/day12-full-synthetic-enterprise-office`.

The eight application scenarios passed with authenticated delivery. Full enterprise infrastructure integration remains **PARTIAL** because although real Samba AD DC provisioning, trusted LDAPS, Keycloak federation, AIIT role logins, all eight federated workflows, account disablement, unresponsive-directory recovery (`pause`/`unpause`), and full directory container stop/start recovery (`stop`/`start`) are now verified end-to-end in hosted CI, the unchanged Grype 0.122.1 `--fail-on high` container image vulnerability scan continues to fail on upstream unpatched packages in both Keycloak 26.8.2 (RHEL 9 UBI) and Samba (Debian Trixie). Production remains **NO-GO**.

- [Container setup and checks](CONTAINER_ENVIRONMENT.md)
- [Samba directory contract](SAMBA_AD_VALIDATION.md)
- [Keycloak configuration and federation](KEYCLOAK_FEDERATION.md)
- [Authenticated SMTP results](SMTP_AUTH_VALIDATION.md)
- [Comparison matrix](SIMULATOR_COMPARISON.md)
- [Isolation](SECURITY_ISOLATION.md), [test evidence](TEST_EVIDENCE.md), [security-dependency tracker](SECURITY_DEPENDENCY_TRACKER.md), and [release gates](REMAINING_RELEASE_GATES.md)
- [Day 14 handoff](DAY14_HANDOFF.md)

## Completion remediation

The existing PR #18 adds an isolated Samba/LDAPS federation job and a Chromium harness that uses the existing AIIT office, PostgreSQL store, authenticated SMTP worker and scenario driver. It runs with actual Keycloak federation. Hosted job logs determine which assertions were reached. The milestone stays open until every mandatory gate is evidenced.

### Hosted functional evidence

On application commit `a3f92878d574d8d4279fa07d7339484aee1a13a8`, the hosted federation job passed real Samba, trusted LDAPS, full Keycloak synchronization, AIIT browser sign-in, four authenticated actors, and all eight business scenarios. On final remediation commit `df217e31f1c673be5f910164dd3fa92c77a230b1`, the hosted federation job ([run 45121964849 / job 137518124409](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45121964849/job/137518124409)) additionally verified full directory container stop/start recovery (`docker compose stop directory` -> `start directory`) by disabling Keycloak JNDI LDAP connection pooling (`connectionPooling: ["false"]`) and bounding JVM DNS caching (`-Dsun.net.inetaddr.ttl=0 -Dsun.net.inetaddr.negative.ttl=0`).

### Final security remediation

The image gate remains the sole Day 13 engineering blocker. The final remediation evaluated three independent strategies (Strategy A: supported upstream releases, Strategy B: supported minimal runtime construction, Strategy C: vendor advisory and applicability triage), purged seven non-runtime GnuPG packages (`dirmngr`, `gnupg`, `gnupg-l10n`, `gpg`, `gpg-agent`, `gpgconf`, `gpgsm`) from the Samba runtime image (reducing Samba High package matches by an additional 7 rows from 146 to 139, and total reduction from 151 to 139 High matches across 12 removed findings), and verified that forced removal of Debian `Essential: yes` packages (`util-linux`, `bsdutils`, `login`, `mount`, `ncurses-bin`) or `samba-ad-provision` dependencies (`python3-markdown`) breaks Samba AD DC startup ([run 45121382116](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45121382116)). Because Red Hat UBI 9 and Debian Trixie have no published upstream fixes for the remaining 6 Keycloak matches (1 Critical, 5 High) and 144 Samba matches (5 Critical, 139 High), the unchanged Grype `--fail-on high` gate continues to fail honestly. See [image security remediation](IMAGE_SECURITY_REMEDIATION.md), [vulnerability inventory](VULNERABILITY_INVENTORY.md), and [image provenance](IMAGE_PROVENANCE.md).
