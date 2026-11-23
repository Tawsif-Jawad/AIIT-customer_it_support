#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
docker info >/dev/null
umask 077
root=$(mktemp -d)
export AIIT_DAY13_FIXTURE="$root/ad" AIIT_DAY13_TLS_DIR="$root/tls" AIIT_DAY13_REALM="$root/realm.json"
mkdir "$AIIT_DAY13_FIXTURE" "$AIIT_DAY13_TLS_DIR"
export AIIT_DAY13_ADMIN_PASSWORD
AIIT_DAY13_ADMIN_PASSWORD=$(openssl rand -hex 32)
project="aiit-federation-$(basename "$root" | tr -cd '[:alnum:]' | tr '[:upper:]' '[:lower:]')"
dc() { docker compose -p "$project" -f compose.yml -f federation.compose.yml "$@"; }
cleanup() {
  local status=$?
  trap - EXIT
  if ((status != 0)); then dc logs --no-color --tail 40 directory issuer || true; fi
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
    name:"synthetic-samba", providerId:"ldap",
    subComponents:{"org.keycloak.storage.ldap.mappers.LDAPStorageMapper":[
      {name:"synthetic-email",providerId:"user-attribute-ldap-mapper",config:{
        "user.model.attribute":["email"],"ldap.attribute":["mail"],"read.only":["true"],
        "always.read.value.from.ldap":["true"],"is.mandatory.in.ldap":["true"]
      }},
      {name:"synthetic-account-status",providerId:"msad-user-account-control-mapper",config:{}}
    ]}, config:{
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
ready=false
for attempt in {1..12}; do
  if read_directory '(objectClass=organizationalUnit)' ou >"$root/units.ldif" 2>"$root/ldap-error"; then ready=true; break; fi
  directory_id=$(dc ps -aq directory)
  if [[ "$(docker inspect -f '{{.State.Running}}' "$directory_id")" != true ]]; then
    echo 'Samba exited before accepting LDAPS' >&2
    cat "$root/ldap-error" >&2
    exit 1
  fi
  sleep 2
done
if [[ "$ready" != true ]]; then
  echo 'Trusted LDAPS readiness probe failed' >&2
  cat "$root/ldap-error" >&2
  dc exec -T directory openssl s_client -brief -connect directory:636 -verify_hostname directory \
    -verify_return_error -CAfile /fixture/ca.pem </dev/null || true
  exit 1
fi
echo "LDAPS organizational unit count: $(grep -ic '^ou: OFFICE-' "$root/units.ldif" || true)"
test "$(grep -ic '^ou: OFFICE-' "$root/units.ldif")" -eq 6
read_directory '(employeeID=FIC-*)' employeeID >"$root/users.ldif"
echo "LDAPS identity count: $(grep -ic '^employeeID:' "$root/users.ldif" || true)"
test "$(grep -ic '^employeeID:' "$root/users.ldif")" -eq 129
read_directory '(&(employeeID=FIC-*)(userAccountControl:1.2.840.113556.1.4.803:=2))' employeeID >"$root/disabled.ldif"
echo "LDAPS disabled identity count: $(grep -ic '^employeeID:' "$root/disabled.ldif" || true)"
test "$(grep -ic '^employeeID:' "$root/disabled.ldif")" -eq 3
read_directory '(sAMAccountName=employee1)' mail memberOf department >"$root/employee.ldif"
grep -q '^mail: employee1@example.test$' "$root/employee.ldif"
grep -qi '^memberOf: CN=ROLE-EMPLOYEE,' "$root/employee.ldif"
grep -q '^department: Operations$' "$root/employee.ldif"
# Refuse any external routes. Probe only reserved documentation addresses.
dc exec -T directory python3 - <<'PYTHON'
import errno
import socket
for family, endpoint in ((socket.AF_INET, ('192.0.2.1', 443)), (socket.AF_INET6, ('2001:db8::1', 443))):
    with socket.socket(family) as client:
        client.settimeout(2)
        result = client.connect_ex(endpoint)
        if result not in (errno.ENETUNREACH, errno.EHOSTUNREACH, errno.EAFNOSUPPORT):
            raise SystemExit('Expected an unreachable documentation destination, got errno ' + str(result))
    with socket.socket(family, socket.SOCK_DGRAM) as dns:
        # One standard A query for aiit.example.invalid, to a reserved TEST-NET address.
        query = bytes.fromhex('2301010000010000000000000461696974076578616d706c6507696e76616c69640000010001')
        try:
            dns.sendto(query, (endpoint[0], 53))
        except OSError as error:
            if error.errno not in (errno.ENETUNREACH, errno.EHOSTUNREACH, errno.EAFNOSUPPORT):
                raise
        else:
            raise SystemExit('Documentation-range DNS datagram was routable')
print('IPv4, IPv6 and outbound DNS documentation-range probes unreachable')
PYTHON
for name in employee1 it1 cto; do
  dc exec -T directory env LDAPTLS_CACERT=/fixture/ca.pem LDAPTLS_REQCERT=demand ldapsearch -LLL -o nettimeout=3 -s base -b '' \
    -H ldaps://directory:636 -x -D "$name@office.example.test" -y /fixture/user-password defaultNamingContext >/dev/null
done
dc up -d issuer
issuer=$(dc ps -q issuer)
address=$(docker inspect "$issuer" | jq -er '.[0].NetworkSettings.Networks | to_entries[0].value.IPAddress | select(length > 0)')
curl -fsS --noproxy '*' --connect-to "localhost:38443:$address:8443" \
  --retry 25 --retry-all-errors --retry-delay 2 --max-time 5 --cacert "$AIIT_DAY13_TLS_DIR/cert.pem" \
  https://localhost:38443/realms/aiit-synthetic-office/.well-known/openid-configuration \
  | jq -e '.issuer == "https://localhost:38443/realms/aiit-synthetic-office"' >/dev/null
echo 'Verified real Samba directory counts, disabled flags, LDAPS binds and Keycloak realm discovery.'

if dc exec -T directory env LDAPTLS_CACERT=/fixture/ca.pem LDAPTLS_REQCERT=demand ldapsearch -LLL -o nettimeout=3 -s base -b '' \
  -H ldaps://directory:636 -x -D employee120@office.example.test -y /fixture/user-password defaultNamingContext >/dev/null 2>&1; then
  echo 'Disabled identity unexpectedly bound to Samba' >&2
  exit 1
fi
if dc exec -T directory env LDAPTLS_CACERT=/fixture/ca.pem LDAPTLS_REQCERT=demand ldapsearch -LLL -o nettimeout=3 -s base -b '' \
  -H ldaps://127.0.0.1:636 -x -D employee1@office.example.test -y /fixture/user-password defaultNamingContext >/dev/null 2>&1; then
  echo 'LDAPS accepted an incorrect hostname' >&2
  exit 1
fi
if dc exec -T directory env LDAPTLS_REQCERT=demand ldapsearch -LLL -o nettimeout=3 -s base -b '' \
  -H ldaps://directory:636 -x -D employee1@office.example.test -y /fixture/user-password defaultNamingContext >/dev/null 2>&1; then
  echo 'LDAPS accepted an untrusted certificate' >&2
  exit 1
fi
if dc exec -T directory env LDAPTLS_CACERT=/fixture/ca.pem LDAPTLS_REQCERT=demand ldapsearch -LLL -o nettimeout=3 -s base -b '' \
  -H ldaps://directory:636 -x -D employee1@office.example.test -y /fixture/bind-password defaultNamingContext >/dev/null 2>&1; then
  echo 'LDAPS accepted an incorrect password' >&2
  exit 1
fi
export AIIT_DAY13_ISSUER_ADDRESS="$address" AIIT_DAY13_COMPOSE_PROJECT="$project"
export NODE_EXTRA_CA_CERTS="$AIIT_DAY13_TLS_DIR/cert.pem"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
mkdir -p "$root/browser-home/.pki/nssdb"
certutil -N --empty-password -d "sql:$root/browser-home/.pki/nssdb"
certutil -A -d "sql:$root/browser-home/.pki/nssdb" -n aiit-synthetic -t 'C,,' -i "$NODE_EXTRA_CA_CERTS"
(cd ../.. && HOME="$root/browser-home" node scripts/synthetic/federated-scenarios.ts)
