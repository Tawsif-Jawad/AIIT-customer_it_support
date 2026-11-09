/**
 * Enterprise Repository & Persistence Store
 * Provides development-only atomic JSON-file persistence. PostgreSQL is not connected.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateRecordSchemas} from './persistence-schema.ts';
import type {
  AIActionLog,
  Approval,
  Asset,
  AuditLog,
  KnowledgeArticle,
  Notification,
  Role,
  SBU,
  ServiceCategory,
  Ticket,
  TicketComment,
  TicketEvent,
  User,
} from '../../../packages/shared/src/index.ts';

export interface DatabaseState {
  authSessions?: { id: string; userId: string; expiresAt: number }[];
  sbus: SBU[];
  roles: Role[];
  users: User[];
  serviceCategories: ServiceCategory[];
  tickets: Ticket[];
  ticketEvents: TicketEvent[];
  ticketComments: TicketComment[];
  assets: Asset[];
  approvals: Approval[];
  notifications: Notification[];
  aiActionLogs: AIActionLog[];
  auditLogs: AuditLog[];
  knowledgeArticles: KnowledgeArticle[];
}

/** Local JSON containment only: exclusive transaction lease + stale-snapshot rejection.
 * A crashed writer leaves a lease; recovery requires operator inspection, never auto-stealing.
 */
export class EnterpriseDataStore {
  private state: DatabaseState;
  private readonly filePath: string;
  private baseline = '';
  private baselineCanonical = '';
  private transactionActive = false;
  private simulateDatabaseOutage = false;

  constructor(customFilePath?: string) {
    this.filePath = path.resolve(customFilePath || path.join(process.cwd(), '.data', 'enterprise-db.json'));
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      const release = this.acquire();
      try {
        if (!fs.existsSync(this.filePath)) this.replace(createInitialSeedState());
      } finally { release(); }
    }
    this.state = this.read();
  }
  private acquire(): () => void {
    const lock = this.filePath + '.lock';
    let fd: number;
    try { fd = fs.openSync(lock, 'wx', 0o600); }
    catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('PERSISTENCE_BUSY: Another writer or an unrecovered writer lease exists.');
      throw err;
    }
    try { fs.writeFileSync(fd, JSON.stringify({pid: process.pid, createdAt: new Date().toISOString()})); }
    catch (err) { fs.closeSync(fd); fs.unlinkSync(lock); throw err; }
    return () => { fs.closeSync(fd); fs.unlinkSync(lock); };
  }
  private read(): DatabaseState {
    const raw = fs.readFileSync(this.filePath, 'utf8');
    let state: DatabaseState;
    try { state = JSON.parse(raw); }
    catch { throw new Error('PERSISTENCE_CORRUPT: Restore a verified backup; existing file is untouched.'); }
    validateDatabaseState(state);
    this.baseline = raw;
    this.baselineCanonical = JSON.stringify(state, null, 2);
    return state;
  }
  private replace(state: DatabaseState) {
    validateDatabaseState(state);
    const raw = JSON.stringify(state, null, 2);
    if (raw === this.baselineCanonical) return; // no mutation: no fsync/rename
    const temp = this.filePath + '.' + crypto.randomUUID() + '.tmp';
    let fd: number | undefined;
    try {
      fd = fs.openSync(temp, 'wx', 0o600);
      fs.writeFileSync(fd, raw); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      fs.renameSync(temp, this.filePath);
      this.baseline = raw;
      this.baselineCanonical = raw;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }
  public setSimulateDatabaseOutage(outage: boolean) { this.simulateDatabaseOutage = outage; }
  public isHealthy(): boolean { return !this.simulateDatabaseOutage; }
  public resetAndSeed(): DatabaseState {
    throw new Error('RESET_DISABLED: Existing datasets must never be reset by the seed command. Use a new disposable path.');
  }
  public persist(): void {
    if (this.simulateDatabaseOutage) throw new Error('DATABASE_UNAVAILABLE: Persistence unavailable.');
    if (this.transactionActive) { validateDatabaseState(this.state); return; }
    const release = this.acquire();
    try {
      validateDatabaseState(this.state);
      if (fs.readFileSync(this.filePath, 'utf8') !== this.baseline) throw new Error('PERSISTENCE_CONFLICT: Stale snapshot; reload and retry the whole operation.');
      this.replace(this.state);
    } catch (err) { this.state = this.read(); throw err; }
    finally { release(); }
  }
  /** Caller must buffer success until this resolves. False discards every mutation. */
  public async transaction(operation: () => Promise<boolean>): Promise<void> {
    if (this.simulateDatabaseOutage) throw new Error('DATABASE_UNAVAILABLE: Persistence unavailable.');
    const release = this.acquire();
    try {
      this.state = this.read();
      this.transactionActive = true;
      if (await operation()) this.replace(this.state);
      else this.state = this.read();
    } catch (err) { this.state = this.read(); throw err; }
    finally { this.transactionActive = false; release(); }
  }
  public getState(): DatabaseState {
    if (this.simulateDatabaseOutage) throw new Error('DATABASE_UNAVAILABLE: Persistence unavailable.');
    return this.state;
  }
}

