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
