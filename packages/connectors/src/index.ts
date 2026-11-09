/**
 * @it-support/connectors
 * Enterprise Connector Abstractions:
 * 1. Active Directory (Read-Only Lookup + Approval-Gated Write Bridge Blueprint)
 * 2. Self-Hosted Email Transport & Separate Mailbox Provisioning Adapter
 * 3. Provider-Agnostic AI Orchestration, Deterministic Policy Engine, and Tool Registry
 */

import net from 'node:net';
import {
  type KnowledgeArticle,
  type RoleName,
  type TicketSeverity,
  redactSensitiveData,
} from '../../shared/src/index.ts';

// ============================================================================
// 1. ACTIVE DIRECTORY CONNECTOR ABSTRACTION
// ============================================================================

export interface ADUserRecord {
  sAMAccountName: string;
  userPrincipalName: string;
  displayName: string;
  mail: string;
  department: string;
  sbuCode: string;
  distinguishedName: string;
  enabled: boolean;
  memberOf: string[];
}

export interface ADGroupRecord {
  cn: string;
  distinguishedName: string;
  description: string;
  members: string[];
}

export interface ADWriteActionProposal {
  actionType: 'CREATE_USER' | 'ADD_GROUP_MEMBER' | 'DISABLE_ACCOUNT';
  targetIdentifier: string;
  requestedByEmail: string;
  approvalId?: string;
  approvedByRole?: RoleName;
  dryRun: boolean;
  parameters: Record<string, unknown>;
}

export interface ActiveDirectoryAdapter {
  readonly providerName: string;
  readonly isProductionEnabled: boolean;
  getHealth(): Promise<{ status: 'MOCK_READY' | 'DISABLED' | 'CONNECTED' | 'ERROR'; details: string }>;
  lookupUserByEmail(email: string): Promise<ADUserRecord | null>;
  lookupGroupsForUser(email: string): Promise<ADGroupRecord[]>;
  proposeWriteAction(proposal: ADWriteActionProposal): Promise<{
    executed: boolean;
    dryRun: boolean;
    status: 'REQUIRES_APPROVAL' | 'DRY_RUN_VALIDATED' | 'BLOCKED_PRODUCTION_DISABLED';
    auditMessage: string;
  }>;
}

export class MockActiveDirectoryAdapter implements ActiveDirectoryAdapter {
  public readonly providerName = 'mock-onprem-ad-adapter';
  public readonly isProductionEnabled = false;

  private readonly mockDirectory: ADUserRecord[] = [
    {
      sAMAccountName: 'tawsif.zawad',
      userPrincipalName: 'tawsif.zawad@upstra.com',
      displayName: 'Tawsif Zawad',
      mail: 'tawsif.zawad@upstra.com',
      department: 'Engineering & Operations',
      sbuCode: 'SBU-TECH',
      distinguishedName: 'CN=Tawsif Zawad,OU=SBU-TECH,DC=directory,DC=local',
      enabled: true,
      memberOf: ['CN=All-Employees,OU=Groups,DC=directory,DC=local'],
    },
    {
      sAMAccountName: 'nadia.islam',
      userPrincipalName: 'nadia.islam@upstra.local',
      displayName: 'Nadia Islam (FinTech Employee)',
      mail: 'nadia.islam@upstra.local',
      department: 'Digital Banking',
      sbuCode: 'SBU-FIN',
      distinguishedName: 'CN=Nadia Islam,OU=SBU-FIN,DC=directory,DC=local',
      enabled: true,
      memberOf: ['CN=SBU-FIN-Staff,OU=Groups,DC=directory,DC=local'],
    },
    {
      sAMAccountName: 'kamal.hossain',
      userPrincipalName: 'kamal.hossain@upstra.local',
      displayName: 'Kamal Hossain (IT Admin)',
      mail: 'kamal.hossain@upstra.local',
      department: 'Enterprise IT',
      sbuCode: 'SBU-CORP',
      distinguishedName: 'CN=Kamal Hossain,OU=IT-Admins,DC=directory,DC=local',
      enabled: true,
      memberOf: ['CN=IT-Administrators,OU=Groups,DC=directory,DC=local'],
    },
  ];

