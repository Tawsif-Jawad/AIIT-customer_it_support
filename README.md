# AIIT

Artificial Intelligence for Information Technology

**Intelligent Support. Autonomous Solutions.**

Powered by Upstra Communications Limited.

## Current interface

Open [AIIT](http://localhost:3000/) for the public product page and [the workspace](http://localhost:3000/app) for development sign-in. The premium redesign includes the interactive dotted AIIT footer, responsive workspaces, API-backed assistant requests, comments, catalog and notifications. See [UI redesign evidence and limitations](docs/UI_REDESIGN.md).

## Verified implementation

The current local application runs a TypeScript Node HTTP frontend/proxy and API, with local JSON-file persistence, development HMAC tokens, role/SBU checks, ticket workflows, deterministic mock AI, and mock directory/mail adapters. Next.js, NestJS, Prisma, and BullMQ appear in manifests or scaffolding; their production integrations are not wired into the running application. Seed SBUs, policies, knowledge articles, and identities are demo fixtures, not confirmed company configuration.

Recovery fixed a generated browser-script syntax error that prevented login, dashboard rendering, and health initialization. Requests now have deadlines and health identifies mock or unverified dependencies. Development identity enumeration, email-only login, and development token verification are disabled in production or non-development authentication modes. Live OIDC is not yet implemented.

See [implementation status](docs/IMPLEMENTATION_STATUS.md) for evidence and release blockers. `npm run build` now runs real TypeScript checking followed by native module/browser-script smoke verification. It produces no framework bundle because the executing application uses native Node TypeScript. `npm run lint` now runs ESLint.

## Repository Structure
```text
.
├── apps/
│   ├── api/          # Modular REST API, Auth, RBAC, State Machine, Prisma Schema & Migrations
│   ├── web/          # Enterprise Web Portal UI (Next.js App Router + Standalone Web Server/Proxy)
│   └── worker/       # Background Notification & SLA Queue Processor
├── packages/
│   ├── shared/       # Shared Domain Types, State Machine, RBAC Policies, Input Validation, Redaction
│   └── connectors/   # AD Adapter, Email Transport, Mailbox Provisioning Interface, AI Orchestrator
├── infra/            # Docker Compose (PostgreSQL, Redis, Keycloak, Mailpit) & Keycloak Realm JSON
├── docs/             # SRS, Architecture, AD/Email Integration, Security, Roadmap, Test Report, ADRs
├── tests/            # Unit, Full-Stack Integration, and Playwright E2E Browser Tests
├── .env.example      # Environment variable template (no hardcoded secrets)
└── package.json      # Monorepo workspace scripts
```

---

## Quick Start Commands

### 1. Local runtime
Use Node 26.8.1 (`.node-version`) and pnpm 9.15.0 (`packageManager`). The runtime now uses Zod for full persisted-record validation. Install the locked toolchain before starting:

```bash
npm exec --yes --package=pnpm@9.15.0 -- pnpm install --frozen-lockfile --ignore-scripts
npm exec --yes --package=pnpm@9.15.0 -- pnpm db:generate
npm exec --yes --package=pnpm@9.15.0 -- pnpm typecheck
npm exec --yes --package=pnpm@9.15.0 -- pnpm lint
npm exec --yes --package=pnpm@9.15.0 -- pnpm test
npm exec --yes --package=pnpm@9.15.0 -- pnpm build
# Chromium E2E uses disposable loopback servers and data:
npm exec --yes --package=pnpm@9.15.0 -- pnpm exec playwright install chromium
npm exec --yes --package=pnpm@9.15.0 -- pnpm test:e2e
# Explicit local demo opt-in; .env is not loaded automatically.
NODE_ENV=development AUTH_MODE=dev_oidc MAIL_PROVIDER=mock npm run start:api
# In another terminal:
npm run start:web
```

Database tests create and remove a synthetic local PostgreSQL cluster when initdb/pg_ctl/psql/pg_dump are available; they never use an external DATABASE_URL. Set DB_REQUIRED=true and PG_BINDIR to require the database gate. Current import/migration verification does not switch runtime storage.

A missing local JSON file initializes demo fixtures. Existing files are never reset: `db:seed` now refuses destructive reset. Do not start the standalone worker in JSON mode; notifications run within the API transaction. Development sign-in requires both explicit environment settings above. Enterprise authentication remains unavailable and fails closed.

See [Day 2 report](docs/development-reports/DAY2_REPORT_2026-11-09.md) and [persistence recovery](docs/architecture/PERSISTENCE_RECOVERY.md). Never remove a writer lease while a process may still be using the dataset.

*(Optional)* If Docker is installed on your machine, start PostgreSQL, Redis, Keycloak, and Mailpit via:
```bash
docker compose -f infra/docker-compose.yml up -d
psql "$DATABASE_URL" -f apps/api/prisma/migrations/20261108000000_init/migration.sql
```

---

## Local Development OIDC Identities
Development only: use the quick-selector on the login screen (`http://localhost:3000/app`) or `POST /api/auth/login` with any of these seeded development identities:

| Email | Role | SBU | Purpose |
|---|---|---|---|
| `tawsif.zawad@upstra.com` | `EMPLOYEE` | `SBU-TECH` | Submit/track SBU-TECH tickets, confirm AI fixes, acknowledge assigned assets |
| `nadia.islam@upstra.local` | `EMPLOYEE` | `SBU-FIN` | SBU-FIN employee identity (verifies cross-SBU access isolation) |
| `rahim.chowdhury@client.upstra.local` | `CUSTOMER` | `SBU-FIN` | Authorized external/customer request identity |
| `kamal.hossain@upstra.local` | `IT_ADMIN` | `SBU-CORP` | Manage IT ticket queue, decide IT approvals, manage assets, escalate to CTO |
| `farhana.ahmed@upstra.local` | `CTO` | `SBU-CORP` | Review CTO Escalation Queue, approve critical changes, inspect Audit Logs |

> **Important Security Note**: `tawsif.zawad@upstra.com` is used strictly as a seeded user identity record. No real emails are sent to this address, and no SMTP/AD server parameters are assumed.

## No-cloud-cost verification fallback

Run `node scripts/verify-local.ts` to execute all ten mandatory checks and save actual logs/exit codes in a temporary evidence directory. PostgreSQL binaries and Chromium prerequisites must be installed; missing prerequisites fail the run. This is local development verification, not hosted CI acceptance. See [no-cost recovery and CircleCI preparation](docs/ci/NO_COST_VERIFICATION.md) and the [prepared GitHub Support request](docs/ci/GITHUB_SUPPORT_REQUEST.md). CircleCI is not connected; existing GitHub checks/protection remain required.
