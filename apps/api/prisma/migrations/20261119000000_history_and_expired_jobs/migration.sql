CREATE INDEX "TicketEvent_ticketId_createdAt_id_idx" ON "TicketEvent"("ticketId", "createdAt", "id");
CREATE INDEX "NotificationJob_state_leaseUntil_idx" ON "NotificationJob"("state", "leaseUntil");
