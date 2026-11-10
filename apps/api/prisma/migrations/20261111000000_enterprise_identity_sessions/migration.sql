BEGIN;
-- Existing user IDs, dev subjects and sessions are retained without rebinding.
ALTER TABLE "User" ADD COLUMN "oidcIssuer" TEXT;
ALTER TABLE "AuthSession" ADD COLUMN kind TEXT, ADD COLUMN issuer TEXT, ADD COLUMN subject TEXT;
ALTER TABLE "AuthSession" ADD CONSTRAINT enterprise_session_binding CHECK (
 (kind IS NULL AND issuer IS NULL AND subject IS NULL) OR
 (kind='oidc' AND issuer IS NOT NULL AND subject IS NOT NULL AND length(issuer)>0 AND length(subject)>0)
);
COMMIT;
