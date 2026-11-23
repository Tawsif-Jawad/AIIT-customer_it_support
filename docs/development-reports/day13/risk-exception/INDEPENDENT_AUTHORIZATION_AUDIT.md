# Day 13 independent authorization audit

The review began on `development` at `df484499a58f1f99b4b67e3244bda917461d7005` in [Tawsif-Jawad/AIIT-customer_it_support](https://github.com/Tawsif-Jawad/AIIT-customer_it_support). The local checked-out commit and remote branch agreed. The review covered the preflight, CLI, authorization tests, both synthetic workflows, package scripts, all seven risk-exception documents, and the relevant Compose, scan, smoke and federation code.

## Threat model and baseline findings

An operator or CI caller may supply command arguments and environment variables. A contributor may change checked-in files on a ref they control. A holder of a previously valid signed record may retain copies after revocation. Trusted components must include the owner signing key, the identity-to-key binding, reviewed workflow code, the authoritative clock and revocation state, and the service that verifies runtime evidence. A privileged machine owner or someone who can change the trusted workflow, runner or trust registry can bypass repository-level software.

| Severity | Baseline source | Finding and consequence |
|---|---|---|
| High | `day14-preflight.ts:349–397` | A local caller controlled the verification key and matching identity list via environment values. A caller-supplied attestation marker received trust without independent GitHub evidence. The preflight could accept unauthorized approval evidence. |
| High | `day14-preflight.ts:37–54,242–249` | The exception signature covered a start flag with an optional timestamp. It could not demonstrate a separate, subsequent decision or bind it to a particular execution. |
| High | `day14-preflight.ts:178–182,217–235,387–397` | Live evaluation lacked an authoritative revocation source. Copies of an earlier approval could survive replacement of the stored record. Expiry was checked only once and trusted-clock labels were assigned from caller-visible inputs. No Day 14 workload existed to enforce an execution deadline. |
| High | `day14-preflight.ts:306–347` | Text matches and unconditional data/secret booleans counted as runtime evidence. A passing result could conceal drift in effective network, image, privileges, inputs or cleanup. The Samba base digest did not establish the running image identity. |
| High | `.github/workflows/day14-synthetic-simulation.yml:20–38` | The workflow named an Environment without independently verifying its protection and interpolated dispatch input inside shell source. Repository/ref enforcement depended on a passed label. The choice UI reduces exposure, but shell input must be treated as data regardless of upstream choice validation. |
| Medium | `day14-preflight.ts:96–137,350–360` | The caller branch label took precedence over Git, JavaScript date normalization could accept impossible calendar times, and private-range IP addresses were broadly accepted despite possible corporate overlap. |
| Informational | `cli.ts:7–14` and the Day 14 workflow | The baseline CLI stopped at a workload placeholder and the workflow only ran preflight. The findings concern the authorization verdict and future workload consumers. |

The verifier checks the complete canonical payload, requires Ed25519 and canonical base64 signatures, validates real UTC calendar dates and the exclusive expiry boundary, and binds the separate start record to the exception hash, owner, activity, commit and execution ID. It checks supplied revocation state, effective image IDs and explicit runtime control assertions. An offline verifier result is only as trustworthy as its inputs. The live entry points have no adapter that can supply trusted inputs and always deny.

## Staged enforcement contract

1. Before provisioning, verify GitHub's repository, workflow and ref context and the reviewed commit. Verify external reviewer protection, pin an owner-controlled key to the owner identity, and obtain fresh authoritative time and revocation state. Verify both decisions and reserve a single-use execution ID. Deny if a dependency is missing.
2. In a disposable job with narrowly scoped setup permissions, resolve effective configuration, verify fixture integrity and secret exclusion, and provision only the resources needed for isolation validation. Use a dedicated internal network and a cleanup supervisor in place before starting resources.
3. Inspect actual image IDs, routes, privileges, mounts, port bindings and network membership. Validate IPv4, IPv6 and DNS isolation with controlled synthetic probes. Compare actual workload targets against the allowlist. Bind evidence to the same execution and recheck authorization before workload start. Any failure triggers cleanup.
4. During execution, maintain the deadline and recheck authoritative revocation and isolation. Cancel and tear down on expiry, revocation, evidence loss or drift. Record the result of checking that all execution resources were removed.

The current patch implements the offline decision rules and removes the source-text path to authorization. It leaves provisioning, authoritative state retrieval, runtime monitoring, and workload execution gated off. An authenticated owner-controlled adapter and execution supervisor are still required.

## GitHub configuration and release status

The public Environment API lookup returned HTTP 404. That response does not establish whether a protected Environment exists or who can review it. Deployment authorization is **BLOCKED — CONFIGURATION UNVERIFIED**. The workflow is dispatch-only, checks repository/event/full ref/workflow identity in the job condition, checks out the dispatched SHA, uses read-only contents permission, disables checkout credential persistence, and passes the activity as a quoted argument. It requests no approval credentials and has no workload or downstream job.

The owner must verify a selected deployment branch rule for `development`, required independent reviewers, prevention of self-review and administrator bypass restrictions. The owner must also protect workflow changes on `development`, establish the external owner trust and revocation sources, and verify the staged enforcement on a disposable runner before enabling any workload. See [GitHub deployment protection rules](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

The Day 13 `grype --fail-on high` gate remains failing in the recorded evidence. Keycloak reports 1 Critical and 5 High matches. Samba on Debian Trixie reports 5 Critical and 139 High matches. The image scan policy and pinned sources were preserved. `AIIT-SYNTH-EXC-001` remains **PENDING APPROVAL**, Day 13 **PARTIAL / BLOCKED**, Production **NO-GO**, and Day 14 **ON HOLD**.

## Local regression evidence

| Check | Result |
|---|---|
| Typecheck, ESLint and build | Passed on Node 26.8.1 |
| Authorization | 29 passed, including the original 21 cases and eight new regression tests with test-only Ed25519 keys and deterministic time |
| Application | 222 passed in a temporary source copy without the workspace's `.env` and operational data. The first run in the regular workspace triggered the existing clean-checkout guard. |
| Security and integration | 55 and 9 passed, respectively |
| Disposable PostgreSQL | 59 passed with `DB_REQUIRED=true` |
| Browser | 29 passed and one PostgreSQL-only case skipped in the default run. All 22 PostgreSQL browser tests passed, including that case. |
| Negative live entry | Direct TypeScript, synthetic CLI and npm preflight all returned `allowed: false` and exited 1 on 23 November 2026 at 15:09 Asia/Dhaka. |

Expiry tests exercise reevaluation of the decision before, at and after the deadline. No live cancellation, authority adapter, runtime evidence collection or Day 14 workload was exercised.
