# Keycloak configuration and federation

The dedicated `aiit-synthetic-office` realm enables a public authorization-code client, requires S256 and one fixed HTTPS callback, disables password and implicit grants, and uses short token and session lifetimes. Runtime smoke checks validate HTTPS discovery, issuer, advertised S256 and RS256, and RSA JWKS. The synthetic profile does not use or change existing realms.

## Remediation implementation

The federation overlay generates a separate realm import with read-only Samba LDAPS, a temporary trust root, explicit `connectionPooling: ["false"]`, and email/account-status mapping. The `issuer` container also runs with `JAVA_OPTS_APPEND: -Dsun.net.inetaddr.ttl=0 -Dsun.net.inetaddr.negative.ttl=0` so that JVM hostname caching and stale JNDI pooled sockets never block reconnection after a directory container restart. An ephemeral management account resolves exact fixture user identities from Keycloak. AIIT seeds only explicit issuer/subject bindings for the scenario actors and keeps its existing local roles and SBU policies. Chromium exercises the real Keycloak form, exact approved HTTPS callback and AIIT session. The harness also runs an independent signed Code+PKCE grant and tests the resulting token at UserInfo after directory disablement, during unresponsive pause, and during full container stop. The existing application session is measured separately. Logs record only durations and HTTP status codes.

### Verified final functional and full-restart run

On commit `df217e31f1c673be5f910164dd3fa92c77a230b1` ([run 45121964849 / job 137518124409](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45121964849/job/137518124409)):
- Synchronized all 129 Samba AD users into Keycloak with 0 failures (`added + updated = 129, failed = 0`).
- Rejected invalid password, disabled user (`employee120@example.test`), and unknown user (`unknown@example.test`).
- Authenticated employee (`employee1@example.test`), cross-SBU colleague (`employee92@example.test`), IT administrator (`it1@example.test`), and CTO (`cto@example.test`), and passed all eight federated business scenarios (A through H) with 11 authenticated TLS SMTP messages captured.
- **Account disablement lifecycle:** Disabling `employee1` in Samba immediately blocked fresh Keycloak login; existing AIIT session and existing token UserInfo remained active at the sub-second measurement point, and re-enabling restored fresh login.
- **Unresponsive directory outage (`docker compose pause directory` / `unpause`):** Blocked fresh login while paused, observed existing session/token status, and recovered after unpause.
- **Full directory container stop/start (`docker compose stop directory` / `start`):** Blocked fresh Keycloak authentication while the Samba container was stopped, verified existing session/token status, restarted the Samba container, waited for bounded trusted LDAPS readiness, and succeeded on fresh end-to-end AIIT browser login immediately after restart.
