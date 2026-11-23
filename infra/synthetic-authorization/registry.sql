-- Apply on a separate owner-controlled database. Runtime callers have no direct SQL access.
CREATE SCHEMA day14_authority;
REVOKE ALL ON SCHEMA day14_authority FROM PUBLIC;

CREATE TABLE day14_authority.exceptions (
  exception_id text PRIMARY KEY,
  revoked_at timestamptz
);

CREATE TABLE day14_authority.execution_claims (
  exception_id text NOT NULL REFERENCES day14_authority.exceptions(exception_id),
  execution_id text PRIMARY KEY CHECK (length(execution_id) BETWEEN 1 AND 256),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz
);

REVOKE ALL ON day14_authority.exceptions, day14_authority.execution_claims FROM PUBLIC;
