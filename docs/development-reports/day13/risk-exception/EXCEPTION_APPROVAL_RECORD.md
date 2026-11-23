# Exception Approval Record — AIIT-SYNTH-EXC-001

> **CURRENT STATUS:** **`PENDING APPROVAL — NOT EFFECTIVE`**  
> *No signature, approval timestamp, or authorization has been recorded. Do not begin exception-covered Day 14 work until this record is explicitly approved by the risk owner.*

---

## 1. Exception Identification

| Field | Value |
|---|---|
| **Exception ID** | `AIIT-SYNTH-EXC-001` |
| **Title** | Temporary Synthetic Enterprise Container Vulnerability Risk Acceptance |
| **Status** | **`PENDING APPROVAL — NOT EFFECTIVE`** |
| **Repository & Branch** | `https://github.com/Tawsif-Jawad/AIIT-customer_it_support` · `development` |
| **Affected Images & Immutable Digests** | 1. `quay.io/keycloak/keycloak:26.8.2@sha256:7e66a96e4739239070aeaf72e4c5decf0f7f682cfc725b9f7ea2b336eaba38b3` (amd64 ID: `sha256:4938c322f47d3736c580fc57bb335d35c784489bc7e6d8fbbd52dbdd1b27e72e`)<br>2. `infra/synthetic-enterprise/Samba.Dockerfile` on `debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2` |
| **Maximum Validity Period** | 14 calendar days from recorded UTC approval timestamp |
| **Maximum Authorized Activities** | Isolated synthetic development and validation (Day 14 full-office simulation and, if separately authorized, Day 15 synthetic testing) using strictly fictional data and verified network isolation |

---

## 2. Approval & Timestamp Fields (To Be Completed ONLY Upon Explicit Owner Approval)

| Field | Recorded Value |
|---|---|
| **Risk Owner / Approving Authority** | `[PENDING — NOT SIGNED]` |
| **Scope Authority Boundary** | `[PENDING — Owner's personally controlled synthetic environment; separate organizational approval required for any corporate resources]` |
| **Security Reviewer (if available)** | `[PENDING / N/A]` |
| **Approval Date & Time (UTC)** | `[PENDING — DO NOT FABRICATE]` |
| **Approval Date & Time (Asia/Dhaka)** | `[PENDING — DO NOT FABRICATE]` |
| **Exact Expiry Timestamp (UTC)** | `[PENDING — Approval UTC + 14 calendar days]` |
| **Explicit Approval Statement** | `[PENDING — Must state: APPROVE AIIT-SYNTH-EXC-001]` |

---

## 3. Mandatory Owner Acknowledgements Required for Approval

Approval of `AIIT-SYNTH-EXC-001` is valid **only** when accompanied by explicit acknowledgement of all six statements below:

- [ ] **1.** The raw container vulnerability scan (`grype 0.122.1 --fail-on high`) remains **FAILING** (Keycloak: 1 Critical, 5 High; Samba: 5 Critical, 139 High).
- [ ] **2.** Day 13 engineering acceptance remains **PARTIAL / BLOCKED**.
- [ ] **3.** Production readiness remains **NO-GO**.
- [ ] **4.** Authorization applies **exclusively** to isolated synthetic testing using fictional data and verified compensating controls, and never to production or corporate infrastructure.
- [ ] **5.** The exception expires automatically **14 calendar days** after the recorded UTC approval timestamp with no automatic renewal.
- [ ] **6.** Day 14 is **not** authorized until both `AIIT-SYNTH-EXC-001` and a separate explicit instruction to start Day 14 are provided.

---

## 4. Evidence & Document References
- [RISK_EXCEPTION_REQUEST.md](RISK_EXCEPTION_REQUEST.md)
- [SECURITY_RISK_ASSESSMENT.md](SECURITY_RISK_ASSESSMENT.md)
- [COMPENSATING_CONTROLS.md](COMPENSATING_CONTROLS.md)
- [EXCEPTION_EXPIRY_AND_REVIEW.md](EXCEPTION_EXPIRY_AND_REVIEW.md)
- [DAY14_ENTRY_GATE.md](DAY14_ENTRY_GATE.md)
- [PRODUCTION_SECURITY_BLOCKERS.md](PRODUCTION_SECURITY_BLOCKERS.md)
- [SECURITY_DEPENDENCY_TRACKER.md](../SECURITY_DEPENDENCY_TRACKER.md)
