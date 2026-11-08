# Self-Hosted Email & Mailbox Provisioning Integration
**Status:** Milestone 1 Development Transport & Mailpit Adapter Implemented; External Corporate Delivery Disabled

## 1. Handling of `tawsif.zawad@upstra.com`
- `tawsif.zawad@upstra.com` is recognized strictly as an existing corporate email address and user identity (`SBU-TECH` Employee), **not** a verified SMTP/IMAP hostname, server credential, or administrative account.
- No SMTP host, port, mailbox creation API, or password has been guessed or hardcoded.
- Milestone 1 never transmits external emails using `tawsif.zawad@upstra.com` or to external domains unless explicitly configured and authorized by IT leadership.

## 2. Separation of Concerns: Notification Transport vs. Mailbox Provisioning
1. **Notification Transport (`EmailTransportAdapter` / `DevelopmentEmailTransport`)**:
   - Handles outbound ticket creation receipts, status transition updates, and CTO escalation alerts.
   - Configured via environment variables (`MAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `MAIL_FROM_ADDRESS`).
   - Defaults to safe in-memory mock transport (`MAIL_PROVIDER=mock`) or local Docker Mailpit (`127.0.0.1:1025`, UI on `127.0.0.1:8025`).
   - If the mail server is unavailable, the notification queue marks the item as `FAILED` / `QUEUED` for retry without blocking or losing the ticket.
2. **Mailbox Provisioning (`MailboxProvisioningAdapter` / `UnconfiguredMailboxProvisioningAdapter`)**:
   - Because the organization's self-hosted email server platform (e.g., Microsoft Exchange On-Premises, Zimbra, Postfix/Dovecot, Mailcow, Stalwart) is not yet specified, automated mailbox creation is isolated behind `MailboxProvisioningAdapter` and kept disabled (`MAIL_PROVISIONING_ENABLED=false`).
   - Official email account requests (`cat-email-provisioning`) automatically create an `IT_ADMIN` approval requirement and route to the IT Administrator queue alongside Outlook TLS setup guidance (`kb-001`).
