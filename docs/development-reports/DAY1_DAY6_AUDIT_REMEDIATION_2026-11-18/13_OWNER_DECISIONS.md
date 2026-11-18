# Owner decision register

All defaults below are proposals for review.

| Decision | Recommended safe default | Alternatives | Decision owner | Release impact |
| --- | --- | --- | --- | --- |
| CTO routing | One explicitly designated active recipient, fail closed on ambiguity | Named on-call rotation or per-SBU delegates | CTO and IT Operations | Escalation availability |
| Customer organizations | Retain requester-only access | Tenant model with organization administrators and explicit grants | Product and Security | Multi-customer rollout |
| Multiple SBU memberships | Keep one active scope, approve explicit scoped assignments later | Multiple additive grants or selected active SBU | Product and Security | Cross-SBU staffing |
| Data privacy | Minimize and redact new secret-bearing free text | Restricted encrypted originals under an approved exception | Privacy and Security | Real user data |
| Retention and deletion | Approve category-based schedule plus legal holds | Central schedule with documented exceptions | Privacy and Legal | Live data and backups |
| Keycloak and AD | Controlled nonproduction IdP with no AD writes | Reviewed read-only federation, then staged write candidates | Identity and Security | Real employee access |
| SMTP | Keep mock until approved transport credentials and sender allowlist | Internal relay or approved mail service | Messaging and Security | Real notifications |
| AI tool authorization | Read-only allowlist with human fallback | Recommendation-only or explicit action approvals after exact binding | IT Operations and Security | Autonomous execution |
| Assets | Keep current limited custody acknowledgment | Full inventory, acquisition and return workflow | Asset Operations | Asset lifecycle scope |
| SLA | Review business calendar, priority and alert recipients | SBU-specific SLA policies or common global policy | Service Desk and Product | Operational commitments |
| Hosting | Private authenticated TLS ingress and separate database roles | Approved managed hosting or corporate infrastructure | Platform and Security | Public exposure |
| Recovery | Approve RPO/RTO and verify timed off-host restores | Tiered objectives by service and data class | Platform and Business Continuity | Cutover and supportability |
