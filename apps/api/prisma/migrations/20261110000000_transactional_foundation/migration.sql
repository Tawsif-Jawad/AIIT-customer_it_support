BEGIN;
ALTER TABLE "Ticket" ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
ALTER TABLE "Asset" ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
ALTER TABLE "Approval" ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
CREATE TABLE "NotificationJob" (
 id TEXT PRIMARY KEY, "notificationId" TEXT NOT NULL UNIQUE REFERENCES "Notification"(id),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0), "maxAttempts" INTEGER NOT NULL DEFAULT 5 CHECK ("maxAttempts" BETWEEN 1 AND 20),
 "availableAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "leaseUntil" TIMESTAMPTZ, "leaseToken" TEXT,
 state TEXT NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED','PROCESSING','SENT','FAILED')), "lastError" TEXT
);
CREATE INDEX "NotificationJob_state_availableAt_idx" ON "NotificationJob"(state,"availableAt");
CREATE FUNCTION aiit_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'APPEND_ONLY_HISTORY'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION aiit_history_guard();
CREATE TRIGGER event_append_only BEFORE UPDATE OR DELETE ON "TicketEvent" FOR EACH ROW EXECUTE FUNCTION aiit_history_guard();
CREATE TRIGGER ai_append_only BEFORE UPDATE OR DELETE ON "AIActionLog" FOR EACH ROW EXECUTE FUNCTION aiit_history_guard();
CREATE FUNCTION aiit_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status <> 'PENDING' THEN RAISE EXCEPTION 'APPROVAL_ALREADY_DECIDED'; END IF;
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'APPEND_ONLY_HISTORY'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER approval_once BEFORE UPDATE OR DELETE ON "Approval" FOR EACH ROW EXECUTE FUNCTION aiit_approval_guard();
CREATE TABLE "TicketCounter" (id TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE FUNCTION aiit_custody_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prefix jsonb;
BEGIN
 SELECT COALESCE(jsonb_agg(value ORDER BY ordinality),'[]'::jsonb) INTO prefix
 FROM jsonb_array_elements(NEW.history) WITH ORDINALITY
 WHERE ordinality <= jsonb_array_length(OLD.history);
 IF prefix <> OLD.history THEN RAISE EXCEPTION 'APPEND_ONLY_CUSTODY'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER custody_append_only BEFORE UPDATE ON "Asset" FOR EACH ROW EXECUTE FUNCTION aiit_custody_guard();
CREATE UNIQUE INDEX "User_id_sbuId_key" ON "User"(id,"sbuId");
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_requesterId_fkey";
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_requesterId_sbuId_fkey" FOREIGN KEY ("requesterId","sbuId") REFERENCES "User"(id,"sbuId") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_assignedUserId_fkey";
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_assignedUserId_sbuId_fkey" FOREIGN KEY ("assignedUserId","sbuId") REFERENCES "User"(id,"sbuId") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_sbuId_fkey" FOREIGN KEY ("sbuId") REFERENCES "SBU"(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE FUNCTION aiit_custody_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF jsonb_array_length(OLD.history)>0 THEN RAISE EXCEPTION 'APPEND_ONLY_CUSTODY'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER custody_delete_guard BEFORE DELETE ON "Asset" FOR EACH ROW EXECUTE FUNCTION aiit_custody_delete_guard();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON "AuditLog" FOR EACH STATEMENT EXECUTE FUNCTION aiit_history_guard();
CREATE TRIGGER event_no_truncate BEFORE TRUNCATE ON "TicketEvent" FOR EACH STATEMENT EXECUTE FUNCTION aiit_history_guard();
CREATE TRIGGER ai_no_truncate BEFORE TRUNCATE ON "AIActionLog" FOR EACH STATEMENT EXECUTE FUNCTION aiit_history_guard();
CREATE TRIGGER approval_no_truncate BEFORE TRUNCATE ON "Approval" FOR EACH STATEMENT EXECUTE FUNCTION aiit_history_guard();
CREATE TRIGGER custody_no_truncate BEFORE TRUNCATE ON "Asset" FOR EACH STATEMENT EXECUTE FUNCTION aiit_history_guard();
COMMIT;
