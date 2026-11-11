import crypto from "node:crypto";
import {
  redactSensitiveData,
  validateServicePayload,
  type AIActionLog,
  type Approval,
  type CreateTicketInput,
  type KnowledgeArticle,
  type ServiceCategory,
  type Ticket,
  type TicketEvent,
  type TicketSeverity,
  type User,
} from "../../../packages/shared/src/index.ts";
import type { DeterministicMockAIOrchestrator } from "../../../packages/connectors/src/index.ts";

export function ticketNumberFor(
  slug: string,
  sequence: number,
  now: Date,
): string {
  return `${slug.includes("incident") ? "INC" : "REQ"}-${now.getUTCFullYear()}-${sequence}`;
}

/** Keep allocation and the resulting workflow in the caller's transaction. */
export function planTicketCreation(
  validInput: CreateTicketInput,
  category: Pick<
    ServiceCategory,
    | "id"
    | "slug"
    | "name"
    | "formSchema"
    | "defaultSeverity"
    | "slaResolutionMinutes"
    | "aiEligible"
    | "requiresApprovalRole"
  >,
  currentUser: Pick<User, "id" | "displayName" | "email" | "sbuId" | "sbuCode">,
  itAdmin: Pick<User, "id" | "email"> | null | undefined,
  knowledgeArticles: KnowledgeArticle[],
  aiOrchestrator: DeterministicMockAIOrchestrator,
  ticketNumber: string,
  now: Date,
) {
  const events: TicketEvent[] = [];
  const approvals: Approval[] = [];

  const slaDue = new Date(
    now.getTime() + category.slaResolutionMinutes * 60_000,
  ).toISOString();
  // Create initial ticket in NEW status
  const ticket: Ticket = {
    id: `ticket-${crypto.randomUUID()}`,
    ticketNumber,
    title: validInput.title,
    description: validInput.description,
    status: "NEW",
    severity: validInput.severity || category.defaultSeverity,
    sbuId: currentUser.sbuId,
    requesterId: currentUser.id,
    assigneeId: null,
    serviceCategoryId: category.id,
    customFormPayload: validateServicePayload(
      category.formSchema,
      validInput.customFormPayload,
    ),
    aiSummary: null,
    aiSuggestedFix: null,
    aiConfidence: null,
    escalationReason: null,
    slaDueAt: slaDue,
    resolvedAt: null,
    closedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  // Event 1: Created (NEW)
  events.push({
    id: crypto.randomUUID(),
    ticketId: ticket.id,
    actorId: currentUser.id,
    actorName: currentUser.displayName,
    eventType: "TICKET_CREATED",
    fromStatus: null,
    toStatus: "NEW",
    metadata: { ticketNumber: ticket.ticketNumber, category: category.slug },
    createdAt: now.toISOString(),
  });

  // Event 2: Triaged (NEW -> TRIAGED -> AI_HANDLING)
  ticket.status = "TRIAGED";
  events.push({
    id: crypto.randomUUID(),
    ticketId: ticket.id,
    actorId: null,
    actorName: "Automated Workflow Engine",
    eventType: "TICKET_TRIAGED",
    fromStatus: "NEW",
    toStatus: "TRIAGED",
    metadata: { slaDueAt: slaDue },
    createdAt: now.toISOString(),
  });

  ticket.status = "AI_HANDLING";
  events.push({
    id: crypto.randomUUID(),
    ticketId: ticket.id,
    actorId: null,
    actorName: "Deterministic Mock AI Orchestrator",
    eventType: "AI_HANDLING_STARTED",
    fromStatus: "TRIAGED",
    toStatus: "AI_HANDLING",
    metadata: { provider: aiOrchestrator.providerName },
    createdAt: now.toISOString(),
  });

  // Evaluate with Deterministic Mock AI & Policy Engine
  const aiDecision = aiOrchestrator.evaluateTicket({
    title: ticket.title,
    description: ticket.description,
    categorySlug: category.slug,
    sbuCode: currentUser.sbuCode,
    knowledgeBase: knowledgeArticles,
  });

  if (category.requiresApprovalRole && aiDecision.canAutoResolve) {
    aiDecision.canAutoResolve = false;
    aiDecision.escalateToIT = true;
    aiDecision.policyDecision = "REQUIRES_HUMAN_APPROVAL";
    aiDecision.escalationReason = "Service category requires human approval.";
    aiDecision.suggestedResponse =
      "Your request has been routed to IT for approval.";
  }

  // Final severity policy also controls the returned decision and execution
  // record, not only the ticket state. A low-risk suggestion cannot claim
  // autonomous resolution when requester/classifier priority requires IT.
  if (
    [ticket.severity, aiDecision.recommendedSeverity].some(
      (s) => s === "HIGH" || s === "CRITICAL",
    )
  ) {
    aiDecision.canAutoResolve = false;
    aiDecision.escalateToIT = true;
    aiDecision.escalationReason ||=
      "HIGH/CRITICAL severity requires human IT review.";
    if (aiDecision.policyDecision === "ALLOWED_LOW_RISK")
      aiDecision.policyDecision = "ESCALATE_TO_IT";
  }

  const aiLog: AIActionLog = {
    id: `ailog-${crypto.randomUUID()}`,
    ticketId: ticket.id,
    provider: aiDecision.provider,
    modelName: aiDecision.modelName,
    redactedPrompt: aiDecision.redactedPrompt,
    classification: aiDecision.classification,
    recommendedSeverity: aiDecision.recommendedSeverity,
    confidence: aiDecision.confidence,
    proposedTool: aiDecision.proposedTool,
    policyDecision: aiDecision.policyDecision,
    dryRun: aiDecision.dryRun,
    toolOutput: aiDecision.toolOutput,
    escalatedToIT: aiDecision.escalateToIT,
    createdAt: now.toISOString(),
  };

  // A requester's chosen priority may raise severity, but cannot lower a
  // critical/high severity determined by the policy-governed classifier.
  const severityRank: Record<TicketSeverity, number> = {
    LOW: 0,
    MEDIUM: 1,
    HIGH: 2,
    CRITICAL: 3,
  };
  if (
    severityRank[aiDecision.recommendedSeverity] > severityRank[ticket.severity]
  ) {
    ticket.severity = aiDecision.recommendedSeverity;
  }
  ticket.aiSummary = `Classification: ${aiDecision.classification} (${Math.round(aiDecision.confidence * 100)}% confidence) | Policy: ${aiDecision.policyDecision}`;
  ticket.aiSuggestedFix = aiDecision.suggestedResponse;
  ticket.aiConfidence = aiDecision.confidence;

  // High/critical requests always require human review, even when text resembles a low-risk FAQ.
  if (
    aiDecision.canAutoResolve &&
    category.aiEligible &&
    !category.requiresApprovalRole &&
    aiDecision.policyDecision !== "REQUIRES_HUMAN_APPROVAL" &&
    severityRank[ticket.severity] < severityRank.HIGH
  ) {
    // Transition AI_HANDLING -> RESOLVED_PENDING_CONFIRMATION
    ticket.status = "RESOLVED_PENDING_CONFIRMATION";
    ticket.resolvedAt = now.toISOString();
    events.push({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: null,
      actorName: "Deterministic Mock AI Orchestrator",
      eventType: "AI_PROPOSED_RESOLUTION",
      fromStatus: "AI_HANDLING",
      toStatus: "RESOLVED_PENDING_CONFIRMATION",
      metadata: {
        classification: aiDecision.classification,
        confidence: aiDecision.confidence,
        proposedTool: aiDecision.proposedTool,
      },
      createdAt: now.toISOString(),
    });
  } else {
    // Route to IT Administrator Queue (AI_HANDLING -> ASSIGNED_TO_IT)
    ticket.status = "ASSIGNED_TO_IT";
    ticket.assigneeId = itAdmin?.id || null;
    ticket.escalationReason =
      aiDecision.escalationReason || "Routed to IT Administrator queue.";
    events.push({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: null,
      actorName: "Deterministic Mock AI Orchestrator",
      eventType: "ASSIGNED_TO_IT_QUEUE",
      fromStatus: "AI_HANDLING",
      toStatus: "ASSIGNED_TO_IT",
      metadata: {
        reason: ticket.escalationReason,
        policyDecision: aiDecision.policyDecision,
        assignedTo: itAdmin?.email || "IT Queue",
      },
      createdAt: now.toISOString(),
    });

    // Create an approval record if category or AI policy requires human approval
    if (
      category.requiresApprovalRole ||
      aiDecision.policyDecision === "REQUIRES_HUMAN_APPROVAL"
    ) {
      const approval: Approval = {
        id: `approval-${crypto.randomUUID()}`,
        ticketId: ticket.id,
        actionType: category.slug.toUpperCase().replace(/-/g, "_"),
        requiredRole: category.requiresApprovalRole || "IT_ADMIN",
        status: "PENDING",
        requestedById: currentUser.id,
        approverId: null,
        justification: `Approval required for ${category.name}: ${ticket.title}`,
        decisionNotes: null,
        decidedAt: null,
        createdAt: now.toISOString(),
      };
      approvals.push(approval);
    }
  }

  const auditDetails = {
    ticketNumber: ticket.ticketNumber,
    resultingStatus: ticket.status,
    severity: ticket.severity,
    classifierSeverity: aiDecision.recommendedSeverity,
    aiClassification: aiDecision.classification,
  };
  const notification = {
    ticketId: ticket.id,
    recipientId: currentUser.id,
    recipientEmail: currentUser.email,
    subject: redactSensitiveData(
      `[${ticket.ticketNumber}] Ticket Received - ${ticket.title}`,
    ),
    body: redactSensitiveData(
      `Hello ${currentUser.displayName},\n\nYour ticket (${ticket.ticketNumber}) is currently in status: ${ticket.status}.\n\n${ticket.aiSuggestedFix || ""}`,
    ),
  };
  return {
    ticket,
    events,
    approvals,
    aiLog,
    aiDecision,
    auditDetails,
    notification,
  };
}

export function escalationNotification(
  ticket: Pick<Ticket, "id" | "ticketNumber" | "title">,
  actor: Pick<User, "displayName">,
  recipient: Pick<User, "id" | "email">,
  reason: string,
) {
  return {
    ticketId: ticket.id,
    recipientId: recipient.id,
    recipientEmail: recipient.email,
    subject: redactSensitiveData(
      `[CTO ESCALATION] ${ticket.ticketNumber}: ${ticket.title}`,
    ),
    body: redactSensitiveData(
      `Ticket ${ticket.ticketNumber} has been escalated to the CTO Queue by ${actor.displayName}.\nReason: ${reason}`,
    ),
  };
}
