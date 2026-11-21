ALTER TABLE "Ticket"
  ADD COLUMN IF NOT EXISTS "slaResponseDueAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "slaResolutionDueAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "slaBreached" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "slaBreachedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "slaEscalatedAt" TIMESTAMPTZ(6);

ALTER TABLE "Approval"
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "actionParams" JSONB,
  ADD COLUMN IF NOT EXISTS "actionParamsHash" TEXT,
  ADD COLUMN IF NOT EXISTS "consumedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "expectedVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Asset"
  ADD COLUMN IF NOT EXISTS "location" TEXT,
  ADD COLUMN IF NOT EXISTS "condition" TEXT NOT NULL DEFAULT 'GOOD',
  ADD COLUMN IF NOT EXISTS "lifecycleNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "lastMaintenanceAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMPTZ(6);

CREATE TABLE IF NOT EXISTS "SlaPolicy" (
  "id" TEXT PRIMARY KEY DEFAULT (uuid_generate_v4())::text,
  "name" TEXT NOT NULL,
  "severity" "TicketSeverity" NOT NULL,
  "responseMinutes" INTEGER NOT NULL CHECK ("responseMinutes" > 0),
  "resolutionMinutes" INTEGER NOT NULL CHECK ("resolutionMinutes" > 0),
  "escalationRole" "RoleName" NOT NULL DEFAULT 'IT_ADMIN',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SlaPolicy_severity_active_key" UNIQUE ("severity", "isActive")
);

CREATE TABLE IF NOT EXISTS "SlaJob" (
  "id" TEXT PRIMARY KEY DEFAULT (uuid_generate_v4())::text,
  "ticketId" TEXT NOT NULL,
  "breachType" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMPTZ(6),
  "leaseToken" TEXT,
  "processedAt" TIMESTAMPTZ(6),
  "lastError" TEXT,
  CONSTRAINT "SlaJob_ticket_breach_key" UNIQUE ("ticketId", "breachType")
);

CREATE TABLE IF NOT EXISTS "TicketAttachment" (
  "id" TEXT PRIMARY KEY DEFAULT (uuid_generate_v4())::text,
  "ticketId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL CHECK ("sizeBytes" >= 0),
  "contentBase64" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Ticket_sla_lookup_idx" ON "Ticket" ("status", "slaBreached", "slaResolutionDueAt");
CREATE INDEX IF NOT EXISTS "SlaJob_state_available_idx" ON "SlaJob" ("state", "availableAt");
CREATE INDEX IF NOT EXISTS "SlaJob_ticketId_idx" ON "SlaJob" ("ticketId");
CREATE INDEX IF NOT EXISTS "TicketAttachment_ticket_created_idx" ON "TicketAttachment" ("ticketId", "createdAt");
