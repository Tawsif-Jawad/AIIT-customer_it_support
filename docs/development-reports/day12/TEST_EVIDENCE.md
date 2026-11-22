# Test evidence

Baseline `78b3fc5298d09592370574a0cb5c540904ca1c63`. Day 12 exact candidate and archived GitHub job links are recorded in the draft PR. Local runs use Node 26.8.1, pnpm 9.15.0, macOS arm64 and disposable PostgreSQL 18.6; GitHub database uses PostgreSQL 16 on Ubuntu.

| Command | Evidence |
|---|---|
| `corepack pnpm synthetic:demo` | Eight scenario assertions passed; 11 TLS SMTP acceptances. |
| `corepack pnpm synthetic:up` | Startup, status, reset, empty inbox after reset and shutdown observed in the operator terminal. |
| `node --test tests/synthetic-office.test.ts` with `DB_REQUIRED=true` | Two passed, including repeatability, eight cases, disabled account/revocation, SMTP retry and disposable restore. |
| `corepack pnpm typecheck`, `lint`, `build`, and both moderate audits | Local quality suite completed. |
| `corepack pnpm test`, `test:db`, `test:e2e`, `test:e2e:postgres` | Exact-head job outputs and totals are linked from the draft PR. |

Initial local startup with an empty macOS environment hit PostgreSQL locale initialization. The scripts now set `LC_ALL=C`. A targeted Chromium run found that the issuer's form CSP blocked its registered redirect. The policy now allows the fixed loopback portal as well, and the targeted Chromium regression passed. An early browser fixture teardown disconnected PostgreSQL while a ticket-detail request was in flight. Shutdown now drains active HTTP connections, and the browser regression asserts ticket detail returns successfully before cleanup. A first full suite invocation detected the original local JSON demo data and correctly refused its isolated-verifier check. Full verification was repeated from a clean staged snapshot while the original demo data remained in place. Docker-specific fidelity remains blocked.
