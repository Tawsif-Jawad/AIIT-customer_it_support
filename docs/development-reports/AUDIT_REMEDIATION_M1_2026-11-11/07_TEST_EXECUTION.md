# Test execution

Baseline ran at `5d42b59ce0484512c851ee78c0ee24f0b77c3ad8` before tracked edits. Final verification covered the application and test sources at `fb8b04988fcdfcc1112f89c725ede7c37dece29f`. Both ran `node scripts/verify-local.ts --output <new-directory>` with Node 26.8.1 and pnpm 9.15.0. The verifier prefixes each command below with `npm exec --yes --package=pnpm@9.15.0 -- pnpm`.

| Command | Baseline exit | Final exit | Passing baseline → final |
| --- | --- | --- | --- |
| `install --frozen-lockfile --ignore-scripts` | 0 | 0 | — |
| `db:generate` | 0 | 0 | — |
| `typecheck` | 0 | 0 | — |
| `lint` | 0 | 0 | — |
| `build` | 0 | 0 | — |
| `test` | 0 | 0 | 134 → 151 |
| `test:security` | 0 | 0 | 46 → 46 |
| `test:db` | 0 | 0 | 29 → 40 |
| `test:e2e` | 0 | 0 | 20 → 22 |
| `audit --audit-level=moderate` | 0 | 0 | — |

No failures or skips in either complete verifier run. Counts overlap because the native run includes the database and security suites. Both verifier exits were zero. See [baseline results](evidence/baseline/summary.json) and [final results](evidence/final/summary.json) for commands, counts and adjacent logs.

Three new JSON regressions failed against the unmodified implementation and pass in the final run. Their [red test output](evidence/json-red.log) records the incorrect response codes and sparse number. The original independent reproduction script was also rerun with `node reproduce.ts` in a clean archive of the verified Day 4 revision with generated dependencies. [Its scoped output](evidence/source-truth-targets.jsonl) confirms the earlier JSON and PostgreSQL defects. The final [database test log](evidence/final/08-test-db.log) records the paired parity tests and recovery diagnostics. The final [browser log](evidence/final/09-test-e2e.log) records both viewport cases and the existing assistant workflow.

An intermediate verifier exposed duplicate fixture properties in two TypeScript tests and ambiguous browser locators. The final run used the corrected fixtures and form-scoped locators.
