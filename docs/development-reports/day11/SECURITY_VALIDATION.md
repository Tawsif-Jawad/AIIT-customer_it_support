# Security validation

Source and tests reviewed cover current-role lookup, service-account exclusion, issuer/subject mapping, CSRF, versioned assignment, immutable approval decisions, custody, recipient-owned notification reads and report scope. Day 11 fixes two issues.

- D11-01 approval integrity. Pending decisions require a valid expiry, matching stored action/resource parameters and stored digest. Explicit action parameters and versions are checked. Legacy pending requests missing these fields remain available for investigation and need reissuance. Historical decisions remain intact. The functional regression verifies rejection without consumption and successful decision on a properly bound record.
- D11-02 PostgreSQL reporting parity. The request store now loads pending approvals for the report and all applicable tickets, including tickets without approvals. Shared report logic scopes counts to the selected ticket set. PostgreSQL/JSON parity compares actual totals.

Residual security gates include office and CTO routing entitlements, revocation from real directory changes, service identity governance, and approval of any future privileged action executor. Current binding covers the application's recorded action and ticket metadata. A future executor needs an explicit validated payload contract for every external parameter and a separation-of-duties policy. Privileged audit access is read-only through the reviewed API. Employee, IT and CTO stakeholder approval remains pending.
