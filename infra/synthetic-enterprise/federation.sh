#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
docker info >/dev/null
umask 077
root=$(mktemp -d)
export AIIT_DAY13_FIXTURE="$root/ad" AIIT_DAY13_TLS_DIR="$root/tls" AIIT_DAY13_REALM="$root/realm.json"
mkdir "$AIIT_DAY13_FIXTURE" "$AIIT_DAY13_TLS_DIR"
project="aiit-federation-$(basename "$root" | tr -cd '[:alnum:]' | tr '[:upper:]' '[:lower:]')"
dc() { docker compose -p "$project" -f compose.yml -f federation.compose.yml "$@"; }
cleanup() {
  local status=$?
  trap - EXIT
  dc down --volumes --remove-orphans || status=1
  rm -rf -- "$root"
  exit "$status"
}
trap cleanup EXIT
node ../../scripts/synthetic/directory-manifest.ts >"$AIIT_DAY13_FIXTURE/directory.json"
for role in user bind; do printf 'Fic!7%s\n' "$(openssl rand -hex 24)" >"$AIIT_DAY13_FIXTURE/$role-password"; done
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=AIIT-Synthetic-CA \
  -keyout "$root/ca-key.pem" -out "$AIIT_DAY13_FIXTURE/ca.pem" 2>/dev/null
openssl req -new -newkey rsa:2048 -nodes -subj /CN=directory -keyout "$AIIT_DAY13_FIXTURE/ad-key.pem" -out "$root/ad.csr" 2>/dev/null
printf 'subjectAltName=DNS:directory\nextendedKeyUsage=serverAuth\n' >"$root/ad.ext"
openssl x509 -req -in "$root/ad.csr" -CA "$AIIT_DAY13_FIXTURE/ca.pem" -CAkey "$root/ca-key.pem" \
  -CAcreateserial -days 1 -extfile "$root/ad.ext" -out "$AIIT_DAY13_FIXTURE/ad.pem" 2>/dev/null
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
  -addext subjectAltName=DNS:localhost -keyout "$AIIT_DAY13_TLS_DIR/key.pem" -out "$AIIT_DAY13_TLS_DIR/cert.pem" 2>/dev/null
# Keycloak is non-root. The private parent still restricts host access.
chmod 644 "$AIIT_DAY13_TLS_DIR/"*.pem "$AIIT_DAY13_FIXTURE/ca.pem"
jq --rawfile password "$AIIT_DAY13_FIXTURE/bind-password" '
  .components = {"org.keycloak.storage.UserStorageProvider": [{
    name:"synthetic-samba", providerId:"ldap", subComponents:{}, config:{
      enabled:["true"], priority:["0"], vendor:["ad"], editMode:["READ_ONLY"],
      connectionUrl:["ldaps://directory:636"], usersDn:["OU=Staff,DC=office,DC=example,DC=test"],
      bindDn:["CN=federation-reader,CN=Users,DC=office,DC=example,DC=test"],
      bindCredential:[($password | rtrimstr("\n"))], authType:["simple"],
      usernameLDAPAttribute:["sAMAccountName"], rdnLDAPAttribute:["cn"], uuidLDAPAttribute:["objectGUID"],
      userObjectClasses:["person, organizationalPerson, user"], searchScope:["2"],
      useTruststoreSpi:["always"], importEnabled:["true"], cachePolicy:["NO_CACHE"]
    }
  }]}' realm.json >"$AIIT_DAY13_REALM"
chmod 644 "$AIIT_DAY13_REALM"
dc up -d --build directory
read_directory() {
  dc exec -T directory env LDAPTLS_CACERT=/fixture/ca.pem LDAPTLS_REQCERT=demand ldapsearch -LLL -o nettimeout=3 \
    -H ldaps://directory:636 -x -D CN=federation-reader,CN=Users,DC=office,DC=example,DC=test \
    -y /fixture/bind-password -b OU=Staff,DC=office,DC=example,DC=test "$1" "${@:2}"
}
for attempt in {1..40}; do
  if read_directory '(objectClass=organizationalUnit)' ou >"$root/units.ldif" 2>/dev/null; then break; fi
  sleep 2
done
test "$(grep -c '^ou: OFFICE-' "$root/units.ldif")" -eq 6
read_directory '(employeeID=FIC-*)' employeeID >"$root/users.ldif"
test "$(grep -c '^employeeID:' "$root/users.ldif")" -eq 129
read_directory '(&(employeeID=FIC-*)(userAccountControl:1.2.840.113556.1.4.803:=2))' employeeID >"$root/disabled.ldif"
test "$(grep -c '^employeeID:' "$root/disabled.ldif")" -eq 3
for name in employee1 it1 cto; do
  dc exec -T directory env LDAPTLS_CACERT=/fixture/ca.pem LDAPTLS_REQCERT=demand ldapwhoami \
    -H ldaps://directory:636 -x -D "$name@office.example.test" -y /fixture/user-password >/dev/null
done
dc up -d issuer
issuer=$(dc ps -q issuer)
address=$(docker inspect "$issuer" | jq -er '.[0].NetworkSettings.Networks | to_entries[0].value.IPAddress | select(length > 0)')
curl -fsS --noproxy '*' --connect-to "localhost:38443:$address:8443" \
  --retry 25 --retry-all-errors --retry-delay 2 --max-time 5 --cacert "$AIIT_DAY13_TLS_DIR/cert.pem" \
  https://localhost:38443/realms/aiit-synthetic-office/.well-known/openid-configuration \
  | jq -e '.issuer == "https://localhost:38443/realms/aiit-synthetic-office"' >/dev/null
echo 'Verified real Samba directory counts, disabled flags, LDAPS binds and Keycloak realm discovery.'
