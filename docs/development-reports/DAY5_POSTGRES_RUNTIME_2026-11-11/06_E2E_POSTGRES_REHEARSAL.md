# PostgreSQL Chromium rehearsal

Run the pinned `pnpm test:e2e:postgres` command with PostgreSQL executables available through PATH or `PG_BINDIR`. The selected portal and enterprise suites provision disposable loopback databases, run migrations, seed synthetic data and assert PostgreSQL readiness. The harness starts the real Node API and web proxy on separate loopback ports. The enterprise suite uses a controlled loopback issuer.

| Journey | Assertions |
| --- | --- |
| Employee | Sign in, open the workspace, submit required category data, see mock triage, comment, confirm resolution, restore the cookie session, search for the ticket, acknowledge custody, view knowledge and notifications, sign out |
| Customer | Empty asset view, ticket creation, reopen into IT, restricted IT controls |
| IT | Open queue, start work, add an internal note, decide approval and escalate |
| CTO | See escalation, perform permitted resolution, inspect audit and mock diagnostics |
| Portal behavior | Assistant submission, error recovery, stale detail response, pagination, keyboard and responsive viewports |
| Enterprise | Opaque cookie sign-in and restore, create and logout, provider failure, expired-session private workspace clearing |

The browser suite uses development authentication for the business journeys and enterprise OIDC for the three enterprise cases. Cross-SBU and worker fault assertions run through the PostgreSQL HTTP and worker tests. [Browser output](evidence/postgres-browser.txt)
