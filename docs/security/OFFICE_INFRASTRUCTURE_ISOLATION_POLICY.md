# Office infrastructure isolation policy

## Owner restriction

Office servers, mail infrastructure, Active Directory, employee credentials and accounts, corporate data, internal APIs, and office networks are off-limits across AIIT development, tests, CI, staging, and deployment. The restriction covers read-only access, discovery, connectivity checks, DNS or VPN probes, authentication, diagnostics, certificate trust checks, and writes. Each specific office integration requires fresh explicit authorization from the project owner. Earlier plans and example configurations confer no authorization.

## Permitted verification

| Operation | Approved destination in this rehearsal |
| --- | --- |
| Portal, API, OIDC, HTTPS edge | Literal loopback listeners started by the harness. Public portal origin and issuer metadata must stay within their configured loopback origins. |
| PostgreSQL | Disposable cluster started by the harness on `127.0.0.1`, explicit port, synthetic `aiit_test` role, and `aiit_test` database or a synthetic `aiit_test_*` restore database. |
| SMTP | Harness-owned TLS sink on `127.0.0.1`, explicit test port, fixture certificate, and one synthetic `@example.test` mailbox per delivery. |
| Directory and AI | In-process mock adapters and synthetic inputs. |
| Developer tooling | The configured GitHub repository and public dependency tooling used by pinned installation, builds and audits. |

Loopback describes a routing boundary. Confirm each listener belongs to the test harness or an explicitly authorized isolated service. A localhost forwarder, tunnel, proxy or process can lead elsewhere. Unknown and private network destinations require a separate positive authorization and isolation check. When ownership is unclear, stop the affected operation.

## Implemented safeguards

- PostgreSQL API and worker startup and the disposable JSON importer reject unknown hosts, non-disposable database names and users, passwords, and alternate socket or unsupported connection parameters before opening a client connection. Supported numeric options are `connect_timeout` and `connection_limit`.
- OIDC accepts only loopback issuer and public app destinations and public synthetic clients. Discovery and token/JWKS calls match the issuer origin, reject redirects, and reject Node's environment-proxy opt-in. The application fails closed on invalid OIDC configuration.
- The portal rejects non-loopback API upstreams at construction. The proxy uses a direct connection. The controlled OIDC test helper checks a redirect destination against the exact fixture origin before following it.
- Test SMTP uses implicit TLS with an explicit fixture trust anchor and hostname verification. The default worker transport is mock. The rehearsal adapter accepts one `@example.test` address and uses a test-only configuration. Mailbox provisioning, and live directory writes are outside the rehearsal. SMTP errors exposed by the worker use generic failure codes.
- Newly seeded application and mock directory identities use synthetic names and `example.test` mailboxes. Existing records retain their historical values. Use a fresh disposable store for verification.
- The local verifier refuses a checkout containing an active `.env` or the usual operational JSON store. It checks their presence without reading their contents. Its child environment is allowlisted, with registry configuration pinned to the public registry and host npm user/global configuration excluded.

## Before every run

Use a verified standalone checkout with no office configuration or data. Inspect names of relevant variables and destination categories without printing secrets. Start the disposable PostgreSQL, issuer, browser target and sink from reviewed configuration. Use a clean inherited environment that excludes integration endpoints, credentials, proxy variables, TLS bypass variables, preload options and alternate Prisma engines. The harness provisions its own data and listeners. Treat unrecognized configuration as a reason to stop that operation.

Configuration guards and fixture ownership were verified for this run. This does not certify OS-wide egress controls or authorize external staging. Real Keycloak federation, corporate SMTP trust, office Active Directory, production backup/restore, and release acceptance remain outside the approved scope.

Day 9 extends the OIDC replay to reject discovery redirects before reaching a separate trap on the owned loopback issuer, and rejects Node environment-proxy option tokens, including underscore aliases. The isolated verifier now includes both browser storage modes, the TLS staging rehearsal, and both dependency audits. An alternate test port supports running the suite alongside a local demo without using the demo's state.
