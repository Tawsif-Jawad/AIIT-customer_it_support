#!/usr/bin/env bash
set -euo pipefail
evidence=$(realpath -m "${AIIT_IMAGE_EVIDENCE_DIR:-image-security-evidence}")
mkdir -p "$evidence"
cd "$(dirname "$0")"
temp=$(mktemp -d)
trap 'rm -rf -- "$temp"' EXIT

install_tool() {
  local name=$1 version=$2 digest=$3
  local archive="${name}_${version}_linux_amd64.tar.gz"
  curl -fsSL --retry 2 "https://github.com/anchore/$name/releases/download/v$version/$archive" -o "$temp/$archive"
  (cd "$temp" && printf '%s  %s\n' "$digest" "$archive" | sha256sum -c -)
  tar -xzf "$temp/$archive" -C "$temp" "$name"
}
install_tool grype 0.122.1 f1ba7e2917ee1395618de20a98da0aa7c0fb1788927797651047c50502a37538
install_tool syft 1.57.2 ad92bd3ec1b94a3df01d4d0aec199afa9c42b72e86da436ff5f837914d32706b
"$temp/grype" version >"$evidence/grype-version.txt"
"$temp/syft" version >"$evidence/syft-version.txt"
"$temp/grype" db update
"$temp/grype" db status -o json >"$evidence/grype-db.json"

scan() {
  local label=$1 image=$2 status=0
  docker image inspect "$image" | jq --arg reference "$image" '.[0] |
    {reference:$reference, imageId:.Id, repoDigests:.RepoDigests, os:.Os, architecture:.Architecture}' >"$evidence/$label-image.json" || return
  "$temp/syft" "docker:$image" -o cyclonedx-json >"$evidence/$label-sbom.cdx.json" || return
  GRYPE_DB_AUTO_UPDATE=false "$temp/grype" "docker:$image" -o json --fail-on high >"$evidence/$label-grype.json" || status=$?
  jq -e '.matches | type == "array"' "$evidence/$label-grype.json" >/dev/null || return
  jq --slurpfile identity "$evidence/$label-image.json" '
    [.matches[] | select(.vulnerability.severity == "High" or .vulnerability.severity == "Critical") |
      {image: $identity[0], id:.vulnerability.id, package:.artifact.name, installed:.artifact.version,
       fixedVersions:(.vulnerability.fix.versions // []), fixState:.vulnerability.fix.state,
       severity:.vulnerability.severity, advisorySource:.vulnerability.dataSource,
       namespace:.vulnerability.namespace, locations:.artifact.locations,
       runtimeImagePresence:true, affectedPathReachability:"not verified",
       vendorAdvisoryReview:"pending unless documented in Day 13 inventory",
       remediation:"verify vendor disposition and test a supported patched image"}]
    | sort_by(.id,.package,.installed)
  ' "$evidence/$label-grype.json" >"$evidence/$label-high-critical.json" || return
  jq -r --arg image "$label" 'group_by(.severity) | map({severity:.[0].severity, rows:length}) | {image:$image, findings:.}' "$evidence/$label-high-critical.json"
  return "$status"
}

if [[ "${1:-}" == bookworm ]]; then
  docker build -f Samba.Bookworm.Dockerfile -t aiit-day13-samba-bookworm-candidate .
  scan samba-bookworm aiit-day13-samba-bookworm-candidate
else
  keycloak=$(awk '$1 == "image:" {print $2; exit}' compose.yml)
  [[ "$keycloak" == quay.io/keycloak/keycloak:*@sha256:* ]]
  docker pull "$keycloak"
  docker build -f Samba.Dockerfile -t aiit-day13-samba-scan .
  if [[ -n "${AIIT_SAMBA_EXPORT_DIR:-}" ]]; then
    mkdir -p "$AIIT_SAMBA_EXPORT_DIR"
    docker image inspect --format '{{.Id}}' aiit-day13-samba-scan >"$AIIT_SAMBA_EXPORT_DIR/image-id.txt"
    docker save aiit-day13-samba-scan | gzip -1 >"$AIIT_SAMBA_EXPORT_DIR/samba.tar.gz"
  fi
  result=0
  scan keycloak "$keycloak" || result=1
  scan samba aiit-day13-samba-scan || result=1
  exit "$result"
fi
