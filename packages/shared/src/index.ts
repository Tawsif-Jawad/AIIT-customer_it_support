/**
 * @it-support/shared
 * Shared types, RBAC policies, Ticket State Machine, and Schema Validators.
 */

export type RoleName = 'CUSTOMER' | 'EMPLOYEE' | 'IT_ADMIN' | 'CTO' | 'SYSTEM_SERVICE';

export type TicketStatus =
  | 'NEW'
  | 'TRIAGED'
  | 'AI_HANDLING'
  | 'RESOLVED_PENDING_CONFIRMATION'
  | 'CLOSED'
  | 'ASSIGNED_TO_IT'
  | 'IN_PROGRESS'
  | 'ESCALATED_TO_CTO'
  | 'REOPENED'
  | 'AWAITING_USER'
  | 'AWAITING_APPROVAL'
  | 'FAILED_RETRY';

export type TicketSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type NotificationStatus = 'QUEUED' | 'PROCESSING' | 'SENT' | 'FAILED';

export type AssetStatus =
  | 'AVAILABLE'
  | 'ASSIGNED'
  | 'HANDOVER_PENDING_ACK'
  | 'TAKEOVER_PENDING_ACK'
  | 'MAINTENANCE'
  | 'RETIRED';

export interface SBU {
  id: string;
  code: string;
  name: string;
  description: string;
  slaTier: 'STANDARD' | 'PRIORITY' | 'MISSION_CRITICAL';
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: RoleName;
  description: string;
  permissions: string[];
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  oidcSubject: string;
  oidcIssuer?: string;
  adDistinguishedName?: string;
  sbuId: string;
  roleId: string;
  roleName: RoleName;
  sbuCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceFormField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'boolean' | 'textarea';
  required: boolean;
  options?: string[];
}

export interface ServiceCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  defaultSeverity: TicketSeverity;
  aiEligible: boolean;
  requiresApprovalRole: RoleName | null;
  formSchema: ServiceFormField[];
  slaResponseMinutes: number;
  slaResolutionMinutes: number;
  createdAt: string;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: TicketStatus;
  severity: TicketSeverity;
  sbuId: string;
  requesterId: string;
  assigneeId: string | null;
  serviceCategoryId: string;
  customFormPayload: Record<string, unknown>;
  aiSummary: string | null;
  aiSuggestedFix: string | null;
  aiConfidence: number | null;
  escalationReason: string | null;
  slaDueAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketEvent {
  id: string;
  ticketId: string;
  actorId: string | null;
  actorName?: string;
  eventType: string;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  authorRole: RoleName;
  body: string;
  isInternal: boolean;
  attachments: Array<{ fileName: string; mimeType: string; sizeBytes: number }>;
  createdAt: string;
}

