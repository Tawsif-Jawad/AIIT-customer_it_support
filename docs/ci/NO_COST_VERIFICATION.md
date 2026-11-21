# No-cost verification and account recovery

Verified against official documentation on 9 November 2026. No payment, subscription, account migration, credential grant or branch-protection change was performed.

## GitHub eligibility and lock

AIIT is public and uses standard ubuntu-24.04 runners. GitHub documents standard hosted runner use for public repositories as free; larger runners are excluded. [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

The latest inspected run [42599910372](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/42599910372) has four registered jobs, no executed steps, and explicit account-billing-lock annotations. Repository Actions are enabled/all actions allowed. No source or workflow repair is indicated by this evidence.

GitHub also documents that a failed authorization hold can block free-tier access even without an active subscription or visible balance. If no actionable issue appears in Billing & licensing, it directs the owner to Support for lock review. [Locked account guidance](https://docs.github.com/en/billing/how-tos/troubleshooting/locked-account). The precise account subcause—failed hold, outstanding usage or another billing flag—is not exposed by repository/job metadata. Available billing API access previously returned 404. Payment methods were not accessed, and no claim is made that a debt exists or that payment is required. A no-payment Support resolution is possible to request, not guaranteed or completed.

Use the [prepared support request](GITHUB_SUPPORT_REQUEST.md) through the [official Support portal](https://support.github.com/contact). It has not been submitted. No account-setting-only free unlock was available through the authorized repository API. Do not repeatedly change runners or paywall settings to work around an account lock. After official restoration, manually dispatch the existing workflow and require real steps/pass results before accepting CI.

## Executable local fallback

Prerequisites: Node 26.8.1, npm access to pinned pnpm 9.15.0 (or cached package), PostgreSQL initdb/pg_ctl/psql/pg_dump binaries available to the current non-root user, and Chromium with platform libraries installed. Dependencies are installed with lifecycle scripts disabled; Prisma generation is explicit. Set PG_BINDIR if PostgreSQL tools are outside PATH.

```bash
# Browser prerequisite, if not already installed:
npm exec --yes --package=pnpm@9.15.0 -- pnpm install --frozen-lockfile --ignore-scripts
npm exec --yes --package=pnpm@9.15.0 -- pnpm exec playwright install chromium
# All ten mandatory commands, real exits, protected-file hash checks:
node scripts/verify-local.ts
# Or choose an evidence directory that does not yet exist:
node scripts/verify-local.ts --output /tmp/aiit-verification-NEW
```

On Linux install browser OS dependencies explicitly with Playwright's documented `install --with-deps chromium` when authorized in the local/test environment; the script itself does not request administrator privileges. [Browser prerequisites](https://playwright.dev/docs/browsers).

The runner invokes install, db:generate, typecheck, lint, build, test, test:security, test:db, test:e2e and audit in order through pinned pnpm. It records every exit/signal and log even after a command fails, rejects an existing output directory, and exits nonzero if any command fails or protected operational JSON/configuration hashes change. DB_REQUIRED=true prevents silently skipped PostgreSQL tests. A dummy loopback URL overrides external DATABASE_URL for generation; database tests always create their own temporary cluster. Auth/mail remain test mocks. Records/logs are local only; no GitHub success status is published. Review logs before sharing, and keep operational backups/credentials out of artifacts. Missing prerequisites produce failure rather than artificial green checks.

This fallback runs on existing local resources without cloud charges. It requires the owner's machine/storage/network and is **not GitHub-hosted CI or approved merge-gate equivalence**.

## Selected hosted alternative: CircleCI Free — NOT CONFIGURED

CircleCI can connect the existing GitHub repository and publish checks without duplicating/migrating the repository. Its official Free documentation lists 30,000 monthly credits for personal/non-open-source usage, 1 GB network transfer and 2 GB-months storage; eligible public open-source Linux projects may receive up to 400,000 monthly credits. [Credit limits](https://circleci.com/docs/guides/plans-pricing/credits/), [pricing](https://circleci.com/pricing/).

Public visibility alone is not our proof of this project's open-source licensing/credit eligibility: this checkout has no license file. No license was added or rights granted without owner approval. Base the initial plan on the personal Free allowance, verify actual eligibility/account limits before activation, and do not select trial/paid/auto-replenishment features or provide payment details. Provider limits can change; zero-cost operation is bounded by the confirmed Free account, not an unlimited-resource guarantee.

Repository-side preparation: `.circleci/config.yml`, one medium Linux job, vendor image cimg/node:26.8.1 pinned by digest. Docker Hub metadata confirmed Linux amd64/arm64 support and the exact tag/digest. This image provides the required Node release. The job installs distribution PostgreSQL tools, discovers PG_BINDIR, installs locked pnpm dependencies and Chromium prerequisites, then invokes the same verifier for every mandatory gate. All databases/browser servers are temporary. No deployment, corporate secrets, privileged infrastructure or paid executor is used.

The CircleCI YAML parses and its shell commands pass bash syntax checks locally. **No Docker engine/CircleCI CLI or authorized CircleCI project is available here, so provider schema acceptance, Linux image execution, apt/browser installation, credit eligibility and actual status reporting remain unverified.** Local script success does not claim those passed. [Configuration reference](https://circleci.com/docs/reference/configuration-reference/), [Node image](https://circleci.com/developer/images/image/cimg/node), [Playwright CI](https://playwright.dev/docs/ci).

### Owner setup, before any activation

1. Review and choose CircleCI Free for the existing account/repository. Creating an account/accepting terms, GitHub App installation and actual permissions require owner action/explicit authorization; none were done here.
2. Use the CircleCI GitHub App with only this repository selected; review requested permissions and limit contexts/secrets. Do not provide corporate credentials or authorize another account to bypass GitHub restrictions. GitHub App checks require appropriate provider authorization. [Project setup](https://circleci.com/docs/guides/getting-started/create-project/), [App integration](https://circleci.com/docs/guides/integration/using-the-circleci-github-app-in-an-oauth-org/).
3. Confirm Free limits and that no paid plan/overage/auto-charge is enabled. Set up `.circleci/config.yml` on the remediation branch; validate through CircleCI before running. Run only trusted vendor-hosted ephemeral executors, not untrusted self-hosted machines.
4. Inspect actual logs/results and confirm the returned check belongs to the current commit/provider app. Do not create a manual success status for local results.
5. Current main protection still requires GitHub quality/tests/database/browser. CircleCI is supplemental until its full equivalent gate is formally approved. This task did not remove, replace or bypass any required check. Neither a new provider nor local success alone accepts Day 2.

## Status

- Local fallback: executable and verified, subject to recorded current results.
- CircleCI: selected/prepared; NOT CONFIGURED, not activated and no hosted pass claimed.
- GitHub Actions: BLOCKED by the verified account lock.
- Day 2 acceptance: BLOCKED under the unchanged hosted-check policy.
