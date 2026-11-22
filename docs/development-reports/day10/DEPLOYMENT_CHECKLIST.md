# Deployment checklist

- [x] Verify the Day 9 baseline against the exact PR head and hosted verification runs.
- [x] Exercise the controlled synthetic application and disposable data path.
- [ ] Approve the PR landing sequence, confirm branch protection, and receive independent approval for the selected commits.
- [ ] Verify required hosted checks on the exact release commit and chosen integration base.
- [ ] Approve production PostgreSQL, runtime/migration credentials, OIDC identity lifecycle, SMTP delivery, CA trust, secret injection and restricted network routes.
- [ ] Confirm privileged operator scope across offices/SBUs and close remaining security and concurrency findings.
- [ ] Exercise approved TLS ingress, API liveness/readiness, worker recovery, monitored alert routing and operational rollback in nonproduction.
- [ ] Approve backup retention, RPO/RTO, and verify an isolated production-like restore with recorded results.
- [ ] Complete stakeholder UAT and obtain explicit release authorization.
