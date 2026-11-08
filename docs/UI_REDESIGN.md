# AIIT UI redesign — 8 November 2026

## UI assessment and direction

The existing runtime is a Node HTTP server that produces HTML and browser JavaScript; the Next.js page is an unused scaffold. The earlier blank-page syntax defect was already repaired. The remaining interface used a dense dark header, top tabs, inconsistent inline colors, sparse empty states, and had no public product page or signature footer.

Reviewed the public Omnistra homepage in the browser and the supplied footer screenshot. The live homepage used cinematic imagery, a floating product interface, translucent surfaces, and restrained violet accents. The supplied screenshot, rather than an assumed live footer interaction, guided the glass panel, lightweight copyright divider, and oversized dot typography. All AIIT artwork, layouts, text, and rendering code are original; no reference artwork, logo or proprietary code was copied.

The implemented palette combines warm off-white, charcoal, restrained violet, muted mint and semantic status colors. System sans-serif fonts avoid network font dependencies. Compact operational typography is distinct from the editorial public page.

## Files created

| File | Purpose |
| --- | --- |
| `apps/web/src/landing.ts` | Public navigation, hero, interactive illustrative preview, capabilities, seven-step workflow, assistant showcase, role preview tabs, security disclosures, final CTA and signature footer |
| `apps/web/public/design.css` | Shared design tokens, responsive public layout, operational shell, forms, tables, focus states and reduced-motion styles |
| `apps/web/public/public.js` | Responsive public navigation, preview interactions, keyboard role tabs and original canvas dot renderer |
| `apps/web/public/portal.js` | API-backed overview, catalog, notifications, assistant request creation, comments, session cleanup and sidebar interactions |
| `apps/web/public/atmosphere.svg` | Original abstract cinematic background image; blurred ribbons of mint, rose, slate and warm light |
| `apps/web/public/grain.svg` | Original small noise texture |
| `tests/ui.test.ts` | HTTP routing/assets/outage, generated-script syntax, stale-session protection and footer lifecycle tests |
| `docs/screenshots/*` | Captured local browser evidence and measured responsive widths |

Modified `apps/web/src/server.ts`, `scripts/verify-types.ts`, `package.json`, `tests/e2e/portal.spec.ts`, README, implementation status and roadmap. No dependency, API contract, database schema or identity-provider identifier was added or renamed.

## Implemented behavior

- `/` is now the public AIIT landing page. All support CTAs lead to the real `/app` sign-in/workspace; public navigation uses implemented section anchors.
- `/app` retains the existing authentication, backend role/ownership/SBU authorization, persistence, triage, escalation, approvals, assets and knowledge workflows.
- Employee, customer, IT and CTO workspaces share a responsive shell with role-specific greeting and navigation, live authorized summary metrics, recent requests, and accessible ticket-distribution meters.
- Sidebar collapses on desktop and becomes a mobile drawer. Hidden navigation is inert; Escape closes the mobile drawer. Both public and app navigation work with keyboard controls.
- New API-backed catalog launches the existing ticket form with a selected service. Directory/email requests use those catalog entries; real writes remain disabled.
- Ticket list retains detail view and gains priority filtering, API pagination, keyboard row activation and explicit pagination labels. Existing search/status filters, transitions, escalation, confirmation and reopening remain connected to the API. IT can propose a resolution from IN_PROGRESS.
- Ticket comments and authorized internal notes now have an actual frontend form, persisted through the existing comments endpoint. Approval history is displayed alongside the conversation.
- Assistant messages create an actual persistent support request, then show the configured deterministic mock provider response and a link to that ticket. It does not claim to perform infrastructure operations. Conversation history is session-local, not a new durable chat service.
- Notifications load the authorized backend feed with loading, empty, failure and retry states. Knowledge Base adds search over authorized returned articles. Asset/approval screens gain clear empty states.
- Approval decisions require a written justification. IT users do not see decision buttons reserved for CTO approvals. Backend authorization remains authoritative.
- Health has an explicit retry control, handles degraded HTTP responses, and keeps mock/unverified dependencies labeled accurately. Panel failures display a retry control rather than leaving indefinite loading content.
- Private views are cleared when leaving a session. Responses initiated under an earlier token are rejected before they can render in a later account's workspace.

## Signature footer

The composition uses an original SVG atmosphere, softened glass surface, thin border, dynamic year, a fine copyright divider and huge white dot-matrix AIIT typography. Company ownership links to Upstra. There are no conventional footer navigation columns.

Canvas text-mask sampling places circles on a regular grid. The desktop 1440 CSS-pixel view produced 2,826 dots; the 320-pixel view produced 388. Pointer proximity enlarges and gently repels dots, adds local violet highlights and launches damped ripples. Leaving the surface returns dots to rest. The glass surface also has restrained pointer light/parallax.

