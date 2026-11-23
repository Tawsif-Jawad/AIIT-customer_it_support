# Day 14 Entry Gate — Strict Authorization Checklist

**Current Day 14 Status:** **`ON HOLD`**  
**Current Exception Status (`AIIT-SYNTH-EXC-001`):** **`PENDING APPROVAL — NOT EFFECTIVE`**

Day 14 (Full-Office Simulation and Stress Testing on `development`) may **not** begin until **every** gate below is satisfied and verified:

- [ ] **1. Formal Exception Completed:** All 7 documents in `docs/development-reports/day13/risk-exception/` are committed on `development` and reviewed.
- [ ] **2. Compensating Controls Verified:** All mandatory controls in [COMPENSATING_CONTROLS.md](COMPENSATING_CONTROLS.md) remain verified and passing in CI.
- [ ] **3. Explicit Owner Risk Acceptance:** The approving authority explicitly issues `APPROVE AIIT-SYNTH-EXC-001` with all 6 mandatory acknowledgements.
- [ ] **4. Real Approval Timestamp Recorded:** [EXCEPTION_APPROVAL_RECORD.md](EXCEPTION_APPROVAL_RECORD.md) is updated on `development` with real UTC and Asia/Dhaka approval timestamps and exact UTC expiry (`+14 calendar days`).
- [ ] **5. Exception Active (Not Expired):** Current UTC time is strictly prior to the recorded expiry timestamp.
- [ ] **6. Scope Match:** Proposed Day 14 activities fall strictly within the isolated synthetic-only scope of `AIIT-SYNTH-EXC-001`.
- [ ] **7. Explicit Instruction to Start Day 14:** The owner separately and explicitly instructs Antigravity to begin Day 14. *(Approving `AIIT-SYNTH-EXC-001` alone is not automatic permission to start Day 14.)*
- [ ] **8. Clean `development` Baseline Verified:** Active checkout is `development`, synced with `origin/development`, with `main` unchanged.
