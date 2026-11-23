# Image provenance

The scanner runs on Linux amd64, Grype 0.122.1 and Syft 1.57.2. The fresh vulnerability database was built at 2026-11-22T06:19:59Z. The archived evidence contains the complete database URL, checksum, scanner versions, Docker image inspection and SBOMs. Registry manifests and local image IDs are distinct.

| Image | Pinned source / scanned ID |
|---|---|
| Selected Keycloak 26.8.2 registry index | `sha256:7e66a96e4739239070aeaf72e4c5decf0f7f682cfc725b9f7ea2b336eaba38b3` |
| Fresh amd64 Keycloak image ID | `sha256:4938c322f47d3736c580fc57bb335d35c784489bc7e6d8fbbd52dbdd1b27e72e` |
| Selected Debian Trixie base index | `sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2` |
| Original Samba scan image ID | `sha256:46720ae6621046b8551661d80296682d666dc4d8902e0325ef3537439cb21dd6` |
| Fresh pre-patch Samba image ID | `sha256:85f14f905a56f2a6d5edfead65a0ac0886e4a59156d623940c5e1f3356535071` |
| Patched Samba image ID in the package-update scan | `sha256:4e561bc209d0d34af1b96fef430e42257852bdaab51fd73f80555efd87571532` |
| Bookworm candidate base index | `sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc` |
| Rejected candidate image ID | `sha256:4f7dcbe5589bde5fba4cc3408b5371ea59fd944cfef4f490bf783a922930f4b7` |

The Samba images are built on disposable runners and are not published. Their local content IDs are supplied with the scan artifacts. Before the shared-image change, scan and federation jobs built independently. Matching source and package pins did not imply byte-identical IDs. The revised workflow exports the scanned Samba image to the same run; federation loads it, verifies the image ID before launch, and verifies the actual container image ID after launch. The full gate remains failed. [Fresh build identities and SBOMs](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45113068728#artifacts)
