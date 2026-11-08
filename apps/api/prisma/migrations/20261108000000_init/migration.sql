-- Milestone 1 Initial Migration: Enterprise Multi-SBU IT Support System
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE "RoleName" AS ENUM ('CUSTOMER', 'EMPLOYEE', 'IT_ADMIN', 'CTO', 'SYSTEM_SERVICE');
CREATE TYPE "TicketStatus" AS ENUM (
  'NEW',
  'TRIAGED',
  'AI_HANDLING',
  'RESOLVED_PENDING_CONFIRMATION',
  'CLOSED',
  'ASSIGNED_TO_IT',
  'IN_PROGRESS',
  'ESCALATED_TO_CTO',
  'REOPENED',
  'AWAITING_USER',
  'AWAITING_APPROVAL',
  'FAILED_RETRY'
);
CREATE TYPE "TicketSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED');
CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'HANDOVER_PENDING_ACK', 'TAKEOVER_PENDING_ACK', 'MAINTENANCE', 'RETIRED');

CREATE TABLE "SBU" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "slaTier" TEXT NOT NULL DEFAULT 'STANDARD',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "Role" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "name" "RoleName" NOT NULL UNIQUE,
  "description" TEXT NOT NULL,
  "permissions" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "User" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "email" TEXT NOT NULL UNIQUE,
  "displayName" TEXT NOT NULL,
  "oidcSubject" TEXT UNIQUE,
  "adDistinguishedName" TEXT,
  "sbuId" UUID NOT NULL REFERENCES "SBU"("id"),
  "roleId" UUID NOT NULL REFERENCES "Role"("id"),
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "ServiceCategory" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "slug" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "defaultSeverity" "TicketSeverity" NOT NULL DEFAULT 'LOW',
  "aiEligible" BOOLEAN NOT NULL DEFAULT TRUE,
  "requiresApprovalRole" "RoleName",
  "formSchema" JSONB NOT NULL,
  "slaResponseMinutes" INTEGER NOT NULL DEFAULT 60,
  "slaResolutionMinutes" INTEGER NOT NULL DEFAULT 480,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "Ticket" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "ticketNumber" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
  "severity" "TicketSeverity" NOT NULL DEFAULT 'LOW',
  "sbuId" UUID NOT NULL REFERENCES "SBU"("id"),
  "requesterId" UUID NOT NULL REFERENCES "User"("id"),
  "assigneeId" UUID REFERENCES "User"("id"),
  "serviceCategoryId" UUID NOT NULL REFERENCES "ServiceCategory"("id"),
  "customFormPayload" JSONB,
  "aiSummary" TEXT,
  "aiSuggestedFix" TEXT,
  "aiConfidence" DOUBLE PRECISION,
  "escalationReason" TEXT,
  "slaDueAt" TIMESTAMPTZ NOT NULL,
  "resolvedAt" TIMESTAMPTZ,
  "closedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "TicketEvent" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "ticketId" UUID NOT NULL REFERENCES "Ticket"("id") ON DELETE CASCADE,
  "actorId" UUID,
  "eventType" TEXT NOT NULL,
  "fromStatus" "TicketStatus",
  "toStatus" "TicketStatus",
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "TicketComment" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "ticketId" UUID NOT NULL REFERENCES "Ticket"("id") ON DELETE CASCADE,
  "authorId" UUID NOT NULL REFERENCES "User"("id"),
  "body" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT FALSE,
  "attachments" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "Asset" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "assetTag" TEXT NOT NULL UNIQUE,
  "serialNumber" TEXT NOT NULL UNIQUE,
  "category" TEXT NOT NULL,
  "modelName" TEXT NOT NULL,
  "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
  "sbuId" UUID NOT NULL REFERENCES "SBU"("id"),
  "assignedUserId" UUID REFERENCES "User"("id"),
  "handoverAckStatus" TEXT NOT NULL DEFAULT 'ACKNOWLEDGED',
  "handoverNotes" TEXT,
  "history" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "Approval" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "ticketId" UUID NOT NULL REFERENCES "Ticket"("id") ON DELETE CASCADE,
  "actionType" TEXT NOT NULL,
  "requiredRole" "RoleName" NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" UUID NOT NULL,
  "approverId" UUID REFERENCES "User"("id"),
  "justification" TEXT NOT NULL,
  "decisionNotes" TEXT,
  "decidedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "Notification" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "ticketId" UUID REFERENCES "Ticket"("id") ON DELETE SET NULL,
  "recipientId" UUID NOT NULL REFERENCES "User"("id"),
  "recipientEmail" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'EMAIL_AND_IN_APP',
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
  "errorDetails" TEXT,
  "readAt" TIMESTAMPTZ,
  "sentAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "AIActionLog" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "ticketId" UUID NOT NULL REFERENCES "Ticket"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL,
  "modelName" TEXT NOT NULL,
  "redactedPrompt" TEXT NOT NULL,
  "classification" TEXT NOT NULL,
  "recommendedSeverity" "TicketSeverity" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "proposedTool" TEXT,
  "policyDecision" TEXT NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT TRUE,
  "toolOutput" JSONB,
  "escalatedToIT" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "AuditLog" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "actorId" UUID REFERENCES "User"("id") ON DELETE SET NULL,
  "actorEmail" TEXT,
  "actorRole" TEXT,
  "sbuId" UUID,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "resourceId" TEXT,
  "ipAddress" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "KnowledgeArticle" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT '{}',
  "content" TEXT NOT NULL,
  "isApproved" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
