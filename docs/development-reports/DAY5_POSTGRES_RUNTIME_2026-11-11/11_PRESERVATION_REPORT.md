# Operational preservation

The SHA-256 digests of `.env` and `.data/enterprise-db.json` matched before and after verification. The pre-existing checkout, untracked audit materials and images remained in the workspace. The Day 5 branch started from the verified Milestone 1 head. [Hash comparison](evidence/preservation.json)

Before work began, existing PostgreSQL listeners were observed on ports 5432 and 55432. The tests selected their own temporary directories, databases and loopback ports and used an explicit test URL. Existing listeners were left alone. The application continued to use mock AD, mock email and deterministic mock AI. The rehearsal made no production connections, corporate directory requests, SMTP deliveries or mailbox writes.
