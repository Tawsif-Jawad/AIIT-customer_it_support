# Authenticated SMTP

`corepack pnpm synthetic:enterprise-demo` uses the existing worker and loopback Nodemailer adapter with per-run randomized credentials. The local sink advertises and requires SMTP AUTH PLAIN inside verified implicit TLS, accepts one reserved synthetic recipient, and captures messages in memory. The existing Day 12 unauthenticated mode remains supported.

| Case | Observed |
|---|---|
| Correct credentials and trusted TLS | Protocol accepted delivery; eight application workflows generated 11 accepted messages. |
| Wrong credentials and untrusted CA | Both rejected. |
| Incomplete auth config and non-synthetic recipient | Adapter denied configuration or delivery. |
| Temporary 451 and permanent 550 | Both exercised at the wire boundary; the adapter returns its existing generic failure. |
| Retry | Authenticated worker retried a temporary failure and recorded one accepted delivery. |
| Service stop and restart | Probe failed while closed and succeeded when the sink returned on the same port. Message-ID was stable. |
| Worker restart, exhaustion and replay | Established recovery/staging suites exercise pre-send and post-acceptance interruption, terminal audit and possible duplicate acceptance. Those interruption cases use the existing TLS fixture path. |

Transport classification and retry policy are unchanged; a permanent 550 is still handled by bounded retry with terminal audit. SMTP acceptance can precede the durable acknowledgment, so operators reconcile duplicates by Message-ID. Mailpit and corporate authenticated relay behavior remain unverified.

The hosted Samba/Keycloak/AIIT browser replay passed all eight business scenarios through the existing worker and recorded 11 authenticated local sink acceptances. [Federated scenario run](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45110000268/job/137479936697)
