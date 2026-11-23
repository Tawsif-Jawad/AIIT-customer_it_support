# Remaining release gates

- **Synthetic directory and identity:** Disposable Samba provision, LDAPS trust, actual federated login and lifecycle, then all eight cases through Keycloak.
- **Synthetic isolation:** Verify DNS and IPv6 behavior, controlled outbound probe, image vulnerability scan and complete teardown on the selected runner.
- **Enterprise contracts:** Authorized nonproduction AD and SMTP tests, deactivation propagation, role and CTO routing agreement, and SMTP reconciliation policy.
- **Operations:** Production topology, recovery targets and realistic restore, alerting and rollback rehearsal.
- **Governance:** Stakeholder UAT, independent review, approved PR landing and deployment authorization.

Production remains NO-GO.

The Day 13 synthetic federation and lifecycle replay now has passing hosted evidence. The image scan still fails for both pinned images at the High threshold. A supported patched build and passing rescan are required for Day 13 acceptance. Production authorization and stakeholder review remain separate.

The supported Bookworm LTS candidate also failed the unchanged gate. A patched official Keycloak image and supported Samba packages that clear all outstanding High/Critical matches have not been verified. A failing image or unavailable vendor fix keeps Day 13 open. See [image security remediation](IMAGE_SECURITY_REMEDIATION.md).
