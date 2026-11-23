# Owner-controlled Day 13 authorization infrastructure

Day 13 remains **PARTIAL / BLOCKED**. The exception remains **PENDING APPROVAL**, Production **NO-GO**, and Day 14 **ON HOLD**. The command-line and GitHub entry points remain denial-only.

## Trust, enrollment and single use

The owner keeps the Ed25519 private key outside the repository, Actions, and the executing host. The service must pin the independently verified public key to the named owner and authenticate the caller, exact reviewed `development` commit, and actual environment review. Use a dedicated service identity with restricted access. A repository file, workflow input, environment variable, or local test database carries no authority. Test credentials and the disposable registry must be excluded from the production trust policy.

The owner-service contract in `day14-supervisor.ts` obtains the two signed records, trusted current UTC, authoritative revocation, owner key and reviewed Samba image ID. The exception and later start decision keep the existing distinct Ed25519 signatures. The service enrolls an execution row after independently validating scope and approval. The fingerprint ties the enrolled row to both canonical signed decisions, owner/key identity, and the reviewed Samba scan image ID. Changes to commit, activity or material approval evidence require a distinct owner-issued execution ID.

The PostgreSQL schema is for a segregated owner-controlled database. Use separate enrollment and revocation roles and a narrowly scoped service identity for the consumption query. Require durable commits, verified TLS, bounded database statements and authoritative reads from the primary. The primary key and guarded UPDATE atomically spend the matching, unexpired, unrevoked row. Preserve spent and revoked rows, including after cancellations or ambiguous database responses. Do not grant runtime clients INSERT, DELETE, UPDATE, or access to arbitrary SQL. The consumption query shares a row lock with the exception record, so a committed exception-wide revocation blocks subsequent claims. Enforce terminal revocation and preserve the exception row in the owner service. The service must reject enrollment after exception revocation, obtain revocation state afresh on recheck, and prevent state rollback after database recovery. The repository includes the single-claim consumption query and schema, while endpoint authentication, authoritative revocation lookups, credential provisioning and external durable audit storage remain service integration requirements.

## Runtime controls and cancellation

The supervisor checks signatures and scope before claiming and provisioning. It rechecks immediately after a claim and before starting an inspected workload. The session provider owns disposable setup and holds a cleanup handle before any resources are created. Runtime validation requires full Docker object IDs, exact membership on an internal bridge, zero published ports, expected privilege limits and mounts, effective image IDs, fixture hash, an exact environment allowlist, and conclusive IPv4, IPv6 and DNS isolation observations. The Docker reader points at an explicit Unix socket with a clean environment. The owner provider must attest that the fixture bytes came from the effective fixture input and generate the synthetic credential expectations itself. It must derive targets from effective workload configuration. Probe only dedicated synthetic destinations and treat inconclusive results as denial.

A monotonic timer enforces the initial trusted UTC expiry. The supervisor rechecks authorization every second, with up to five seconds allowed for an authority transport response. A lost response, revoked state or changed authorization aborts the session. The supplied process helper kills a single child and waits for its exit. The production runtime provider must honor cancellation for setup and inspection, terminate the whole container/process tree, maintain independent deadlines if the agent or runner dies, and verify resource removal. Teardown failure is surfaced and sent to the audit sink. Process supervision, inspections and registry behavior are tested using harmless processes, mock Docker evidence and disposable PostgreSQL. The owner service, controlled probe implementation, verified cleanup provider and live workload integration are still pending.

## GitHub configuration and default-branch proposal

The public Environment endpoint returned HTTP 404. The public repository is eligible for GitHub's documented public-repository controls, but settings remain unverified. Before activation, the owner must do the following.

