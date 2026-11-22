# Supervisor demo

1. Run `corepack pnpm synthetic:up` and open `http://127.0.0.1:3120/app`. Verify the fictional-data banner.
2. Choose **Sign in with enterprise identity** and use `employee1@example.test`, `it1@example.test`, or `cto@example.test` with password `fictional-office-demo`. Use separate browser profiles or sign out between identities. `employee120@example.test` is a disabled test account.
3. As the employee, submit an Outlook configuration request and reopen it if the guidance requires IT follow-up. As IT, open the queue, record work, or escalate an eligible request. As CTO, open the escalation and review the bound approval. Use a fictional identity only.
4. Inspect notifications, the asset inventory, and the role-appropriate reporting views. In the runner terminal, use `inbox` to inspect the most recent synthetic messages. Use `fail-mail` to make the sink reject the next SMTP submission temporarily, then watch a retry.
5. Run `corepack pnpm synthetic:demo` in another terminal for the automated Wi-Fi remediation, asset handover, expiring approval, SLA and role-boundary scenarios. It creates a separate instance. Use `reset` in the interactive terminal to start the manual demo over, or `down` to shut it down.

See [expected scenario outcomes](SCENARIO_RESULTS.md) and [setup](ENVIRONMENT_SETUP.md).
