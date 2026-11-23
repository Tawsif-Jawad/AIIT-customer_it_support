# Samba AD validation

`corepack pnpm --silent synthetic:directory-manifest` emits credential-free provisioning input derived from Day 12. It has six organizational units, 129 accounts, three disabled accounts, employee IDs, fictional groups and department attributes. The output excludes simulator OIDC subjects. The manifest count was checked locally with jq. No directory was written.

## Remediation implementation

`infra/synthetic-enterprise/federation.sh` builds the Samba fixture from an immutable Debian Trixie base (`debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2`), pins published security updates for `libc6` (`2.41-12+deb13u5`), `libc-bin` (`2.41-12+deb13u5`), and `zlib1g` (`1:1.3.dfsg+really1.3.1-1+deb13u1`), purges 7 non-runtime GnuPG packages (`dirmngr`, `gnupg`, `gnupg-l10n`, `gpg`, `gpg-agent`, `gpgconf`, `gpgsm`), and provisions the existing manifest via `provision-samba.py`. Samba serves LDAPS on a private internal Docker network.

Note on provisioning persistence across container restart: `provision-samba.py` checks `if Path('/tmp/synthetic-ad/provisioned').is_file(): serve()`. Because `/tmp/synthetic-ad` resides inside the container's writable layer, stopping and starting the container (`docker compose stop directory` -> `docker compose start directory`) preserves the provisioned SAM database and immediately re-executes `/usr/sbin/samba` with the root-owned private key without re-provisioning.

On commit `df217e31f1c673be5f910164dd3fa92c77a230b1` ([run 45121964849 / job 137518124409](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45121964849/job/137518124409)), the hosted runner verified:
- Exact SHA-256 image identity matching the image scanned in `image-scan`
- 6 organizational units (`OFFICE-*`), 129 employee records (`FIC-*`), and 3 disabled accounts (`userAccountControl` bit `2`) over trusted LDAPS
- Positive LDAPS binds for `employee1`, `it1`, and `cto`
- Negative LDAPS rejections for disabled identity (`employee120`), wrong hostname (`127.0.0.1`), untrusted certificate, and wrong password
- Unreachable IPv4, IPv6, and UDP DNS probes to documentation ranges (`192.0.2.1`, `2001:db8::1`)
- Complete recovery after both `docker compose pause`/`unpause` and full `docker compose stop`/`start`
