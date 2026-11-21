BEGIN;
CREATE INDEX "Notification_createdAt_id_idx" ON "Notification" ("createdAt" DESC, id DESC);
CREATE INDEX "Notification_recipientId_createdAt_id_idx" ON "Notification" ("recipientId", "createdAt" DESC, id DESC);
COMMIT;
