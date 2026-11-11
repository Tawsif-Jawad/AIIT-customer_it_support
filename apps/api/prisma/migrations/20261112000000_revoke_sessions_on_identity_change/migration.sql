BEGIN;
CREATE FUNCTION aiit_revoke_changed_identity_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "AuthSession" WHERE "userId" = NEW.id;
  RETURN NEW;
END $$;

CREATE TRIGGER revoke_changed_identity_sessions
AFTER UPDATE OF "isActive", "sbuId", "roleId", "oidcIssuer", "oidcSubject" ON "User"
FOR EACH ROW WHEN (
  OLD."isActive" IS DISTINCT FROM NEW."isActive" OR
  OLD."sbuId" IS DISTINCT FROM NEW."sbuId" OR
  OLD."roleId" IS DISTINCT FROM NEW."roleId" OR
  OLD."oidcIssuer" IS DISTINCT FROM NEW."oidcIssuer" OR
  OLD."oidcSubject" IS DISTINCT FROM NEW."oidcSubject"
)
EXECUTE FUNCTION aiit_revoke_changed_identity_sessions();
COMMIT;
