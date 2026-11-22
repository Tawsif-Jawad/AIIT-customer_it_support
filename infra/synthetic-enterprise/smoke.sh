#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
docker info >/dev/null
docker compose version >/dev/null
export AIIT_DAY13_TLS_DIR
AIIT_DAY13_TLS_DIR=$(mktemp -d)
project="aiit-day13-$(basename "$AIIT_DAY13_TLS_DIR" | tr -cd '[:alnum:]' | tr '[:upper:]' '[:lower:]')"
dc() { docker compose -p "$project" -f compose.yml "$@"; }
cleanup() {
  local result=$?
  trap - EXIT
  if ((result != 0)); then dc logs --no-color issuer >&2 || true; fi
  if ! dc down --volumes --remove-orphans; then result=1; fi
  rm -f "$AIIT_DAY13_TLS_DIR/cert.pem" "$AIIT_DAY13_TLS_DIR/key.pem"
  rmdir "$AIIT_DAY13_TLS_DIR" || result=1
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
  -addext subjectAltName=DNS:localhost -keyout "$AIIT_DAY13_TLS_DIR/key.pem" \
  -out "$AIIT_DAY13_TLS_DIR/cert.pem" 2>/dev/null
# The containing host directory is private. The non-root container reads the mounted key.
chmod 644 "$AIIT_DAY13_TLS_DIR/key.pem" "$AIIT_DAY13_TLS_DIR/cert.pem"
dc config --quiet
dc up -d
container=$(dc ps -q issuer)
address=$(docker inspect "$container" | jq -er '.[0].NetworkSettings.Networks | to_entries | if length == 1 then .[0].value.IPAddress else error("unexpected network count") end | select(length > 0)')
issuer=https://localhost:38443/realms/aiit-synthetic-office
endpoint=(--connect-to "localhost:38443:${address}:8443")
discovery=$(curl -fsS --noproxy '*' "${endpoint[@]}" --retry 25 --retry-all-errors --retry-delay 2 --max-time 5 \
  --cacert "$AIIT_DAY13_TLS_DIR/cert.pem" "$issuer/.well-known/openid-configuration")
jq -e --arg issuer "$issuer" '
  .issuer == $issuer and .authorization_endpoint == ($issuer + "/protocol/openid-connect/auth")
  and (.code_challenge_methods_supported | index("S256"))
  and (.id_token_signing_alg_values_supported | index("RS256"))
' <<<"$discovery" >/dev/null
curl -fsS --noproxy '*' "${endpoint[@]}" --max-time 5 --cacert "$AIIT_DAY13_TLS_DIR/cert.pem" \
  "$issuer/protocol/openid-connect/certs" | jq -e '.keys | any(.kty == "RSA" and .use == "sig")' >/dev/null
if curl -fsS --noproxy '*' --connect-to "127.0.0.1:38443:${address}:8443" --max-time 5 --cacert "$AIIT_DAY13_TLS_DIR/cert.pem" \
  "https://127.0.0.1:38443/realms/aiit-synthetic-office/.well-known/openid-configuration" >/dev/null 2>&1; then
  echo "Unexpected TLS hostname verification success" >&2
  exit 1
fi
network=$(docker inspect "$container" | jq -er '.[0].NetworkSettings.Networks | keys | if length == 1 then .[0] else error("unexpected network count") end')
docker network inspect "$network" | jq -e '.[0].Internal == true' >/dev/null
dc exec -T issuer bash -ec 'while read -r device destination remainder; do
  if [[ "$destination" == "00000000" ]]; then exit 1; fi
done </proc/net/route'
echo 'Verified Keycloak TLS, realm discovery, RS256 keys, and absence of an IPv4 default route.'