Rendering uses direct canvas drawing, requestAnimationFrame while changing, grouped drawing paths, a DPR cap of 2, ResizeObserver, IntersectionObserver, page visibility suspension and pagehide cleanup. Reduced motion disables pointer displacement/ripples and CSS transitions; the final typography stays readable. A CSS dot-mask wordmark remains if canvas/JavaScript is unavailable. No essential content depends on hover.

In the browser, pointer response was observed, then displacement returned to 0.02 CSS pixels with renderer state `idle` after pointer exit. After grouped-path optimization, sampled draw work was approximately 0.7–0.8 ms in this local browser. This is an individual draw measurement, **not** a verified 60fps guarantee or a mobile-device benchmark.

## Verification performed

| Check | Actual result |
| --- | --- |
| `npm test` | 24 passed, zero failed |
| `npm run lint` | Passed existing module/script verification command |
| `npm run build` | Passed existing module/script verification command |
| `node --check apps/web/public/public.js` | Passed |
| `node --check apps/web/public/portal.js` | Passed |
| `node --test tests/ui.test.ts` after final ripple refinement | 4 passed |
| `npm exec --no -- tsc --noEmit` | Could not run: TypeScript compiler is not installed; npm refused missing-package execution |
| Playwright CLI suite | Updated `/app` route and description; not executed because checkout dependencies/browser runner are not installed |

The repository's `lint` and `build` scripts verify module imports and JavaScript parsing. They are not ESLint, a full TypeScript check, or a production bundler. These limitations are not presented as successful static compilation.

Actual in-app browser checks:

- Public hero and footer render; illustrative preview stage buttons update the content.
- Role-preview tabs switch content, including keyboard Right-arrow selection.
- Public mobile menu opens; workspace drawer opens and selecting Service catalog closes it.
- Employee sign-in, populated overview, real assistant request creation (`REQ-2026-1005`), mock recommendations and linked ticket details work.
- Added a comment to the test request and observed the persisted comment and COMMENT_ADDED history event.
- IT sign-in displays authorized operations/approval navigation. CTO-only approval decision controls are absent for IT. Clicking an IT approval without justification displays validation and does not submit a decision.
- CTO sign-in displays the actual authorized critical escalation. Customer sign-in displays zero accessible tickets and no IT/CTO controls or previous account's ticket content.
- Public page and customer workspace were measured at all six requested CSS widths, with no horizontal page overflow: 1920, 1440, 1024, 768, 390, 320. Measurements are saved as JSON. The browser had a 1.29 device/zoom ratio; viewport dimensions were calibrated and actual `innerWidth` was verified.
- Footer pointer reaction, exit settling, resized dot masks and mobile readability were observed. Automated canvas-harness tests cover offscreen suspension, both motion preference branches and cleanup. A physical touch device and OS reduced-motion session were not tested.
- HTTP regression confirms an unavailable backend returns 502, not fabricated successful health.

## Visual evidence

[Desktop landing](screenshots/landing-desktop.jpg) · [Mobile landing](screenshots/landing-mobile.jpg) · [Desktop footer](screenshots/footer-desktop.jpg) · [Pointer interaction](screenshots/footer-interaction.jpg) · [Mobile footer](screenshots/footer-mobile.jpg)

[Employee](screenshots/employee-dashboard.jpg) · [IT](screenshots/it-dashboard.jpg) · [CTO](screenshots/cto-dashboard.jpg) · [Customer](screenshots/customer-dashboard.jpg) · [Assistant](screenshots/assistant.jpg) · [Mobile catalog](screenshots/app-mobile.jpg) · [Login](screenshots/login.jpg)

## Remaining scope and limits

This redesign covers the existing functional modules and adds supported frontend workflows. It does not invent unsupported assignment, bulk action, attachment upload, asset maintenance/return administration, KB editing/version approval, directory provisioning, mailbox provisioning, SLA trend or executive-risk APIs. Those remain backend/product work. The CTO escalation view currently requests up to 100 authorized escalation records; general ticket browsing has pagination.

Live corporate OIDC, production transactional storage, durable multi-process queues, external AI, actual infrastructure probes, full customer organization isolation and deployment validation remain as previously documented. No production AD/mail writes were activated. Mock fixtures and knowledge are still development data.

The next priorities are a genuine compiler/CI pipeline, broader automated browser coverage, physical-device and reduced-motion checks, and implementing the missing backend workflows before exposing more administrative controls. Light mode is the polished operational default; a user-selectable dark theme is not included in this iteration.
