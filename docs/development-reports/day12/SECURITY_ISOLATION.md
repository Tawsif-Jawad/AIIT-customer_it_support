# Security isolation

- Lifecycle scripts start with an allowlisted process environment and create their own PostgreSQL cluster under a newly allocated temporary directory. No external database or SMTP destination can be passed to these commands.
- The portal, API, issuer, database TCP listener and SMTP sink bind on literal loopback. PostgreSQL also uses a private fixture socket directory. The cluster has transparent local test trust and must run on a trusted workstation.
- The OIDC simulator restricts its redirect to the exact loopback callback fixed at startup, and holds demo passwords only for fictional identities. AIIT's normal test-mode loopback issuer guard still applies. The browser form restricts submission and redirects to the issuer and registered loopback portal.
- The SMTP adapter accepts one `@example.test` recipient, validates TLS against the temporary fixture CA, and never relays messages. Sink inspection is via the operator terminal. New seed rows generate no mail.
- The network simulator mutates an in-memory state model. It does not query or change host interfaces, routes, DNS, DHCP, printers, VPNs or devices.
- Reset closes the services created by the current runner, removes that runner's generated temporary database directory through the existing fixture, and creates a separate fresh cluster. There is no reset URI or remote administration endpoint.

This is application-level destination isolation. It is not an OS-wide network sandbox, a multi-tenant deployment, or a production credential profile. Authorized local users can access loopback listeners. Run it on a trusted development host.
