BEGIN;
INSERT INTO "TicketCounter" (id, value)
SELECT 'tickets', LEAST(2147483647, GREATEST(1000, MAX(substring("ticketNumber" from '-([0-9]+)$')::numeric)))::int
FROM "Ticket"
ON CONFLICT (id) DO UPDATE SET value = GREATEST("TicketCounter".value, EXCLUDED.value);

CREATE FUNCTION aiit_advance_ticket_floor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE suffix numeric;
BEGIN
  suffix := substring(NEW."ticketNumber" from '-([0-9]+)$')::numeric;
  IF suffix IS NOT NULL THEN
    INSERT INTO "TicketCounter" (id, value) VALUES ('tickets', LEAST(2147483647, GREATEST(1000, suffix))::int)
    ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value
    WHERE "TicketCounter".value < EXCLUDED.value;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER advance_ticket_floor AFTER INSERT OR UPDATE OF "ticketNumber" ON "Ticket"
FOR EACH ROW EXECUTE FUNCTION aiit_advance_ticket_floor();

CREATE INDEX "Ticket_createdAt_id_idx" ON "Ticket" ("createdAt" DESC, id DESC);
COMMIT;
