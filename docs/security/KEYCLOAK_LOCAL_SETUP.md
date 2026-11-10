# Optional isolated Keycloak verification

**Prepared, not executed.** No local Keycloak listener was available during Day 4. The automated suite instead tests real protocol exchanges against a controlled loopback issuer. No corporate realm, Active Directory or mail server is contacted.

Use an already approved, separately installed nonproduction Keycloak distribution and its supported Java runtime. This task does not install Docker, Keycloak or paid infrastructure. Use a private development data directory and bind the server to loopback. Do not import into an existing company realm.

The synthetic blueprint is `infra/keycloak/aiit-local-realm.json`: new `aiit-local` realm, public Code client `aiit-local`, S256 required, exact loopback callback, no implicit/password/service grants, four synthetic accounts, no credentials or federation providers. Set private test passwords in that isolated realm through its admin console; do not put passwords in Git, command history or this document. Realm roles do not grant AIIT application permissions.

Import the blueprint into a NEW disposable realm using the admin console, or copy it into the isolated distribution's `data/import` and use its startup import option. Keycloak documents `--import-realm` and existing-realm behavior in its [official import guide](https://www.keycloak.org/server/importExport). Verify standard flow and S256 in the client settings using the [official OIDC client settings](https://github.com/keycloak/keycloak/blob/main/docs/documentation/server_admin/topics/clients/oidc/con-basic-settings.adoc). Do not assume a successful import or login merely because the JSON parses.

Example app settings for this blueprint, in a shell scoped only to the disposable test process:

```text
NODE_ENV=development
AUTH_MODE=oidc
MAIL_PROVIDER=mock
OIDC_ISSUER_URL=http://127.0.0.1:8080/realms/aiit-local
OIDC_CLIENT_ID=aiit-local
APP_PUBLIC_URL=http://127.0.0.1:4300
OIDC_ALLOW_INSECURE_LOOPBACK=true
OIDC_SESSION_SECONDS=1800
```

Issuer host must exactly match the provider's actual discovery `issuer`. Verify the new realm's discovery metadata, then obtain the synthetic test account's subject from that realm's admin user ID (this blueprint has no subject mapper). Bind it explicitly to a synthetic AIIT fixture user. Never bind a company user based on email or copy an upstream token to frontend storage.

Start a separate fixture application, **not** the default `apps/api/src/main.ts` entrypoint (that uses the operational JSON path). From the repository root, with the scoped variables above and `AIIT_TEST_SUBJECT` set to the isolated test user ID:

```js
// Run using node --input-type=module; this snippet creates a NEW temporary store.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EnterpriseDataStore} from './apps/api/src/store.ts';
import {createApiServer} from './apps/api/src/app.ts';
import {createWebServer} from './apps/web/src/server.ts';
if (!process.env.AIIT_TEST_SUBJECT) throw new Error('Explicit synthetic subject required');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiit-keycloak-fixture-'));
const file = path.join(dir, 'db.json');
const store = new EnterpriseDataStore(file);
const user = store.getState().users[0];
user.oidcIssuer = process.env.OIDC_ISSUER_URL;
user.oidcSubject = process.env.AIIT_TEST_SUBJECT;
store.persist();
const api = createApiServer(file);
api.server.listen(0, '127.0.0.1', () => {
  const web = createWebServer('http://127.0.0.1:' + api.server.address().port);
  web.listen(4300, '127.0.0.1');
});
```

Use `http://127.0.0.1:4300/app`; do not use the user's ports 3000/4000. Authenticate only with the isolated synthetic account, confirm the expected AIIT role/SBU, reload, exercise a synthetic request, logout, and verify old-cookie rejection. Repeat negative issuer/client/binding tests only against the disposable realm. Record actual Keycloak version, migration/source commit, results and cleanup ownership before marking this integration tested. Keep session files/private realm data out of artifacts. Stop the fixture processes before manually removing only their temporary resources.

This procedure is not production provisioning or AD federation authorization. Production requires HTTPS, reviewed client/identity bindings and all release gates; the local HTTP exception is rejected in production mode.