1. Create or inspect `day14-synthetic-exception` in repository settings. Restrict deployments to the exact `development` branch with no tag patterns. Require an independent reviewer, prevent self-review, and disable administrator bypass where supported.
2. Protect `development` and changes to the workflow, verifier, authority wiring and runtime controls through required review and protected-branch rules. Confirm the permission settings using a harmless reviewed check before attaching any authority identity. Credentials should reach only the trusted authority-facing job after review.
3. Decide separately whether to approve the default-branch workflow change. The preferred proposal is a minimal reviewed `workflow_dispatch` declaration at the same path on `main` with no jobs capable of privileged execution on `main`. Dispatch explicitly to `development`; the protected job rejects every other ref and verifies the resulting commit against the signed execution record. The Environment branch rule follows the dispatch ref, even if a checkout is pointed elsewhere. Therefore a privileged job executing on a `main` dispatch must never gain authority by checking out `development`.
4. A reusable workflow can centralize pinned logic but still needs a discoverable manual caller and correct Environment/ref behavior. If GitHub review restrictions cannot be confirmed, retain the block or separately approve a disposable owner-operated host behind an independent review control, authenticated authority and verified runtime supervision. Do not substitute workstation credentials or fixture stores for this architecture.

References [GitHub deployment protections](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) and [workflow dispatch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch).

## Samba Grype inventory comparison

Compared the committed [139-High baseline ledger](../MINIMIZED_HIGH_CRITICAL.tsv) against `samba-high-critical.json` in the [115-High scan artifact](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45144513404/artifacts/14804095612). The multiset key was CVE, package, installed version and severity. The intersection contains 5 Critical and 115 High matches. There were no added rows. Each row below represents four removed High matches at version `1.21.3-5+deb13u2`.

| CVE | Exact affected package rows removed from inventory |
|---|---|
| CVE-2026-112314 | libgssapi-krb5-2, libk5crypto3, libkrb5-3, libkrb5support0 |
| CVE-2026-112320 | libgssapi-krb5-2, libk5crypto3, libkrb5-3, libkrb5support0 |
| CVE-2026-112321 | libgssapi-krb5-2, libk5crypto3, libkrb5-3, libkrb5support0 |
| CVE-2026-112322 | libgssapi-krb5-2, libk5crypto3, libkrb5-3, libkrb5support0 |
| CVE-2026-112323 | libgssapi-krb5-2, libk5crypto3, libkrb5-3, libkrb5support0 |
| CVE-2026-119079 | libgssapi-krb5-2, libk5crypto3, libkrb5-3, libkrb5support0 |

All four libraries are present in the new CycloneDX SBOM at the same already-fixed version. None of those 24 CVE/package combinations is in the new full Grype match JSON at any severity. Both runs used Grype 0.122.1. The DB build changed from `2026-11-22T06:19:59Z` to `2026-11-23T06:28:32Z` (new archive checksum `3d24f57cd3587e2c73f686decc7ad04b213d1f3575bcf1dd847e42df94560f14`). Debian lists all six CVEs and marks the installed source version fixed. The rebuilt image IDs differ (old `sha256:4e561bc209d0d34af1b96fef430e42257852bdaab51fd73f80555efd87571532`, new `sha256:b4e8b2b4aa2f77ba2c283f2b68b015c13900d9a984bb502210e36929412cdf65`). Identical relevant package versions and the exact advisory-aligned delta support the inference that the updated DB corrected the match inventory for an already-installed patch. A same-image rerun against both DB builds would be needed to isolate the scanner input causally. The original evidence, failing scan threshold and production blocker remain. [Debian DSA-6650-1](https://security-tracker.debian.org/tracker/DSA-6650-1)

## Regression evidence

On Node 26.8.1, typecheck, ESLint and build passed. The authorization suite passed 34 cases, including concurrent claims against disposable PostgreSQL, replay, exception-wide revocation, invalid or unavailable evidence, mocked runtime inspection, real harmless child cancellation and recorded teardown failure. The clean-source application suite passed 227 cases. Dedicated security, integration and database suites passed 55, 9 and 59 cases. The live npm, CLI and direct TypeScript entry points each returned `allowed: false` and exited 1. The real signing, review and workload paths were never activated.