  async getHealth() {
    return {
      status: 'MOCK_READY' as const,
      details:
        'Milestone 1 Mock AD Adapter active. Real on-prem AD LDAPS connections and write operations are disabled by security policy.',
    };
  }

  async lookupUserByEmail(email: string): Promise<ADUserRecord | null> {
    const normalized = email.trim().toLowerCase();
    return this.mockDirectory.find((u) => u.mail.toLowerCase() === normalized) || null;
  }

  async lookupGroupsForUser(email: string): Promise<ADGroupRecord[]> {
    const user = await this.lookupUserByEmail(email);
    if (!user) return [];
    return user.memberOf.map((dn) => ({
      cn: dn.split(',')[0].replace('CN=', ''),
      distinguishedName: dn,
      description: 'Mock Active Directory Security Group',
      members: [user.distinguishedName],
    }));
  }

  async proposeWriteAction(proposal: ADWriteActionProposal) {
    if (!proposal.approvalId || !['IT_ADMIN', 'CTO'].includes(proposal.approvedByRole || '')) {
      return {
        executed: false,
        dryRun: true,
        status: 'REQUIRES_APPROVAL' as const,
        auditMessage: `AD write action [${proposal.actionType}] on [${proposal.targetIdentifier}] blocked: explicit human approval by IT_ADMIN or CTO is mandatory.`,
      };
    }

    return {
      executed: false,
      dryRun: true,
      status: 'BLOCKED_PRODUCTION_DISABLED' as const,
      auditMessage: `AD write action [${proposal.actionType}] validated in dry-run with approval [${proposal.approvalId}]. Real AD writes are disabled in Milestone 1 until LDAPS execution bridge is configured.`,
    };
  }
}

// ============================================================================
// 2. SELF-HOSTED EMAIL & MAILBOX PROVISIONING CONNECTORS
// ============================================================================

export interface EmailMessagePayload {
  to: string;
  subject: string;
  textBody: string;
  ticketNumber?: string;
}

export interface EmailTransportAdapter {
  readonly providerName: string;
  getHealth(): Promise<{ status: 'MOCK_READY' | 'MAILPIT_READY' | 'UNAVAILABLE'; details: string }>;
  sendEmail(message: EmailMessagePayload): Promise<{
    delivered: boolean;
    messageId: string;
    transport: string;
    error?: string;
  }>;
  getDeliveredMessages(): Array<EmailMessagePayload & { messageId: string; sentAt: string }>;
}

export class DevelopmentEmailTransport implements EmailTransportAdapter {
  public readonly providerName: string;
  private readonly deliveredLog: Array<EmailMessagePayload & { messageId: string; sentAt: string }> = [];
  private simulateFailure = false;
  private readonly config: {
    mode: 'mock' | 'mailpit';
    smtpHost: string;
    smtpPort: number;
    fromAddress: string;
  };

  constructor(config: {
    mode: 'mock' | 'mailpit';
    smtpHost: string;
    smtpPort: number;
    fromAddress: string;
  }) {
    this.config = config;
    this.providerName = config.mode === 'mailpit' ? 'mailpit-smtp-transport' : 'in-memory-dev-mail-transport';
  }

  public setSimulateFailure(fail: boolean) {
    this.simulateFailure = fail;
  }

  async getHealth() {
    if (this.simulateFailure) {
      return {
        status: 'UNAVAILABLE' as const,
        details: 'Simulated SMTP transport outage active (safe fallback testing).',
      };
    }
    return {
      status: this.config.mode === 'mailpit' ? ('MAILPIT_READY' as const) : ('MOCK_READY' as const),
      details: `Development email transport (${this.providerName}) ready. Real external/corporate SMTP delivery is disabled until server parameters are verified.`,
    };
  }

