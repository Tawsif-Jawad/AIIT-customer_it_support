# Enterprise integration readiness

| Environment | Observed scope |
|---|---|
| Synthetic contracts | The OIDC issuer signs fixture tokens and exercises browser code flow and invalid-token handling. The app uses exact issuer/subject binding and reloads application entitlements. The mock directory only uses synthetic records. |
| Controlled integration | The repository rehearsal starts owned loopback TLS ingress, a synthetic issuer, disposable PostgreSQL, API, worker and SMTP sink. It exercises TLS hostname and CA validation, encryption, authentication-required failure, bounded retry, recipient safeguards, recovery and the ambiguous delivery boundary. |
| Target enterprise environment | BLOCKED. Corporate endpoints and test identities were outside the authorization for this run. |
| Unverified contracts | Actual Keycloak/AD federation, authorized group lifecycle mapping into the application account registry, IdP disable propagation to existing sessions, relay credentials and authenticated delivery, corporate PKI, recipient policy and sustained worker recovery at production load. |

The proposed identity architecture is Keycloak OIDC with AD federation on the IdP side. The app does not treat IdP group claims as application role grants. An approved provisioning/deprovisioning process needs to keep local identity bindings and entitlements current, including termination of active sessions for disabled directory users. No live AD bind or email provisioning was performed. Keep rehearsal credentials and CA trust confined to test infrastructure.
