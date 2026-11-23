# Image provenance

The scanner runs on Linux amd64 with pinned Grype 0.122.1 (`sha256:f1ba7e2917ee1395618de20a98da0aa7c0fb1788927797651047c50502a37538`) and Syft 1.57.2 (`sha256:ad92bd3ec1b94a3df01d4d0aec199afa9c42b72e86da436ff5f837914d32706b`). The archived CI artifacts contain the complete Grype database metadata (`grype-db.json`), scanner versions, Docker image inspection (`keycloak-image.json`, `samba-image.json`), per-image summaries (`keycloak-summary.json`, `samba-summary.json`), and CycloneDX SBOMs (`keycloak-sbom.cdx.json`, `samba-sbom.cdx.json`).

| Image / Stage | Pinned Source Digest / Scanned Image Identifier |
|---|---|
| Selected Keycloak 26.8.2 (`26.8.2-3`) registry index | `quay.io/keycloak/keycloak:26.8.2@sha256:7e66a96e4739239070aeaf72e4c5decf0f7f682cfc725b9f7ea2b336eaba38b3` |
| Scanned amd64 Keycloak image ID | `sha256:4938c322f47d3736c580fc57bb335d35c784489bc7e6d8fbbd52dbdd1b27e72e` |
| Selected Debian Trixie base index | `debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2` |
| Original Samba scan image ID | `sha256:46720ae6621046b8551661d80296682d666dc4d8902e0325ef3537439cb21dd6` |
| Fresh pre-patch Samba image ID | `sha256:85f14f905a56f2a6d5edfead65a0ac0886e4a59156d623940c5e1f3356535071` |
| Patched Samba image ID (`libc6`, `libc-bin`, `zlib1g`) | `sha256:4e561bc209d0d34af1b96fef430e42257852bdaab51fd73f80555efd87571532` |
| Bookworm candidate base index (Rejected) | `debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc` |
| Rejected Bookworm candidate image ID | `sha256:4f7dcbe5589bde5fba4cc3408b5371ea59fd944cfef4f490bf783a922930f4b7` |
| Final minimized & patched Samba image (`libc6`, `libc-bin`, `zlib1g` pinned + 7 GnuPG packages purged) | Built in `image-scan`, exported as `selected-samba-runtime` (`samba.tar.gz` + `image-id.txt`), and verified by exact SHA-256 image ID inside `samba-ldaps` before and after container launch ([run 45121964849](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45121964849#artifacts)) |

The workflow guarantees that the exact Samba image scanned in `image-scan` is exported as an uncompressed tarball artifact (`selected-samba-runtime`), loaded into Docker in `samba-ldaps`, verified against `image-id.txt` before `docker compose up -d --no-build directory`, and verified again on the running container via `docker inspect --format '{{.Image}}'`.
