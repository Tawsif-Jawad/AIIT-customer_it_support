import { ValidationError, redactSensitiveData, type TicketStatus } from '../../../packages/shared/src/index.ts';

/**
 * Day 7 manual IT assignment: explicit compare-and-set, never a status transition.
 * The reviewer/CTO escalation path and privileged tool execution are unaffected.
 */
export interface AssignmentInput {
  assigneeId: string;
  expectedAssigneeId: string | null;
  expectedRevision: number;
  reason: string;
}

export function isAssignableStatus(status: TicketStatus): boolean {
  return ['ASSIGNED_TO_IT', 'IN_PROGRESS', 'AWAITING_USER'].includes(status);
}

export function validateAssignmentInput(value: unknown): AssignmentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(['Assignment body must be a JSON object.']);
  }
  const fields = value as Record<string, unknown>;
  const id = fields.assigneeId;
  const expected = fields.expectedAssigneeId;
  const revision = fields.expectedRevision;
  const reason = fields.reason;

  const validId = (input: unknown): input is string =>
    typeof input === 'string' && input.length > 0 && input.length <= 128 &&
    !/[\s\x00-\x1f\x7f]/.test(input);

  const errors: string[] = [];
  if (!validId(id)) errors.push('assigneeId must be a nonempty user identifier (max 128 characters).');
  if (!Object.prototype.hasOwnProperty.call(fields, 'expectedAssigneeId') ||
      (expected !== null && !validId(expected))) {
    errors.push('expectedAssigneeId must explicitly be null or a valid user identifier.');
  }
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    errors.push('expectedRevision must be the assignment revision from ticket detail.');
  }
  if (typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 500 || reason.includes('\0')) {
    errors.push('reason must be between 10 and 500 characters and contain no null bytes.');
  }
  if (errors.length) throw new ValidationError(errors);
  return {
    assigneeId: id as string,
    expectedAssigneeId: expected as string | null,
    expectedRevision: revision as number,
    reason: redactSensitiveData((reason as string).trim().replace(
      /\b(password|passwd|secret|token|api[_-]?key)["']?\s*[:=]\s*(?:"(?:\\[\s\S]|[^"\\])*(?:"|$)|'(?:\\[\s\S]|[^'\\])*(?:'|$))/gi,
      '$1=[REDACTED_SECRET]',
    )),
  };
}
