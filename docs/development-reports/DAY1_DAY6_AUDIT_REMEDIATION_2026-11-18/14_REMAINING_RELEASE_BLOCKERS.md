# Release blockers and feature status

| Capability | Development status | Production gate |
| --- | --- | --- |
| Native portal and ticket workflow | VERIFIED | Target browser/ingress and role UAT |
| JSON development store | VERIFIED | Local development only |
| PostgreSQL ticketing, auth sessions and outbox | VERIFIED | Operational cutover, independent review, PostgreSQL 16 hosted parity and restore objectives |
| OIDC with controlled issuer | VERIFIED | Real client configuration, federation, network and identity mapping |
| Ingress abuse protection | PARTIAL | Distributed attack and real issuer capacity rehearsal |
| Role, SBU and ownership restrictions | VERIFIED | Customer organizations and multi-SBU policy |
| Approval decision and audit | VERIFIED | Audit integrity and approved retention |
| Exact-action approval and execution | NOT IMPLEMENTED | FR-D2-07 and owner policy approval |
| AI triage and tooling | MOCK | Provider, retrieval, evaluation and authorization gates |
| Directory and delivery adapters | MOCK | Real LDAPS and SMTP evidence |
| Asset custody acknowledgment | VERIFIED | Registration/return policy and implementation |
| Ticket assignment/reassignment | PARTIAL | Manual assignment lifecycle and scope |
| Knowledge retrieval and catalog | VERIFIED | KB editorial lifecycle and authorization |
| Attachments, KB administration and SLA delivery/escalation | NOT IMPLEMENTED | Product scope and security design |
| Production hosting and recovery | UNVERIFIED | Approved topology, edge capacity, encrypted backups and joint restore exercise |
| Dependency audit | BLOCKED | Full pnpm audit reports Picomatch ReDoS in development dependencies, with no patched npm release identified |

| Hosted verification | BLOCKED | Successful hosted runs on the verified candidate |
| Independent acceptance | UNVERIFIED | Independent replay and reviewer disposition |

## Proposed 10 December pilot boundary

A controlled pilot can cover private intake, approved identities, scoped agent/customer views, ticket lifecycle, approval recording with execution disabled, deterministic guidance and notification review. Use the existing PostgreSQL/worker path only after deployment and restore rehearsals, identity validation, and formal approvals. Autonomous privileged actions, broad asset/SLA scope, attachments and production-wide rollout stay outside the proposed pilot. The date remains at risk while hosted, independent and operational release gates are open.

## Phase 1 AI design proposal

1. Place a provider adapter behind the existing deterministic workflow and require a structured response with classification, confidence, cited source IDs and escalation reason. Validate the schema locally with bounded fields. Reject unknown source IDs and privileges at the policy layer.
2. Retrieve only approved documents accessible to the current actor/SBU through a server-controlled index. Version content and cite the source version. Treat user text and retrieved chunks as untrusted data. Keep policy and tool parameters outside model instructions.
3. Redact and minimize context before transmission. Approve provider residency, retention and access controls. Set timeouts, token budgets and per-user spend limits. Record aggregate cost, latency, schema failures and fallback counts without logging raw context.
4. Use a reviewed typed read-only diagnostic allowlist. Server code validates parameters, checks scope, and records tool and outcome. Keep side-effecting tools disabled. Require independently observable outcome before asserting resolution, and route timeout, ungrounded, low-confidence and high-risk cases to IT.
5. Replay deidentified fixtures with malicious user text and KB content, authorization boundaries, conflicting retrieved content, provider failures and budget limits. Gate rollout on reviewed accuracy, groundedness, false-resolution and latency thresholds and a human override path.

Prioritize manual assignment/reassignment, approved SMTP and validated identity for an operational pilot. Follow with SLA alerts, KB management and asset registration/return once their owners define policy. Schedule attachments after storage, access control and file-validation design.
