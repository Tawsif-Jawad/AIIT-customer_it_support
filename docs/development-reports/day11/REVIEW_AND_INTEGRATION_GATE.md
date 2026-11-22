# Independent review and integration gate

- Verify PR head/base and compare each incremental diff. Check the consolidated merge tree against fresh main and confirm required branch checks.
- Trace approval lookup, expiry, digest, immutable decision record and legacy reissuance. Check denial and parity assertions in both stores.
- Trace SLA worker transactions and stable mail job identity. Inspect exhaustion audit transaction and notes on ambiguous acceptance.
- Check existing global privileged access against owner-approved scope and verify target access mapping, CTO routing, and audit exposure.
- Review release runbooks and rollback assumptions with operations. Check independent review, enterprise UAT and release authorization before integration.

Internal review traced data and transaction boundaries. No authorized independent reviewer was identifiable from submitted reviews. Repository maintainers should assign an eligible reviewer and preserve exact-head approval. A draft PR and passing CI supply engineering evidence. Human approval and integration remain pending.
