#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
temp=$(mktemp -d)
trap 'rm -rf -- "$temp"' EXIT
archive=grype_0.122.1_linux_amd64.tar.gz
curl -fsSL --retry 2 "https://github.com/anchore/grype/releases/download/v0.122.1/$archive" -o "$temp/$archive"
(cd "$temp" && printf '%s  %s\n' f1ba7e2917ee1395618de20a98da0aa7c0fb1788927797651047c50502a37538 "$archive" | sha256sum -c -)
tar -xzf "$temp/$archive" -C "$temp" grype
keycloak=$(awk '$1 == "image:" {print $2; exit}' compose.yml)
[[ "$keycloak" == quay.io/keycloak/keycloak:*@sha256:* ]]
docker pull "$keycloak"
docker build -f Samba.Dockerfile -t aiit-day13-samba-scan .
result=0
for image in "$keycloak" aiit-day13-samba-scan; do
  echo "Scanning $image"
  "$temp/grype" "docker:$image" --fail-on high || result=1
done
exit "$result"
