"""Provision the disposable, LDAP-only synthetic Samba DC."""
import json
import logging
import os
from pathlib import Path
import secrets
import ldb
from samba.auth import system_session
from samba.provision import provision

fixture = Path('/fixture')
domain = 'DC=office,DC=example,DC=test'
staff = 'OU=Staff,' + domain
configuration = Path('/tmp/synthetic-ad/etc/smb.conf')
def serve():
    os.execv('/usr/sbin/samba', ['samba', '--foreground', '--no-process-group', '-s', str(configuration)])

if Path('/tmp/synthetic-ad/provisioned').is_file():
    serve()
manifest = json.loads((fixture / 'directory.json').read_text())
assert manifest['realm'] == 'OFFICE.EXAMPLE.TEST'
assert len(manifest['organizationalUnits']) == 6 and len(manifest['accounts']) == 129
logging.basicConfig(level=logging.WARNING)
result = provision(
    logging.getLogger('synthetic-ad'), system_session(), None, targetdir='/tmp/synthetic-ad',
    realm='OFFICE.EXAMPLE.TEST', domain='OFFICE', hostname='directory',
    serverrole='active directory domain controller', dns_backend='SAMBA_INTERNAL',
    adminpass='Aa!1' + secrets.token_hex(24), skip_sysvolacl=True,
)
contents = configuration.read_text()
configuration.write_text(contents.replace('[global]', '''[global]
    tls certfile = /fixture/ad.pem
    tls keyfile = /fixture/ad-key.pem
    tls cafile = /fixture/ca.pem
    server services = ldap
''', 1))
db = result.samdb
db.add({'dn': staff, 'objectClass': 'organizationalUnit'})
for unit in manifest['organizationalUnits']:
    db.add({'dn': 'OU=' + unit + ',' + staff, 'objectClass': 'organizationalUnit'})
for group in manifest['groups']:
    db.newgroup(group)
password = (fixture / 'user-password').read_text().strip()
for account in manifest['accounts']:
    name = account['username']
    ou = account['ou'].removesuffix(',' + domain)
    db.newuser(name, password, userou=ou, useusernameascn=True)
    obj = db.search(base=staff, expression='(sAMAccountName=' + ldb.binary_encode(name) + ')')[0]
    update = ldb.Message(obj.dn)
    for key, value in {'mail': account['email'], 'employeeID': account['employeeNumber'],
                       'department': account['department'], 'displayName': account['displayName']}.items():
        update[key] = ldb.MessageElement(value, ldb.FLAG_MOD_REPLACE, key)
    db.modify(update)
    for group in account['groups']:
        db.add_remove_group_members(group, [name], add_members_operation=True)
    if not account['enabled']:
        db.disable_account('(sAMAccountName=' + ldb.binary_encode(name) + ')')
db.newuser('federation-reader', (fixture / 'bind-password').read_text().strip(), useusernameascn=True)
del db, result
Path('/tmp/synthetic-ad/provisioned').touch()
serve()
