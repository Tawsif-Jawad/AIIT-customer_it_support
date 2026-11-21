# Preservation

The verification commands and benchmark use disposable PostgreSQL clusters bound to loopback. The fixture seeds synthetic identities and business data and uses controlled OIDC and mock integrations. The existing local API, portal and PostgreSQL listeners were left running. The source migrations from Day 5 remain present with their original bytes.

Before and after hashes cover `.env` and operational JSON files. No credentials, tokens, raw operational data or database dumps are included in the committed evidence. [SHA-256 comparison](evidence/preservation.json)
