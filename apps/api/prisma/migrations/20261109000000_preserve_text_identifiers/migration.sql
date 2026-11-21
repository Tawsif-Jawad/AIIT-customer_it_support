BEGIN;
-- Additive compatibility migration: retain original UUID values as text and allow
-- prefixed legacy IDs. No data deletion, ID regeneration or reset.
DO $$
DECLARE r record; constraints jsonb := '[]'::jsonb; item jsonb;
BEGIN
  FOR r IN SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace
  LOOP
    constraints := constraints || jsonb_build_array(jsonb_build_object('tbl',r.tbl,'name',r.conname,'definition',r.definition));
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname);
  END LOOP;
  FOR r IN SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND udt_name='uuid'
      AND table_name IN ('SBU','Role','User','ServiceCategory','Ticket','TicketEvent','TicketComment','Asset','Approval','Notification','AIActionLog','AuditLog','KnowledgeArticle')
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT',r.table_name,r.column_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE TEXT USING %I::text',r.table_name,r.column_name,r.column_name);
    IF r.column_name='id' THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text',r.table_name);
    END IF;
  END LOOP;
  FOR item IN SELECT * FROM jsonb_array_elements(constraints)
  LOOP EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',item->>'tbl',item->>'name',item->>'definition'); END LOOP;
END $$;
ALTER TABLE "TicketEvent" ADD COLUMN "actorName" TEXT;
ALTER TABLE "TicketComment" ADD COLUMN "authorName" TEXT, ADD COLUMN "authorRole" "RoleName";
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"(id) ON UPDATE CASCADE;
CREATE TABLE "AuthSession" (
  id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON UPDATE CASCADE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT session_digest CHECK (id ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE INDEX "Ticket_requesterId_createdAt_idx" ON "Ticket"("requesterId","createdAt");
CREATE INDEX "Ticket_sbuId_status_slaDueAt_idx" ON "Ticket"("sbuId",status,"slaDueAt");
CREATE INDEX "Ticket_assigneeId_status_idx" ON "Ticket"("assigneeId",status);
CREATE INDEX "Approval_requiredRole_status_idx" ON "Approval"("requiredRole",status);

COMMIT;
