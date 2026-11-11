# Security regression

- Paired fixtures verify disabled, missing, service-role and ambiguous CTO recipients, employee and customer denial, cross-SBU denial, minimum reason length and the active CTO's attributed escalation. The JSON request includes a forged recipient ID to prove the server resolves the recipient independently.
- Form validation rejects malformed payloads, missing AD fields, invalid mailbox values, unsupported select choices, invalid boolean types and undeclared identity fields. Existing OIDC tests exercise forged top-level role, requester and SBU values.
- Redaction assertions cover synthetic secrets in both mock prompts, PostgreSQL descriptions and escalation records and intents. The tests retain the existing operational text distinction.
- The pinned security and browser suites cover controlled-issuer Code + PKCE, issuer/JWKS, session revocation and binding, CSRF/origin controls and role/SBU restrictions. The disposable database suites exercise approval decisions, outbox retry limits and lease fencing.
