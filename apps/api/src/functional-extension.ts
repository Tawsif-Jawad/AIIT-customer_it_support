import crypto from 'node:crypto';
import type { Approval, AssetStatus, Ticket } from '../../../packages/shared/src/index.ts';

export function sha256Params(params: Record<string, unknown>): string {
  const canonical = JSON.stringify(params, Object.keys(params).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function approvalParamsForAction(actionType: string, ticket: Ticket): Record<string, unknown> {
  return {
    actionType,
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    severity: ticket.severity,
  };
}

export function bindApproval(approval: Approval, params: Record<string, unknown>, now = new Date(), ttlMinutes = 60): Approval {
  return {
    ...approval,
    expiresAt: new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
    actionParams: params,
    actionParamsHash: sha256Params(params),
    consumedAt: null,
    expectedVersion: 0,
  };
}

export function calculateSlaDeadlines(categoryResponseMinutes: number, categoryResolutionMinutes: number, createdAt: Date) {
  return {
    responseDueAt: new Date(createdAt.getTime() + categoryResponseMinutes * 60_000).toISOString(),
    resolutionDueAt: new Date(createdAt.getTime() + categoryResolutionMinutes * 60_000).toISOString(),
  };
}

export function validateAssetTransition(status: AssetStatus, action: 'assign' | 'handover' | 'takeover' | 'return' | 'maintenance' | 'reassign' | 'retire'): boolean {
  const allowed: Record<typeof action, AssetStatus[]> = {
    assign: ['AVAILABLE', 'RETIRED'],
    handover: ['ASSIGNED'],
    takeover: ['ASSIGNED'],
    return: ['ASSIGNED', 'HANDOVER_PENDING_ACK', 'TAKEOVER_PENDING_ACK'],
    maintenance: ['AVAILABLE', 'ASSIGNED'],
    reassign: ['ASSIGNED', 'AVAILABLE'],
    retire: ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE'],
  };
  return allowed[action].includes(status);
}
