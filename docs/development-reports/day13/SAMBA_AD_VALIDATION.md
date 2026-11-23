# Samba AD validation

`corepack pnpm --silent synthetic:directory-manifest` emits credential-free provisioning input derived from Day 12. It has six organizational units, 129 accounts, three disabled accounts, employee IDs, fictional groups and department attributes. The output excludes simulator OIDC subjects. The manifest count was checked locally with jq. No directory was written.

A disposable Samba AD DC and read-only federation identity remain future work. Use the fictional realm OFFICE.EXAMPLE.TEST, create a dedicated staff base and its six units, and provision the manifest with runtime-generated passwords. Use a private certificate with a DNS SAN for the DC and verify LDAPS trust in Keycloak. Keep Samba administration inside the isolated network. [Samba domain and account tooling](https://www.samba.org/samba/docs/current/man-html/samba-tool.8.html)

Real bind, user/password verification, missing and disabled users, group/profile changes, federation synchronization, outage and recovery, and federated session propagation were not executed. The existing simulator still verifies local disable and revocation. Measure identity-sync delay and existing Keycloak and AIIT session behavior before selecting an additional revocation control.

## Remediation implementation

`infra/synthetic-enterprise/federation.sh` builds the Samba fixture from an immutable Debian base and provisions the existing manifest. Samba serves LDAP on a private Docker network. The runner tests actual LDAPS search counts, fictional attributes and membership, enabled role binds, disabled bind, wrong credentials, untrusted certificate and hostname mismatch. Keycloak uses a separate ordinary directory user with read-only provider configuration. Hosted verification is required before these checks can be marked passed.

Hosted remediation verified the live Samba certificate chain and hostname with TLS 1.3. LDAP then returned invalid credentials for the federation reader. The harness now writes password files without a trailing newline, matching the bytes used during provisioning. The associated rerun must demonstrate the positive bind and all later assertions. [TLS and bind diagnostic](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45108830274/job/137476253658)

The hosted password-file rerun verified 6 organizational units, 129 employee records, 3 disabled flags, trusted role binds and the transport rejection checks, then reached Keycloak federation. [Hosted directory results](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45109042618/job/137476921029)
