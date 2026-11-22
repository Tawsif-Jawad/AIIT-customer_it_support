# Keycloak configuration and federation

The dedicated `aiit-synthetic-office` realm enables a public authorization-code client, requires S256 and one fixed HTTPS callback, disables password and implicit grants, and uses short token and session lifetimes. Runtime smoke checks validate HTTPS discovery, issuer, advertised S256 and RS256, and RSA JWKS. The synthetic profile does not use or change existing realms.

There is no LDAP component or federated user in this realm yet. Add an explicitly reviewed read-only LDAP provider only after the disposable DC and trust chain are available. Configure LDAP base and bind credentials through temporary runtime inputs, restrict user import to the synthetic staff base, and keep directory role and group claims informational. Bind application accounts using the verified Keycloak issuer and subject, with local identity/role/SBU entries remaining authoritative. Configure the AIIT HTTPS callback on the verified origin and trust the temporary CA explicitly. [Keycloak administration guide](https://www.keycloak.org/docs/26.7.0/server_admin/)

Browser login/logout, nonce, issuer/audience, stale sessions and provider failure continue to run against Day 12’s signed simulator. A Keycloak discovery pass supplies service-level evidence only. AIIT federation and Code+PKCE through this Keycloak realm are unverified.
