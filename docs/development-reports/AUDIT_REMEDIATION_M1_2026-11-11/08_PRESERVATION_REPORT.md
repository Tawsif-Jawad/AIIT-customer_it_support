# Operational preservation

| Protected file | SHA-256 before and after |
| --- | --- |
| `.env` | `a86d4d9858351a451523313d21a61f39a2fa788babfcf35768cbee496b88f02c` |
| `.data/enterprise-db.json` | `26b564bdf590ebac229215051176a9a64d03f865b9720007126c690bab76bc94` |

The baseline and final verifier check both files for changes. The additional regressions use synthetic records, temporary JSON paths, controlled test issuers and disposable loopback PostgreSQL databases. The source-truth probe ran in an archive without operational files. Existing localhost services were left alone. The original audit directories and unrelated untracked screenshots were preserved in the workspace. No corporate AD, mail transport, AI service or production database was contacted.
