import { createInitialSeedState, validateDatabaseState } from '../../apps/api/src/store.ts';
import { approvalParamsForAction, bindApproval } from '../../apps/api/src/functional-extension.ts';
import type { Asset, RoleName, Ticket, User } from '../../packages/shared/src/index.ts';

const epoch = '2026-01-12T09:00:00.000Z';
const units = ['Alder', 'Birch', 'Cedar', 'Elm', 'Maple', 'Willow'];
const given = ['Avery', 'Blair', 'Cameron', 'Dana', 'Ellis', 'Finley', 'Harper', 'Jules', 'Morgan', 'Riley'];
const family = ['Brook', 'Dale', 'Field', 'Grove', 'Hale', 'Lake', 'Marsh', 'Reed', 'Vale', 'Wells', 'Wood', 'Wren'];
const categories = ['Laptop', 'Desktop', 'Monitor', 'Printer', 'Router', 'Access Point', 'Peripheral'];
const states = ['ASSIGNED_TO_IT', 'IN_PROGRESS', 'CLOSED', 'RESOLVED_PENDING_CONFIRMATION'] satisfies Ticket['status'][];
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] satisfies Ticket['severity'][];

export function officeDataset(issuer?: string) {
  const defaults = createInitialSeedState();
  const sbus = units.map((name, i) => ({
    id: 'office-sbu-' + i, name: name + ' Division', code: 'OFFICE-' + name.toUpperCase(),
    description: name + ' building and operations', slaTier: 'STANDARD' as const, createdAt: epoch, updatedAt: epoch,
  }));
  const roles = defaults.roles.map(role => ({ ...role, createdAt: epoch }));
  const profiles = Array.from({ length: 129 }, (_, i) => {
    const roleName: RoleName = i < 120 ? 'EMPLOYEE' : i < 128 ? 'IT_ADMIN' : 'CTO';
    const sbu = sbus[i % sbus.length];
    const employeeNumber = 'FIC-' + String(i + 1).padStart(3, '0');
    const handle = i < 120 ? 'employee' + (i + 1) : i < 128 ? 'it' + (i - 119) : 'cto';
    const department = roleName === 'EMPLOYEE' ? ['Operations', 'Finance', 'Research'][Math.floor(i / 6) % 3] : 'Technology';
    const ou = 'OU=' + sbu.code + ',OU=Staff,DC=office,DC=example,DC=test';
    const user: User = {
      id: employeeNumber, displayName: i < 120 ? given[i % 10] + ' ' + family[Math.floor(i / 10)] : 'Synthetic ' + handle.toUpperCase(),
      email: handle + '@example.test', oidcSubject: 'office-' + employeeNumber, ...(issuer ? { oidcIssuer: issuer } : {}),
      adDistinguishedName: 'CN=' + employeeNumber + ',' + ou, roleName, roleId: roles.find(role => role.name === roleName)!.id,
      sbuId: sbu.id, sbuCode: sbu.code, isActive: i < 117 || i >= 120, createdAt: epoch, updatedAt: epoch,
    };
    return { user, employeeNumber, ou, department, responsibilities: roleName === 'EMPLOYEE' ? department + ' staff' : 'IT support and governance', location: sbu.name, groups: [sbu.code, 'ROLE-' + roleName] };
  });
  const users = profiles.map(profile => profile.user);
  const serviceCategories = defaults.serviceCategories.map(category => ({ ...category, createdAt: epoch }));
  const assets: Asset[] = Array.from({ length: 180 }, (_, i) => ({
    id: 'office-asset-' + i, assetTag: 'FIC-ASSET-' + i, serialNumber: 'FIC-SERIAL-' + i,
    category: categories[i % categories.length], modelName: 'Fictional Series ' + (i % 12 + 1),
    status: i < 90 ? 'ASSIGNED' : 'AVAILABLE', assignedUserId: i < 90 ? users[i].id : null,
    sbuId: sbus[i % 6].id, location: sbus[i % 6].name, condition: 'GOOD',
    handoverAckStatus: i < 90 ? 'ACKNOWLEDGED' : 'PENDING_EMPLOYEE_ACK',
    handoverNotes: null, history: [], createdAt: epoch, updatedAt: epoch,
  }));
  const tickets: Ticket[] = Array.from({ length: 240 }, (_, i) => {
    const user = users[i % 120];
    const category = i < 40 ? serviceCategories.find(item => item.id === 'cat-ad-account')! : serviceCategories[i % 2];
    const status = i < 40 ? 'ASSIGNED_TO_IT' : states[Math.floor(i / 3) % states.length];
    const due = i % 5 === 0 ? '2026-01-12T10:00:00.000Z' : '2099-01-12T10:00:00.000Z';
    return {
      id: 'office-ticket-' + i, ticketNumber: 'FIC-2026-' + (1001 + i), title: category.name + ' request ' + (i + 1),
      description: 'Synthetic history from ' + user.sbuCode, status, severity: priorities[i % 4],
      sbuId: user.sbuId, requesterId: user.id, assigneeId: users[120 + i % 8].id,
      serviceCategoryId: category.id, customFormPayload: {}, aiSummary: null, aiSuggestedFix: null,
      aiConfidence: null, escalationReason: null, slaDueAt: due, slaResolutionDueAt: due,
      // Historical breached fixtures are terminal for the scheduler. Seed import has no mail side effects.
      slaBreached: i % 5 === 0, resolvedAt: status === 'CLOSED' || status === 'RESOLVED_PENDING_CONFIRMATION' ? epoch : null,
      closedAt: status === 'CLOSED' ? epoch : null, createdAt: epoch, updatedAt: epoch,
    };
  });
  const approvals = tickets.slice(0, 40).map((ticket, i) => {
    const actionType = 'AD_ACCOUNT_REQUEST';
    return bindApproval({
      id: 'office-approval-' + i, actionType, ticketId: ticket.id, requiredRole: i % 4 === 0 ? 'CTO' : 'IT_ADMIN',
      status: 'PENDING', requestedById: ticket.requesterId, approverId: null, justification: 'Synthetic directory request',
      decisionNotes: null, decidedAt: null, createdAt: epoch,
    }, approvalParamsForAction(actionType, ticket), new Date(i % 4 === 0 ? epoch : '2099-01-12T09:00:00.000Z'));
  });
  const snapshot = {
    ...defaults, sbus, roles, users, serviceCategories, assets, tickets, approvals,
    ticketEvents: tickets.map(ticket => ({
      id: ticket.id + '-history', ticketId: ticket.id, actorId: ticket.requesterId, eventType: 'TICKET_CREATED',
      fromStatus: null, toStatus: ticket.status, metadata: { synthetic: true }, createdAt: epoch,
    })),
    ticketComments: [], ticketAttachments: [], notifications: [], aiActionLogs: [], auditLogs: [],
    knowledgeArticles: [], authSessions: [], ticketNumberHighWatermark: 1240,
  };
  validateDatabaseState(snapshot);
  return { snapshot, profiles };
}