export function validateDatabaseState(state: DatabaseState): void {
  validateRecordSchemas(state);
  const collections = ['sbus','roles','users','serviceCategories','tickets','ticketEvents','ticketComments','assets','approvals','notifications','aiActionLogs','auditLogs','knowledgeArticles'] as const;
  for (const name of collections) {
    if (!state || !Array.isArray(state[name])) throw new Error('PERSISTENCE_INVALID: Missing collection ' + name);
    const ids = new Set<string>();
    for (const row of state[name]) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new Error('PERSISTENCE_INVALID: Invalid or duplicate ID in ' + name);
      ids.add(row.id);
    }
  }
  const has = (name: Exclude<keyof DatabaseState, 'authSessions'>, id: string) => state[name].some(row => row.id === id);
  for (const user of state.users) {
    if (!has('sbus', user.sbuId) || !has('roles', user.roleId) || !state.roles.some(r => r.id === user.roleId && r.name === user.roleName)) throw new Error('PERSISTENCE_INVALID: Invalid user scope/role');
  }
  const numbers = new Set<string>();
  for (const ticket of state.tickets) {
    if (!has('users', ticket.requesterId) || !has('sbus', ticket.sbuId) || !has('serviceCategories', ticket.serviceCategoryId) || typeof ticket.title !== 'string' || !ticket.title || numbers.has(ticket.ticketNumber)) throw new Error('PERSISTENCE_INVALID: Invalid ticket reference or number');
    numbers.add(ticket.ticketNumber);
  }
  for (const name of ['ticketEvents','ticketComments','approvals','aiActionLogs','notifications'] as const)
    for (const row of state[name]) if (row.ticketId && !has('tickets', row.ticketId)) throw new Error('PERSISTENCE_INVALID: Broken ticket reference in ' + name);
  if(new Set((state.authSessions || []).map(s=>s.id)).size!==(state.authSessions || []).length) throw new Error('PERSISTENCE_INVALID: Duplicate session ID');
  const references: [keyof DatabaseState,string,keyof DatabaseState][] = [
    ['tickets','assigneeId','users'],['ticketEvents','actorId','users'],['ticketComments','authorId','users'],
    ['assets','sbuId','sbus'],['assets','assignedUserId','users'],['approvals','requestedById','users'],['approvals','approverId','users'],
    ['notifications','recipientId','users'],['auditLogs','actorId','users'],['auditLogs','sbuId','sbus'],['authSessions','userId','users'],
  ];
  for(const [source,field,target] of references) for(const row of state[source] || []) {
    const id=(row as unknown as Record<string,unknown>)[field];
    if(id!==null&&id!==undefined&&!(state[target] || []).some(r=>r.id===id)) throw new Error('PERSISTENCE_INVALID: Orphaned '+source+'.'+field);
  }
  for(const [collection,field] of [['users','email'],['sbus','code'],['roles','name'],['serviceCategories','slug'],['assets','assetTag'],['assets','serialNumber'],['knowledgeArticles','slug']] as const) {
    const values=state[collection].map(row=>String((row as unknown as Record<string,unknown>)[field]).toLowerCase());
    if(new Set(values).size!==values.length) throw new Error('PERSISTENCE_INVALID: Duplicate '+collection+'.'+field);
  }
  for(const user of state.users) if(!state.sbus.some(s=>s.id===user.sbuId&&s.code===user.sbuCode)) throw new Error('PERSISTENCE_INVALID: Inconsistent SBU mapping');

}