export interface Asset {
  id: string;
  assetTag: string;
  serialNumber: string;
  category: string;
  modelName: string;
  status: AssetStatus;
  sbuId: string;
  assignedUserId: string | null;
  handoverAckStatus: 'PENDING_EMPLOYEE_ACK' | 'ACKNOWLEDGED' | 'RETURN_REQUESTED';
  handoverNotes: string | null;
  history: Array<{ date: string; action: string; actorEmail: string; notes: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  id: string;
  ticketId: string;
  actionType: string;
  requiredRole: RoleName;
  status: ApprovalStatus;
  requestedById: string;
  approverId: string | null;
  justification: string;
  decisionNotes: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  ticketId: string | null;
  recipientId: string;
  recipientEmail: string;
  channel: 'EMAIL_AND_IN_APP' | 'IN_APP_ONLY';
  subject: string;
  body: string;
  status: NotificationStatus;
  errorDetails: string | null;
  readAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface AIActionLog {
  id: string;
  ticketId: string;
  provider: string;
  modelName: string;
  redactedPrompt: string;
  classification: string;
  recommendedSeverity: TicketSeverity;
  confidence: number;
  proposedTool: string | null;
  policyDecision: 'ALLOWED_LOW_RISK' | 'REQUIRES_HUMAN_APPROVAL' | 'BLOCKED_BY_POLICY' | 'ESCALATE_TO_IT';
  dryRun: boolean;
  toolOutput: Record<string, unknown> | null;
  escalatedToIT: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: RoleName | null;
  sbuId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  ipAddress: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface KnowledgeArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  tags: string[];
  content: string;
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Deterministic Ticket Workflow & State Machine
// ============================================================================

export const ALLOWED_TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['TRIAGED', 'ASSIGNED_TO_IT', 'AWAITING_APPROVAL', 'ESCALATED_TO_CTO'],
  TRIAGED: ['AI_HANDLING', 'ASSIGNED_TO_IT', 'AWAITING_APPROVAL', 'ESCALATED_TO_CTO'],
  AI_HANDLING: [
    'RESOLVED_PENDING_CONFIRMATION',
    'ASSIGNED_TO_IT',
    'AWAITING_APPROVAL',
    'FAILED_RETRY',
    'ESCALATED_TO_CTO',
  ],
  RESOLVED_PENDING_CONFIRMATION: ['CLOSED', 'REOPENED', 'ASSIGNED_TO_IT'],
  CLOSED: ['REOPENED'],
  ASSIGNED_TO_IT: [
    'IN_PROGRESS',
    'AWAITING_USER',
    'AWAITING_APPROVAL',
    'ESCALATED_TO_CTO',
    'RESOLVED_PENDING_CONFIRMATION',
  ],
  IN_PROGRESS: [
    'RESOLVED_PENDING_CONFIRMATION',
    'AWAITING_USER',
    'AWAITING_APPROVAL',
    'ESCALATED_TO_CTO',
    'FAILED_RETRY',
  ],
  ESCALATED_TO_CTO: [
    'IN_PROGRESS',
    'ASSIGNED_TO_IT',
    'RESOLVED_PENDING_CONFIRMATION',
    'CLOSED',
  ],
  REOPENED: ['TRIAGED', 'ASSIGNED_TO_IT', 'IN_PROGRESS', 'ESCALATED_TO_CTO'],
  AWAITING_USER: ['IN_PROGRESS', 'ASSIGNED_TO_IT', 'RESOLVED_PENDING_CONFIRMATION', 'CLOSED'],
  AWAITING_APPROVAL: ['ASSIGNED_TO_IT', 'IN_PROGRESS', 'ESCALATED_TO_CTO', 'CLOSED'],
  FAILED_RETRY: ['TRIAGED', 'AI_HANDLING', 'ASSIGNED_TO_IT', 'ESCALATED_TO_CTO'],
};

export function validateStatusTransition(
  from: TicketStatus,
  to: TicketStatus,
  actorRole: RoleName,
  isTicketOwner: boolean
): { valid: boolean; reason?: string } {
  if (from === to) {
    return { valid: false, reason: `Ticket is already in status ${from}.` };
  }

  const allowedNext = ALLOWED_TICKET_TRANSITIONS[from] || [];
  if (!allowedNext.includes(to)) {
    return {
      valid: false,
      reason: `Disallowed state transition from ${from} to ${to}. Allowed: [${allowedNext.join(', ')}]`,
    };
  }

  if (actorRole === 'SYSTEM_SERVICE' && !(['NEW', 'TRIAGED', 'AI_HANDLING', 'FAILED_RETRY'].includes(from) && ['TRIAGED', 'AI_HANDLING', 'RESOLVED_PENDING_CONFIRMATION', 'ASSIGNED_TO_IT', 'FAILED_RETRY'].includes(to))) return { valid: false, reason: 'Service transition is outside triage policy.' };
  if (to === 'CLOSED' && from !== 'RESOLVED_PENDING_CONFIRMATION') return { valid: false, reason: 'Closure requires a proposed resolution and requester confirmation.' };
  if (from === 'ESCALATED_TO_CTO' && actorRole !== 'CTO') return { valid: false, reason: 'CTO review is required for escalated cases.' };

  // Role-based transition guards
  if (actorRole === 'CUSTOMER' || actorRole === 'EMPLOYEE') {
    if (!isTicketOwner) {
      return { valid: false, reason: 'Employees/Customers may only transition their own tickets.' };
    }
    // Employees and customers can confirm or reject a resolution, not advance IT work.
    const employeeAllowedTargets: TicketStatus[] = ['CLOSED', 'REOPENED'];
    if (!employeeAllowedTargets.includes(to)) {
      return {
        valid: false,
        reason: `Role ${actorRole} cannot transition ticket to ${to}. Permitted: confirm resolution (CLOSED) or reopen (REOPENED).`,
      };
    }
  }

  if (to === 'ESCALATED_TO_CTO' && !['IT_ADMIN', 'CTO', 'SYSTEM_SERVICE'].includes(actorRole)) {
    return {
      valid: false,
      reason: 'Only IT Administrators, System SLA Policy, or the CTO may transition a ticket to ESCALATED_TO_CTO.',
    };
  }

  return { valid: true };
}

// ============================================================================
// RBAC & SBU Resource-Level Authorization Policy
// ============================================================================

export function canAccessTicket(user: User, ticket: Ticket): boolean {
  if (user.roleName === 'CTO' || user.roleName === 'IT_ADMIN' || user.roleName === 'SYSTEM_SERVICE') {
    return user.roleName !== 'SYSTEM_SERVICE';
  }
  // Customers and Employees can only view their own tickets within their SBU
  return ticket.requesterId === user.id && ticket.sbuId === user.sbuId;
}

export function canModifyTicketStatus(user: User, ticket: Ticket, targetStatus: TicketStatus): {
  allowed: boolean;
  reason?: string;
} {
  if (!canAccessTicket(user, ticket)) {
    return { allowed: false, reason: 'Access denied to ticket resource.' };
  }
  const isOwner = ticket.requesterId === user.id;
  const check = validateStatusTransition(ticket.status, targetStatus, user.roleName, isOwner);
  return { allowed: check.valid, reason: check.reason };
}

// ============================================================================
// Schema Validation Utilities (Zod-equivalent runtime schema enforcement)
// ============================================================================

export class ValidationError extends Error {
  public readonly details: string[];
  constructor(details: string[]) {
    super(`Validation failed: ${details.join('; ')}`);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export interface CreateTicketInput {
  title: string;
  description: string;
  serviceCategoryId: string;
  severity?: TicketSeverity;
  customFormPayload?: Record<string, unknown>;
}

export function validateCreateTicketInput(payload: unknown): CreateTicketInput {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError(['Request body must be a valid JSON object']);
  }
  const obj = payload as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  const description = typeof obj.description === 'string' ? obj.description.trim() : '';
  const serviceCategoryId = typeof obj.serviceCategoryId === 'string' ? obj.serviceCategoryId.trim() : '';

  if (title.length < 5 || title.length > 200) {
    errors.push('title must be between 5 and 200 characters');
  }
  if (description.length < 10 || description.length > 5000) {
    errors.push('description must be between 10 and 5000 characters');
  }
  if (!serviceCategoryId) {
    errors.push('serviceCategoryId is required');
  }

  const validSeverities: TicketSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  let severity: TicketSeverity | undefined;
  if (obj.severity !== undefined) {
    if (typeof obj.severity !== 'string' || !validSeverities.includes(obj.severity as TicketSeverity)) {
      errors.push('severity must be one of LOW, MEDIUM, HIGH, CRITICAL');
    } else {
      severity = obj.severity as TicketSeverity;
    }
  }

  let customFormPayload: Record<string, unknown> = {};
  if (obj.customFormPayload !== undefined) {
    if (typeof obj.customFormPayload !== 'object' || obj.customFormPayload === null || Array.isArray(obj.customFormPayload)) {
      errors.push('customFormPayload must be a key-value object');
    } else {
      customFormPayload = obj.customFormPayload as Record<string, unknown>;
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  return { title, description, serviceCategoryId, severity, customFormPayload };
}

export function redactSensitiveData(input: string): string {
  return input
    .replace(/(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=[REDACTED_SECRET]')
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, '[REDACTED_CARD]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]');
}

/** Shared escalation input policy for both HTTP routes and PostgreSQL. */
export function validateEscalationReason(value: unknown): string {
  if (typeof value !== 'string' || value.replace(/\s/g, '').length < 5 || value.length > 2000) {
    throw new ValidationError(['Escalation reason requires at least five non-whitespace characters (maximum 2000).']);
  }
  return redactSensitiveData(value.trim());
}

/** Existing single-recipient routing. An absent or ambiguous recipient blocks escalation. */
export function selectEscalationRecipient<T extends Pick<User, 'roleName' | 'isActive'>>(users: readonly T[]): T | undefined {
  const eligible = users.filter(user => user.isActive && user.roleName === 'CTO');
  return eligible.length === 1 ? eligible[0] : undefined;
}

/** Validate the current catalog contract for new submissions only. */
export function validateServicePayload(fields: ServiceFormField[], payload: Record<string, unknown> = {}): Record<string, unknown> {
  const errors: string[] = [];
  const values: [string, string | boolean][] = [];
  const keys = new Set(fields.map(field => field.key));
  if (Object.keys(payload).some(key => !keys.has(key))) errors.push('Unexpected service form field.');
  for (const field of fields) {
    const raw = Object.hasOwn(payload, field.key) ? payload[field.key] : undefined;
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (value === undefined || value === '') {
      if (field.required) errors.push(`${field.label} is required.`);
      continue;
    }
    if (field.type === 'boolean') {
      if (typeof value === 'boolean') values.push([field.key, value]);
      else errors.push(`${field.label} must be Yes or No.`);
      continue;
    }
    if (typeof value !== 'string' || value.length > 5000) {
      errors.push(`${field.label} must be text up to 5000 characters.`);
      continue;
    }
    if (field.type === 'select' && !field.options?.includes(value)) {
      errors.push(`Choose a valid option for ${field.label}.`);
      continue;
    }
    if (field.key === 'managerEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push(`${field.label} must be a valid email address.`);
      continue;
    }
    if (field.key === 'desiredEmailPrefix' && !/^[a-z0-9]+(?:[._+-][a-z0-9]+)*$/i.test(value)) {
      errors.push(`${field.label} must be a mailbox prefix, without a domain.`);
      continue;
    }
    values.push([field.key, value]);
  }
  if (errors.length) throw new ValidationError(errors);
  return Object.fromEntries(values);
}

/** Largest sequence representable by the existing PostgreSQL ticket counter. */
export const MAX_TICKET_SEQUENCE = 2_147_483_647;