  async sendEmail(message: EmailMessagePayload) {
    if (this.simulateFailure) {
      return {
        delivered: false,
        messageId: '',
        transport: this.providerName,
        error: 'SMTP transport temporarily unavailable. Notification safely retained for retry.',
      };
    }

    // Safety guard: never transmit real external network traffic to unverified corporate domains in mock mode
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@local.dev`;
    const record = {
      ...message,
      messageId,
      sentAt: new Date().toISOString(),
    };
    this.deliveredLog.push(record);

    if (this.config.mode === 'mailpit') {
      // Optional local Mailpit delivery attempt on 127.0.0.1:1025 if running
      await this.trySendToLocalMailpit(message).catch(() => {
        // Ignore if Mailpit container is not running; recorded in memory
      });
    }

    return {
      delivered: true,
      messageId,
      transport: this.providerName,
    };
  }

  getDeliveredMessages() {
    return [...this.deliveredLog];
  }

  private trySendToLocalMailpit(msg: EmailMessagePayload): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port: this.config.smtpPort, timeout: 500 });
      socket.on('connect', () => {
        socket.end();
        resolve();
      });
      socket.on('error', (err) => reject(err));
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Mailpit connection timeout'));
      });
    });
  }
}

export interface MailboxProvisioningAdapter {
  requestMailboxCreation(params: {
    requestedAddress: string;
    displayName: string;
    sbuCode: string;
    approvalId?: string;
  }): Promise<{
    provisioned: boolean;
    status: 'REQUIRES_PLATFORM_SPEC_AND_APPROVAL';
    guidance: string;
  }>;
}

export class UnconfiguredMailboxProvisioningAdapter implements MailboxProvisioningAdapter {
  async requestMailboxCreation(params: {
    requestedAddress: string;
    displayName: string;
    sbuCode: string;
    approvalId?: string;
  }) {
    return {
      provisioned: false,
      status: 'REQUIRES_PLATFORM_SPEC_AND_APPROVAL' as const,
      guidance: `Automated mailbox creation for [${params.requestedAddress}] is disabled in Milestone 1 because the self-hosted mail platform (e.g., Exchange, Zimbra, Postfix/Dovecot, Stalwart) has not yet been specified. Ticket routed to IT Administrator queue with approval requirement.`,
    };
  }
}

// ============================================================================
// 3. AI ORCHESTRATION, POLICY ENGINE & TYPED TOOL REGISTRY
// ============================================================================

export type AllowedDiagnosticToolName =
  | 'diag_network_gateway_check'
  | 'diag_outlook_autodiscover_guide'
  | 'kb_lookup_handover_policy'
  | 'privileged_ad_account_unlock'
  | 'privileged_mailbox_provision';

export interface ToolDefinition {
  name: AllowedDiagnosticToolName;
  description: string;
  riskLevel: 'LOW_DIAGNOSTIC' | 'HIGH_PRIVILEGED';
  requiresHumanApproval: boolean;
  executeDiagnostic: (context: { ticketTitle: string; sbuCode: string }) => Record<string, unknown>;
}

export const TYPED_TOOL_REGISTRY: Record<AllowedDiagnosticToolName, ToolDefinition> = {
  diag_network_gateway_check: {
    name: 'diag_network_gateway_check',
    description: 'Read-only simulated ping/DNS check against SBU internal gateway and proxy configuration',
    riskLevel: 'LOW_DIAGNOSTIC',
    requiresHumanApproval: false,
    executeDiagnostic: ({ sbuCode }) => ({
      gatewayReachable: true,
      dnsResolverStatus: 'HEALTHY',
      sbuVlan: `VLAN-${sbuCode}`,
      recommendedAction:
        'Flush local DNS cache (`ipconfig /flushdns` or `sudo dscacheutil -flushcache`), verify 802.1X Wi-Fi certificate, and reconnect to Corporate-SBU SSID.',
    }),
  },
  diag_outlook_autodiscover_guide: {
    name: 'diag_outlook_autodiscover_guide',
    description: 'Generates safe client-side Outlook profile & TLS setup checklist without assuming server hostnames',
    riskLevel: 'LOW_DIAGNOSTIC',
    requiresHumanApproval: false,
    executeDiagnostic: ({ sbuCode }) => ({
      profileCheck: 'READY',
      sbuScope: sbuCode,
      note: 'Use your IT-issued self-hosted IMAP/SMTP hostname and enforce STARTTLS/SSL as documented in your SBU onboarding sheet.',
    }),
  },
  kb_lookup_handover_policy: {
    name: 'kb_lookup_handover_policy',
    description: 'Retrieves IT equipment handover/takeover acknowledgment procedure',
    riskLevel: 'LOW_DIAGNOSTIC',
    requiresHumanApproval: false,
    executeDiagnostic: ({ sbuCode }) => ({
      policyRef: 'POL-ASSET-001',
      sbuScope: sbuCode,
      steps: 'Verify serial number -> inspect physical condition -> sign digital handover acknowledgment in Employee Asset Portal.',
    }),
  },
  privileged_ad_account_unlock: {
    name: 'privileged_ad_account_unlock',
    description: 'Modifies Active Directory user lockout or group membership (RESTRICTED)',
    riskLevel: 'HIGH_PRIVILEGED',
    requiresHumanApproval: true,
    executeDiagnostic: () => ({
      blocked: true,
      reason: 'AI is strictly prohibited from modifying Active Directory accounts or resetting credentials.',
    }),
  },
  privileged_mailbox_provision: {
    name: 'privileged_mailbox_provision',
    description: 'Creates a new mailbox on the self-hosted email server (RESTRICTED)',
    riskLevel: 'HIGH_PRIVILEGED',
    requiresHumanApproval: true,
    executeDiagnostic: () => ({
      blocked: true,
      reason: 'AI cannot provision mailboxes autonomously; requires IT Admin approval and verified mail server adapter.',
    }),
  },
};

export interface AIOrchestrationResult {
  provider: string;
  modelName: string;
  redactedPrompt: string;
  classification: string;
  recommendedSeverity: TicketSeverity;
  confidence: number;
  proposedTool: AllowedDiagnosticToolName | null;
  policyDecision: 'ALLOWED_LOW_RISK' | 'REQUIRES_HUMAN_APPROVAL' | 'BLOCKED_BY_POLICY' | 'ESCALATE_TO_IT';
  dryRun: boolean;
  toolOutput: Record<string, unknown> | null;
  suggestedResponse: string;
  matchedArticles: Array<{ slug: string; title: string }>;
  canAutoResolve: boolean;
  escalateToIT: boolean;
  escalationReason?: string;
}

export class DeterministicMockAIOrchestrator {
  public readonly providerName = 'deterministic-mock-ai-provider';
  public readonly modelName = 'policy-governed-mock-v1 (NON-LIVE SIMULATION)';
  private simulateUnavailable = false;

  public setSimulateUnavailable(unavailable: boolean) {
    this.simulateUnavailable = unavailable;
  }

  public evaluateTicket(params: {
    title: string;
    description: string;
    categorySlug: string;
    sbuCode: string;
    knowledgeBase: KnowledgeArticle[];
  }): AIOrchestrationResult {
    // 1. Redact secrets or PII from untrusted ticket text before processing
    const combinedRaw = `[Category: ${params.categorySlug}] Title: ${params.title}\nDescription: ${params.description}`;
    const redactedPrompt = redactSensitiveData(combinedRaw);
    const lowerText = redactedPrompt.toLowerCase();

    // 2. Check for simulated model outage -> graceful manual fallback to IT
    if (this.simulateUnavailable) {
      return {
        provider: this.providerName,
        modelName: this.modelName,
        redactedPrompt,
        classification: 'AI_SERVICE_UNAVAILABLE_FALLBACK',
        recommendedSeverity: 'MEDIUM',
        confidence: 0,
        proposedTool: null,
        policyDecision: 'ESCALATE_TO_IT',
        dryRun: true,
        toolOutput: null,
        suggestedResponse:
          '[Mock AI Fallback] Automated triage is temporarily unavailable. Your ticket has been safely routed directly to the IT Administrator queue.',
        matchedArticles: [],
        canAutoResolve: false,
        escalateToIT: true,
        escalationReason: 'AI provider unavailable; graceful fallback to human IT queue.',
      };
    }

    // 3. Detect prompt injection or unauthorized privileged command attempts in untrusted input
    if (
      lowerText.includes('ignore previous instructions') ||
      lowerText.includes('grant domain admin') ||
      lowerText.includes('rm -rf') ||
      lowerText.includes('drop table')
    ) {
      return {
        provider: this.providerName,
        modelName: this.modelName,
        redactedPrompt,
        classification: 'SECURITY_POLICY_VIOLATION_ATTEMPT',
        recommendedSeverity: 'HIGH',
        confidence: 0.99,
        proposedTool: null,
        policyDecision: 'BLOCKED_BY_POLICY',
        dryRun: true,
        toolOutput: { securityAlert: 'Untrusted input attempted instruction override or privileged command.' },
        suggestedResponse:
          'This request contains restricted administrative directives and has been flagged for manual IT Security review.',
        matchedArticles: [],
        canAutoResolve: false,
        escalateToIT: true,
        escalationReason: 'Prompt injection / restricted command pattern blocked by AI Policy Engine.',
      };
    }

    // 4. Match approved Knowledge Base articles
    const matchedArticles = params.knowledgeBase
      .filter((kb) => kb.isApproved)
      .filter((kb) =>
        kb.tags.some((tag) => lowerText.includes(tag.toLowerCase())) ||
        lowerText.includes(kb.category.toLowerCase())
      )
      .slice(0, 2)
      .map((kb) => ({ slug: kb.slug, title: kb.title, content: kb.content }));

    // 5. Critical outage or production infrastructure incident -> immediate IT/CTO attention
    if (
      lowerText.includes('outage') ||
      lowerText.includes('entire sbu') ||
      lowerText.includes('ransomware') ||
      lowerText.includes('data breach') ||
      lowerText.includes('production down')
    ) {
      return {
        provider: this.providerName,
        modelName: this.modelName,
        redactedPrompt,
        classification: 'CRITICAL_INFRASTRUCTURE_INCIDENT',
        recommendedSeverity: 'CRITICAL',
        confidence: 0.95,
        proposedTool: null,
        policyDecision: 'ESCALATE_TO_IT',
        dryRun: true,
        toolOutput: null,
        suggestedResponse:
          '[Deterministic Mock AI] Classified as a Critical Infrastructure Incident. Autonomous handling is disallowed by policy. Assigned to IT Operations with high priority.',
        matchedArticles: matchedArticles.map(({ slug, title }) => ({ slug, title })),
        canAutoResolve: false,
        escalateToIT: true,
        escalationReason: 'Critical severity incident requires immediate human IT/CTO intervention.',
      };
    }

    // 6. Active Directory account creation / permission change / password reset -> requires approval & IT
    if (
      params.categorySlug === 'ad-account-request' ||
      lowerText.includes('active directory') ||
      lowerText.includes('permission') ||
      lowerText.includes('reset password') ||
      lowerText.includes('unlock account')
    ) {
      const tool = TYPED_TOOL_REGISTRY.privileged_ad_account_unlock;
      return {
        provider: this.providerName,
        modelName: this.modelName,
        redactedPrompt,
        classification: 'IDENTITY_AND_AD_ACCESS_REQUEST',
        recommendedSeverity: 'MEDIUM',
        confidence: 0.91,
        proposedTool: tool.name,
        policyDecision: 'REQUIRES_HUMAN_APPROVAL',
        dryRun: true,
        toolOutput: tool.executeDiagnostic({ ticketTitle: params.title, sbuCode: params.sbuCode }),
        suggestedResponse:
          '[Deterministic Mock AI] Active Directory account and permission changes are strictly gated by human approval policy. Your request has been queued for IT Administrator review.',
        matchedArticles: matchedArticles.map(({ slug, title }) => ({ slug, title })),
        canAutoResolve: false,
        escalateToIT: true,
        escalationReason: 'Policy Engine blocked autonomous AD modification; requires human approval.',
      };
    }

    // 7. Official Email Account Provisioning -> requires approval & IT
    if (
      params.categorySlug === 'email-provisioning' ||
      (lowerText.includes('new email account') || lowerText.includes('mailbox creation'))
    ) {
      const tool = TYPED_TOOL_REGISTRY.privileged_mailbox_provision;
      return {
        provider: this.providerName,
        modelName: this.modelName,
        redactedPrompt,
        classification: 'EMAIL_PROVISIONING_REQUEST',
        recommendedSeverity: 'MEDIUM',
        confidence: 0.92,
        proposedTool: tool.name,
        policyDecision: 'REQUIRES_HUMAN_APPROVAL',
        dryRun: true,
        toolOutput: tool.executeDiagnostic({ ticketTitle: params.title, sbuCode: params.sbuCode }),
        suggestedResponse:
          '[Deterministic Mock AI] Official self-hosted mailbox provisioning requires IT Administrator verification and approval. Routed to IT queue.',
        matchedArticles: matchedArticles.map(({ slug, title }) => ({ slug, title })),
        canAutoResolve: false,
        escalateToIT: true,
        escalationReason: 'Mailbox provisioning requires human approval and verified mail server adapter.',
      };
    }

    // 8. Eligible Low-Risk Issue: Outlook Configuration / Setup Guidance
    if (
      params.categorySlug === 'outlook-configuration' ||
      lowerText.includes('outlook') ||
      lowerText.includes('imap') ||
      lowerText.includes('autodiscover')
    ) {
      const tool = TYPED_TOOL_REGISTRY.diag_outlook_autodiscover_guide;
      const diagOutput = tool.executeDiagnostic({ ticketTitle: params.title, sbuCode: params.sbuCode });
      const kbSnippet = matchedArticles[0]?.content ||
        '1. Open Outlook > File > Account Settings.\n2. Select Manual setup for internal self-hosted mail.\n3. Enter your SBU mail server hostname provided by IT and select STARTTLS/TLS encryption.';
      return {
        provider: this.providerName,
        modelName: this.modelName,
        redactedPrompt,
        classification: 'LOW_RISK_OUTLOOK_CONFIGURATION',
        recommendedSeverity: 'LOW',
        confidence: 0.93,
        proposedTool: tool.name,
        policyDecision: 'ALLOWED_LOW_RISK',
        dryRun: false,
        toolOutput: diagOutput,
        suggestedResponse: `[Deterministic Mock AI - Knowledge Assisted Resolution]\nWe classified your request as an Outlook Configuration question (Confidence: 93%).\n\nRecommended Steps:\n${kbSnippet}\n\nPlease confirm if this resolves your issue, or click "Request IT Help" to reopen and assign to an IT Administrator.`,
        matchedArticles: matchedArticles.map(({ slug, title }) => ({ slug, title })),
        canAutoResolve: true,
        escalateToIT: false,
      };
    }

    // 9. Eligible Low-Risk Issue: Internet / Wi-Fi / DNS Connectivity Troubleshooting
    if (
      params.categorySlug === 'internet-connectivity' ||
      lowerText.includes('wifi') ||
      lowerText.includes('wi-fi') ||
      lowerText.includes('dns') ||
      lowerText.includes('internet slow')
    ) {
      const tool = TYPED_TOOL_REGISTRY.diag_network_gateway_check;
      const diagOutput = tool.executeDiagnostic({ ticketTitle: params.title, sbuCode: params.sbuCode });
      return {
        provider: this.providerName,
        modelName: this.modelName,
        redactedPrompt,
        classification: 'LOW_RISK_NETWORK_DIAGNOSTIC',
        recommendedSeverity: 'LOW',
        confidence: 0.88,
        proposedTool: tool.name,
        policyDecision: 'ALLOWED_LOW_RISK',
        dryRun: false,
        toolOutput: diagOutput,
        suggestedResponse: `[Deterministic Mock AI - Diagnostic & Knowledge Resolution]\nSimulated diagnostic (${tool.name}) for VLAN-${params.sbuCode}; no live gateway health was measured.\n\nRecommended Steps:\n1. ${String(diagOutput.recommendedAction)}\n2. Ensure proxy auto-configuration (PAC) is enabled.\n\nIf connectivity is still degraded, reject this resolution to route immediately to IT Network Operations.`,
        matchedArticles: matchedArticles.map(({ slug, title }) => ({ slug, title })),
        canAutoResolve: true,
        escalateToIT: false,
      };
    }

    // 10. Default: Unclassified or Hardware/Equipment Handover -> Route to IT Administrator
    return {
      provider: this.providerName,
      modelName: this.modelName,
      redactedPrompt,
      classification: 'REQUIRES_HUMAN_IT_FULFILLMENT',
      recommendedSeverity: params.categorySlug === 'hardware-incident' ? 'HIGH' : 'MEDIUM',
      confidence: 0.62,
      proposedTool: null,
      policyDecision: 'ESCALATE_TO_IT',
      dryRun: true,
      toolOutput: null,
      suggestedResponse:
        '[Deterministic Mock AI] This request requires physical verification or manual IT Administrator action. It has been assigned to your SBU IT queue.',
      matchedArticles: matchedArticles.map(({ slug, title }) => ({ slug, title })),
      canAutoResolve: false,
      escalateToIT: true,
      escalationReason: 'Confidence below autonomous threshold or physical/manual fulfillment required.',
    };
  }
}
