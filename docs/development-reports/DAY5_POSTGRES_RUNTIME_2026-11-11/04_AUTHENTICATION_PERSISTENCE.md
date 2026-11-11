# Authentication persistence

The PostgreSQL authentication repository matches verified issuer and globally unique subject, then loads the application role and SBU. The existing adapter performs Code + PKCE S256, RS256/JWKS, issuer and audience checks, state, nonce and browser binding. Only active interactive identities can authenticate. The PostgreSQL repository persists a SHA-256 digest, user link, issuer/subject binding and absolute expiry. Upstream tokens are discarded by the adapter.

Login rotates the prior browser session when supplied. Session establishment and its required audit share the request transaction, and the API releases the cookie after commit. A trigger revokes sessions when active status, role, SBU or OIDC binding changes. Every protected request rechecks current session and application identity. Distinct browser sessions can coexist. Logout deletes the matching digest.

The controlled-issuer rehearsal verified login, replay rejection, concurrent sessions, origin and CSRF denial, cookie restoration across a fresh API instance and client, durable logout, disable/re-enable invalidation, expiry, and audit-failure rollback. The injected audit failure returned 503, issued no success cookie and retained the previous session. The actual API subprocess restart test separately verified development-session restoration and revocation across three processes.
