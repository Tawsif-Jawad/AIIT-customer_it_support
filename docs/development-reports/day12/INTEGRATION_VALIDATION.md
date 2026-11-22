# Integration validation

| Layer | Evidence and fidelity |
|---|---|
| Identity | Real HTTP Code+PKCE flow with signed JWT and JWKS validation against a loopback issuer. The simulator holds fictional directory profiles and credentials. API scenarios exercise employee, IT and CTO accounts, bad password, disabled account and session revocation after simulated disable. Existing OIDC suites exercise token rejection, expiry and outage. Chromium uses the real form and portal at 390 px. |
| PostgreSQL | A real local cluster runs real Prisma migrations and the existing runtime. Fixture counts and checksums are read back. The test restores the exercised dataset to a fresh disposable database and compares persisted counts and delivery state. |
| SMTP | Real TLS SMTP traffic terminates at an in-memory, single-recipient sink. The scenario run observed 11 accepted messages. A synthetic temporary refusal queued a retry, then a second attempt was accepted once. Existing staging tests exercise permanent exhaustion, TLS errors, auth-required rejection and ambiguous post-acceptance restart. |
| Network | In-memory fault and state model covers WAN, Wi-Fi, DNS, DHCP, VPN, printer, latency and intermittent links. The scenario sends a structured observation serialized into the standard ticket description and existing deterministic AI receives it through normal workflow. Remediation changes simulator state only. |
| Enterprise infrastructure | Docker, Samba federation and Mailpit execution were unavailable on this host. Real corporate AD, SMTP and device integrations remain outside this milestone. |

The simulator can demonstrate auth policy and delivery accounting. Actual AD federation, corporate mail authentication, and external outage behavior require a controlled environment with separate authorization.