export function createInitialSeedState(): DatabaseState {
  const now = new Date().toISOString();
  const sbus: SBU[] = [
    {
      id: 'sbu-tech-001',
      code: 'SBU-TECH',
      name: 'Enterprise Technology & Cloud Services',
      description: 'Core engineering, cloud platform, and digital product unit',
      slaTier: 'MISSION_CRITICAL',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'sbu-fin-002',
      code: 'SBU-FIN',
      name: 'FinTech & Digital Payment Operations',
      description: 'Financial operations, payment switching, and compliance unit',
      slaTier: 'PRIORITY',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'sbu-corp-003',
      code: 'SBU-CORP',
      name: 'Corporate Shared Services & HR',
      description: 'Headquarters operations, administration, and client services',
      slaTier: 'STANDARD',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const roles: Role[] = [
    {
      id: 'role-customer',
      name: 'CUSTOMER',
      description: 'Authorized SBU Customer submitting scoped service requests',
      permissions: ['ticket:create', 'ticket:read:own', 'ticket:comment:own', 'kb:read'],
      createdAt: now,
    },
    {
      id: 'role-employee',
      name: 'EMPLOYEE',
      description: 'Internal SBU Employee managing own tickets and assigned IT equipment',
      permissions: [
        'ticket:create',
        'ticket:read:own',
        'ticket:update:own',
        'ticket:confirm:own',
        'asset:read:own',
        'asset:acknowledge:own',
        'kb:read',
      ],
      createdAt: now,
    },
    {
      id: 'role-it-admin',
      name: 'IT_ADMIN',
      description: 'IT Administrator managing queues, assets, approvals, and CTO escalations',
      permissions: [
        'ticket:read:all',
        'ticket:update:all',
        'ticket:assign',
        'ticket:escalate:cto',
        'approval:decide:it',
        'asset:manage:all',
        'ad:lookup',
        'kb:manage',
      ],
      createdAt: now,
    },
    {
      id: 'role-cto',
      name: 'CTO',
      description: 'Chief Technology Officer overseeing cross-SBU metrics, critical approvals, and escalations',
      permissions: [
        'ticket:read:all',
        'ticket:update:all',
        'ticket:resolve:escalated',
        'approval:decide:cto',
        'audit:read:all',
        'analytics:read:all',
      ],
      createdAt: now,
    },
    {
      id: 'role-system',
      name: 'SYSTEM_SERVICE',
      description: 'Narrowly scoped background worker & SLA policy service identity',
      permissions: ['queue:process', 'sla:escalate'],
      createdAt: now,
    },
  ];

  const users: User[] = [
    {
      id: 'user-emp-tawsif',
      email: 'tawsif.zawad@upstra.com',
      displayName: 'Tawsif Zawad (SBU-TECH Employee)',
      oidcSubject: 'kc-sub-tawsif-zawad',
      adDistinguishedName: 'CN=Tawsif Zawad,OU=SBU-TECH,DC=directory,DC=local',
      sbuId: 'sbu-tech-001',
      sbuCode: 'SBU-TECH',
      roleId: 'role-employee',
      roleName: 'EMPLOYEE',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'user-emp-nadia',
      email: 'nadia.islam@upstra.local',
      displayName: 'Nadia Islam (SBU-FIN Employee)',
      oidcSubject: 'kc-sub-nadia-islam',
      adDistinguishedName: 'CN=Nadia Islam,OU=SBU-FIN,DC=directory,DC=local',
      sbuId: 'sbu-fin-002',
      sbuCode: 'SBU-FIN',
      roleId: 'role-employee',
      roleName: 'EMPLOYEE',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'user-cust-rahim',
      email: 'rahim.chowdhury@client.upstra.local',
      displayName: 'Rahim Chowdhury (SBU-FIN Customer)',
      oidcSubject: 'kc-sub-rahim-customer',
      sbuId: 'sbu-fin-002',
      sbuCode: 'SBU-FIN',
      roleId: 'role-customer',
      roleName: 'CUSTOMER',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'user-it-kamal',
      email: 'kamal.hossain@upstra.local',
      displayName: 'Kamal Hossain (Lead IT Administrator)',
      oidcSubject: 'kc-sub-kamal-itadmin',
      adDistinguishedName: 'CN=Kamal Hossain,OU=IT-Admins,DC=directory,DC=local',
      sbuId: 'sbu-corp-003',
      sbuCode: 'SBU-CORP',
      roleId: 'role-it-admin',
      roleName: 'IT_ADMIN',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'user-cto-farhana',
      email: 'farhana.ahmed@upstra.local',
      displayName: 'Farhana Ahmed (Chief Technology Officer)',
      oidcSubject: 'kc-sub-farhana-cto',
      adDistinguishedName: 'CN=Farhana Ahmed,OU=Executive,DC=directory,DC=local',
      sbuId: 'sbu-corp-003',
      sbuCode: 'SBU-CORP',
      roleId: 'role-cto',
      roleName: 'CTO',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const serviceCategories: ServiceCategory[] = [
    {
      id: 'cat-outlook-config',
      slug: 'outlook-configuration',
      name: 'Outlook & Mail Client Configuration',
      description: 'Setup guidance, TLS/IMAP profile configuration, and calendar sync troubleshooting',
      defaultSeverity: 'LOW',
      aiEligible: true,
      requiresApprovalRole: null,
      formSchema: [
        { key: 'osPlatform', label: 'Operating System', type: 'select', required: true, options: ['Windows 11', 'macOS', 'iOS/Android'] },
        { key: 'outlookVersion', label: 'Outlook Version', type: 'text', required: false },
      ],
      slaResponseMinutes: 30,
      slaResolutionMinutes: 240,
      createdAt: now,
    },
    {
      id: 'cat-internet-conn',
      slug: 'internet-connectivity',
      name: 'Internet, Wi-Fi & VPN Connectivity',
      description: 'Office Wi-Fi dropouts, DNS resolution issues, SBU VLAN routing, and VPN access',
      defaultSeverity: 'LOW',
      aiEligible: true,
      requiresApprovalRole: null,
      formSchema: [
        { key: 'connectionType', label: 'Connection Type', type: 'select', required: true, options: ['Corporate Wi-Fi', 'Wired Ethernet', 'Remote VPN'] },
        { key: 'floorLocation', label: 'Floor / Desk Location', type: 'text', required: true },
      ],
      slaResponseMinutes: 30,
      slaResolutionMinutes: 180,
      createdAt: now,
    },
    {
      id: 'cat-equipment-handover',
      slug: 'equipment-handover',
      name: 'IT Equipment Handover / Takeover',
      description: 'Request new laptop/monitor assignment, return equipment, or acknowledge asset custody',
      defaultSeverity: 'MEDIUM',
      aiEligible: false,
      requiresApprovalRole: 'IT_ADMIN',
      formSchema: [
        { key: 'handoverType', label: 'Transaction Type', type: 'select', required: true, options: ['New Handover', 'Equipment Return / Takeover', 'Replacement'] },
        { key: 'equipmentType', label: 'Equipment Category', type: 'select', required: true, options: ['Laptop', 'Monitor', 'Docking Station', 'Security Key'] },
      ],
      slaResponseMinutes: 120,
      slaResolutionMinutes: 1440,
      createdAt: now,
    },
    {
      id: 'cat-email-provisioning',
      slug: 'email-provisioning',
      name: 'Official Self-Hosted Email Account Request',
      description: 'Provision a new SBU mailbox or alias on the self-hosted corporate email server (Requires IT Approval)',
      defaultSeverity: 'MEDIUM',
      aiEligible: false,
      requiresApprovalRole: 'IT_ADMIN',
      formSchema: [
        { key: 'desiredEmailPrefix', label: 'Desired Email Prefix', type: 'text', required: true },
        { key: 'managerEmail', label: 'Approving Manager Email', type: 'text', required: true },
      ],
      slaResponseMinutes: 60,
      slaResolutionMinutes: 480,
      createdAt: now,
    },
    {
      id: 'cat-ad-account',
      slug: 'ad-account-request',
      name: 'Active Directory Account & Permission Request',
      description: 'On-premises AD security group membership, account unlock, or role elevation (Approval Gated)',
      defaultSeverity: 'MEDIUM',
      aiEligible: false,
      requiresApprovalRole: 'IT_ADMIN',
      formSchema: [
        { key: 'targetAdGroup', label: 'Target AD Security Group / Resource', type: 'text', required: true },
        { key: 'businessJustification', label: 'Business Justification', type: 'textarea', required: true },
      ],
      slaResponseMinutes: 60,
      slaResolutionMinutes: 480,
      createdAt: now,
    },
    {
      id: 'cat-hardware-incident',
      slug: 'hardware-incident',
      name: 'Critical Hardware / Infrastructure Incident',
      description: 'Server degradation, SBU network switch failure, or workstation hardware fault',
      defaultSeverity: 'HIGH',
      aiEligible: false,
      requiresApprovalRole: 'CTO',
      formSchema: [
        { key: 'impactedSystems', label: 'Impacted Systems / Asset Tag', type: 'text', required: true },
        { key: 'sbuWideImpact', label: 'Affects Entire SBU?', type: 'boolean', required: true },
      ],
      slaResponseMinutes: 15,
      slaResolutionMinutes: 120,
      createdAt: now,
    },
  ];

  const knowledgeArticles: KnowledgeArticle[] = [
    {
      id: 'kb-001',
      slug: 'outlook-self-hosted-tls-setup',
      title: 'Configuring Microsoft Outlook for Self-Hosted Corporate Mail with TLS',
      category: 'outlook-configuration',
      tags: ['outlook', 'imap', 'smtp', 'tls', 'email', 'autodiscover'],
      content:
        '1. Launch Microsoft Outlook and navigate to File > Account Settings > Manage Profiles.\n2. Choose Manual setup or additional server types > POP or IMAP.\n3. Enter your full corporate email address (e.g., firstname.lastname@upstra.com) and the verified SBU mail server hostname provided in your onboarding sheet.\n4. Under More Settings > Advanced, set Incoming Server (IMAP) to require SSL/TLS (Port 993) and Outgoing Server (SMTP) to STARTTLS (Port 587).\n5. Never disable certificate verification.',
      isApproved: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'kb-002',
      slug: 'sbu-wifi-dns-troubleshooting',
      title: 'Resolving SBU Office Wi-Fi & Internal DNS Connectivity Drops',
      category: 'internet-connectivity',
      tags: ['wifi', 'wi-fi', 'dns', 'internet', 'network', 'vpn'],
      content:
        '1. Verify you are connected to the 802.1X enterprise SSID corresponding to your SBU VLAN.\n2. Flush your local DNS resolver cache (`ipconfig /flushdns` on Windows or `sudo dscacheutil -flushcache` on macOS).\n3. Confirm your AD machine certificate has not expired.\n4. If packet loss persists above 2%, escalate the ticket to IT Network Operations with your floor/desk number.',
      isApproved: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'kb-003',
      slug: 'it-equipment-handover-takeover-policy',
      title: 'IT Equipment Handover & Takeover Acknowledgment Policy',
      category: 'equipment-handover',
      tags: ['laptop', 'handover', 'takeover', 'asset', 'equipment'],
      content:
        'All corporate laptops, monitors, and security keys are tracked by SBU Asset Tag and Serial Number. Upon receiving equipment from IT, employees must inspect the device and click "Acknowledge Custody" in the Employee Dashboard within 24 hours. During offboarding or replacement, IT records a Takeover event signed by both parties.',
      isApproved: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const assets: Asset[] = [
    {
      id: 'asset-001',
      assetTag: 'UPSTRA-TECH-LPT-101',
      serialNumber: 'SN-MBP16-994821',
      category: 'Laptop',
      modelName: 'MacBook Pro 16" M3 Max (36GB/1TB)',
      status: 'ASSIGNED',
      sbuId: 'sbu-tech-001',
      assignedUserId: 'user-emp-tawsif',
      handoverAckStatus: 'ACKNOWLEDGED',
      handoverNotes: 'Assigned for Principal Engineering workload in SBU-TECH.',
      history: [
        {
          date: now,
          action: 'HANDOVER_COMPLETED',
          actorEmail: 'kamal.hossain@upstra.local',
          notes: 'Initial handover acknowledged by Tawsif Zawad',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'asset-002',
      assetTag: 'UPSTRA-TECH-MON-204',
      serialNumber: 'SN-DELL27-441092',
      category: 'Monitor',
      modelName: 'Dell UltraSharp 27" 4K USB-C Hub Monitor',
      status: 'HANDOVER_PENDING_ACK',
      sbuId: 'sbu-tech-001',
      assignedUserId: 'user-emp-tawsif',
      handoverAckStatus: 'PENDING_EMPLOYEE_ACK',
      handoverNotes: 'Delivered to SBU-TECH Desk 4B; awaiting employee digital acknowledgment.',
      history: [
        {
          date: now,
          action: 'ISSUED_PENDING_ACK',
          actorEmail: 'kamal.hossain@upstra.local',
          notes: 'Issued monitor for dual-display workstation setup',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'asset-003',
      assetTag: 'UPSTRA-FIN-LPT-309',
      serialNumber: 'SN-THINKPAD-778231',
      category: 'Laptop',
      modelName: 'Lenovo ThinkPad T14s Gen 5 (32GB/512GB)',
      status: 'ASSIGNED',
      sbuId: 'sbu-fin-002',
      assignedUserId: 'user-emp-nadia',
      handoverAckStatus: 'ACKNOWLEDGED',
      handoverNotes: 'Standard SBU-FIN encrypted workstation.',
      history: [
        {
          date: now,
          action: 'HANDOVER_COMPLETED',
          actorEmail: 'kamal.hossain@upstra.local',
          notes: 'Handed over to Nadia Islam',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const slaFuture = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
  const tickets: Ticket[] = [
    {
      id: 'ticket-seed-1001',
      ticketNumber: 'INC-2026-1001',
      title: 'Outlook desktop client keeps prompting for IMAP TLS certificate confirmation',
      description:
        'After the latest workstation update in SBU-TECH, my Outlook client prompts to verify STARTTLS settings when connecting to my mailbox.',
      status: 'RESOLVED_PENDING_CONFIRMATION',
      severity: 'LOW',
      sbuId: 'sbu-tech-001',
      requesterId: 'user-emp-tawsif',
      assigneeId: null,
      serviceCategoryId: 'cat-outlook-config',
      customFormPayload: { osPlatform: 'macOS', outlookVersion: '16.90' },
      aiSummary: 'Classified as LOW_RISK_OUTLOOK_CONFIGURATION (93% confidence).',
      aiSuggestedFix:
        'Verify Incoming IMAP Port 993 (SSL/TLS) and Outgoing SMTP Port 587 (STARTTLS) in Outlook Profile Settings per KB article [outlook-self-hosted-tls-setup].',
      aiConfidence: 0.93,
      escalationReason: null,
      slaDueAt: slaFuture,
      resolvedAt: now,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'ticket-seed-1002',
      ticketNumber: 'REQ-2026-1002',
      title: 'Request Active Directory security group access for SBU-FIN settlement reporting',
      description:
        'Need read-only membership in CN=SBU-FIN-Audit-Readers for quarterly settlement reconciliation.',
      status: 'ASSIGNED_TO_IT',
      severity: 'MEDIUM',
      sbuId: 'sbu-fin-002',
      requesterId: 'user-emp-nadia',
      assigneeId: 'user-it-kamal',
      serviceCategoryId: 'cat-ad-account',
      customFormPayload: {
        targetAdGroup: 'CN=SBU-FIN-Audit-Readers',
        businessJustification: 'Quarterly reconciliation audit requirement',
      },
      aiSummary: 'Classified as IDENTITY_AND_AD_ACCESS_REQUEST (91% confidence). Policy Engine blocked autonomous execution.',
      aiSuggestedFix:
        'Active Directory group modifications require explicit human approval by IT_ADMIN. Routed to IT queue.',
      aiConfidence: 0.91,
      escalationReason: 'Policy Engine blocked autonomous AD modification; requires human approval.',
      slaDueAt: slaFuture,
      resolvedAt: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'ticket-seed-1003',
      ticketNumber: 'INC-2026-1003',
      title: 'Core SBU-FIN payment switch VLAN latency spike affecting settlement gateway',
      description:
        'Packet loss observed between SBU-FIN core switch and on-premises AD authentication relay. Needs executive approval for emergency maintenance window.',
      status: 'ESCALATED_TO_CTO',
      severity: 'CRITICAL',
      sbuId: 'sbu-fin-002',
      requesterId: 'user-emp-nadia',
      assigneeId: 'user-it-kamal',
      serviceCategoryId: 'cat-hardware-incident',
      customFormPayload: { impactedSystems: 'SW-CORE-FIN-01', sbuWideImpact: true },
      aiSummary: 'Classified as CRITICAL_INFRASTRUCTURE_INCIDENT (95% confidence).',
      aiSuggestedFix: 'Immediate escalation to IT Operations and CTO required per critical SLA policy.',
      aiConfidence: 0.95,
      escalationReason: 'Escalated by IT Admin Kamal Hossain: Emergency core switch failover requires CTO sign-off.',
      slaDueAt: slaFuture,
      resolvedAt: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const ticketEvents: TicketEvent[] = [
    {
      id: crypto.randomUUID(),
      ticketId: 'ticket-seed-1001',
      actorId: 'user-emp-tawsif',
      actorName: 'Tawsif Zawad (SBU-TECH Employee)',
      eventType: 'TICKET_CREATED',
      fromStatus: null,
      toStatus: 'NEW',
      metadata: { ticketNumber: 'INC-2026-1001' },
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      ticketId: 'ticket-seed-1001',
      actorId: null,
      actorName: 'Deterministic Mock AI Orchestrator',
      eventType: 'AI_AUTONOMOUS_RESOLUTION_PROPOSED',
      fromStatus: 'AI_HANDLING',
      toStatus: 'RESOLVED_PENDING_CONFIRMATION',
      metadata: { confidence: 0.93, classification: 'LOW_RISK_OUTLOOK_CONFIGURATION' },
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      ticketId: 'ticket-seed-1002',
      actorId: null,
      actorName: 'Deterministic Mock AI Orchestrator',
      eventType: 'AI_ROUTED_TO_IT_APPROVAL_REQUIRED',
      fromStatus: 'AI_HANDLING',
      toStatus: 'ASSIGNED_TO_IT',
      metadata: { reason: 'AD group modification requires IT_ADMIN approval' },
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      ticketId: 'ticket-seed-1003',
      actorId: 'user-it-kamal',
      actorName: 'Kamal Hossain (Lead IT Administrator)',
      eventType: 'ESCALATED_TO_CTO',
      fromStatus: 'IN_PROGRESS',
      toStatus: 'ESCALATED_TO_CTO',
      metadata: { reason: 'Emergency core switch failover requires CTO sign-off.' },
      createdAt: now,
    },
  ];

  const approvals: Approval[] = [
    {
      id: 'approval-seed-001',
      ticketId: 'ticket-seed-1002',
      actionType: 'AD_GROUP_MEMBERSHIP_DRY_RUN',
      requiredRole: 'IT_ADMIN',
      status: 'PENDING',
      requestedById: 'user-emp-nadia',
      approverId: null,
      justification: 'Add user nadia.islam@upstra.local to CN=SBU-FIN-Audit-Readers (Dry-Run Mode)',
      decisionNotes: null,
      decidedAt: null,
      createdAt: now,
    },
    {
      id: 'approval-seed-002',
      ticketId: 'ticket-seed-1003',
      actionType: 'EMERGENCY_CHANGE_WINDOW_CTO_SIGN_OFF',
      requiredRole: 'CTO',
      status: 'PENDING',
      requestedById: 'user-it-kamal',
      approverId: null,
      justification: 'Failover SBU-FIN core switch SW-CORE-FIN-01 to redundant standby link.',
      decisionNotes: null,
      decidedAt: null,
      createdAt: now,
    },
  ];

  const aiActionLogs: AIActionLog[] = [
    {
      id: 'ailog-seed-001',
      ticketId: 'ticket-seed-1001',
      provider: 'deterministic-mock-ai-provider',
      modelName: 'policy-governed-mock-v1 (NON-LIVE SIMULATION)',
      redactedPrompt: '[Category: outlook-configuration] Title: Outlook desktop client keeps prompting for IMAP TLS certificate confirmation',
      classification: 'LOW_RISK_OUTLOOK_CONFIGURATION',
      recommendedSeverity: 'LOW',
      confidence: 0.93,
      proposedTool: 'diag_outlook_autodiscover_guide',
      policyDecision: 'ALLOWED_LOW_RISK',
      dryRun: false,
      toolOutput: { profileCheck: 'READY', sbuScope: 'SBU-TECH' },
      escalatedToIT: false,
      createdAt: now,
    },
    {
      id: 'ailog-seed-002',
      ticketId: 'ticket-seed-1002',
      provider: 'deterministic-mock-ai-provider',
      modelName: 'policy-governed-mock-v1 (NON-LIVE SIMULATION)',
      redactedPrompt: '[Category: ad-account-request] Title: Request Active Directory security group access for SBU-FIN settlement reporting',
      classification: 'IDENTITY_AND_AD_ACCESS_REQUEST',
      recommendedSeverity: 'MEDIUM',
      confidence: 0.91,
      proposedTool: 'privileged_ad_account_unlock',
      policyDecision: 'REQUIRES_HUMAN_APPROVAL',
      dryRun: true,
      toolOutput: { blocked: true, reason: 'AI is strictly prohibited from modifying Active Directory accounts.' },
      escalatedToIT: true,
      createdAt: now,
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: crypto.randomUUID(),
      actorId: 'user-it-kamal',
      actorEmail: 'kamal.hossain@upstra.local',
      actorRole: 'IT_ADMIN',
      sbuId: 'sbu-corp-003',
      action: 'TICKET_ESCALATED_TO_CTO',
      resource: 'Ticket',
      resourceId: 'ticket-seed-1003',
      ipAddress: '127.0.0.1',
      details: { ticketNumber: 'INC-2026-1003', reason: 'Emergency core switch failover requires CTO sign-off.' },
      createdAt: now,
    },
  ];

  return {
    sbus,
    roles,
    users,
    serviceCategories,
    tickets,
    ticketEvents,
    ticketComments: [],
    assets,
    approvals,
    notifications: [],
    aiActionLogs,
    auditLogs,
    knowledgeArticles,
  };
}
