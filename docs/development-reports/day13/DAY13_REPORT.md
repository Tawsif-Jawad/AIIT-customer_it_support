# Day 13 synthetic enterprise integration

Day 13 extends the host-native lab with authenticated SMTP over verified TLS, an offline fictional directory manifest, and a separate Keycloak container smoke profile. The existing Day 12 demo is preserved. The verified starting head was PR #17 at `fb1b87f66bd225ea1ebca71f12efd40cc7a3c738`. Day 13 targets `codex/day12-full-synthetic-enterprise-office`.

The eight application scenarios passed with authenticated delivery. Full enterprise infrastructure integration remains **PARTIAL** because Samba federation, real AIIT login through Keycloak, and federated disablement/recovery were not implemented and executed end to end. Production remains **NO-GO**.

- [Container setup and checks](CONTAINER_ENVIRONMENT.md)
- [Samba directory contract](SAMBA_AD_VALIDATION.md)
- [Keycloak configuration and federation gap](KEYCLOAK_FEDERATION.md)
- [Authenticated SMTP results](SMTP_AUTH_VALIDATION.md)
- [Comparison matrix](SIMULATOR_COMPARISON.md)
- [Isolation](SECURITY_ISOLATION.md), [test evidence](TEST_EVIDENCE.md), and [release gates](REMAINING_RELEASE_GATES.md)
- [Day 14 handoff](DAY14_HANDOFF.md)

## Completion remediation

The existing PR #18 adds an isolated Samba/LDAPS federation job and a Chromium harness that uses the existing AIIT office, PostgreSQL store, authenticated SMTP worker and scenario driver. It must run with actual Keycloak federation. Hosted job logs determine which assertions were reached. The milestone stays open until every mandatory gate is evidenced.

### Hosted functional evidence

On application commit `a3f92878d574d8d4279fa07d7339484aee1a13a8`, the hosted federation job passed real Samba, trusted LDAPS, full Keycloak synchronization, AIIT browser sign-in, four authenticated actors, and all eight business scenarios. The separate image scan failed on both images at the High threshold. Day 13 remains open and production remains NO-GO. [Hosted federation and security jobs](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45110000268)

### Final security remediation

The image gate remains the Day 13 blocker. The work added complete scan and SBOM archives, evaluated and rejected a supported Debian LTS candidate, and applied published Samba base-package fixes for full revalidation. See the [security remediation](IMAGE_SECURITY_REMEDIATION.md), [vulnerability inventory](VULNERABILITY_INVENTORY.md) and [image provenance](IMAGE_PROVENANCE.md).
