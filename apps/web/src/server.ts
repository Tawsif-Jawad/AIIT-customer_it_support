/**
 * Enterprise IT Support Web Application Server (apps/web/src/server.ts)
 * Serves the responsive, accessible Enterprise Portal UI and proxies /api/* to the Backend API.
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { getLandingHtml } from './landing.ts';

const WEB_PORT = Number(process.env.WEB_PORT || 3000);
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';

export function getPortalHtml(apiBaseUrl = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AIIT — AI-Powered Enterprise IT Support & Management System</title>
  <style>
    :root {
      --bg-primary: #0b0f19;
      --bg-card: #131b2e;
      --bg-elevated: #1c2742;
      --border: #2a395c;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --critical: #ec4899;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-main);
      line-height: 1.5;
      min-height: 100vh;
    }
    header {
      background: var(--bg-card);
      border-bottom: 1px solid var(--border);
      padding: 0.85rem 1.5rem;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }
    .brand { display: flex; align-items: center; gap: 0.75rem; }
    .brand-badge {
      background: linear-gradient(135deg, #3b82f6, #6366f1);
      color: #fff;
      font-weight: 800;
      padding: 0.4rem 0.65rem;
      border-radius: 8px;
      font-size: 0.9rem;
      letter-spacing: 0.04em;
    }
    .container { max-width: 1360px; margin: 0 auto; padding: 1.5rem; }
    .banner-mock {
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #fcd34d;
      padding: 0.6rem 1rem;
      border-radius: 8px;
      font-size: 0.84rem;
      margin-bottom: 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .grid-metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .metric-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1rem 1.25rem;
    }
    .metric-label { font-size: 0.78rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .metric-value { font-size: 1.85rem; font-weight: 700; margin-top: 0.25rem; }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.75rem;
    }
    button {
      cursor: pointer;
      font-family: inherit;
      font-size: 0.88rem;
      font-weight: 600;
      border-radius: 7px;
      border: 1px solid transparent;
      padding: 0.5rem 0.95rem;
      transition: all 0.15s ease;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-secondary { background: var(--bg-elevated); color: var(--text-main); border-color: var(--border); }
    .btn-secondary:hover { background: #263558; }
    .btn-success { background: #059669; color: #fff; }
    .btn-danger { background: #dc2626; color: #fff; }
    .btn-warning { background: #d97706; color: #fff; }
    .tab-btn { background: transparent; color: var(--text-muted); border: 1px solid transparent; }
    .tab-btn.active { background: var(--bg-elevated); color: #fff; border-color: var(--accent); }
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
    }
    .card h2 { font-size: 1.15rem; margin-bottom: 0.75rem; }
    .form-group { margin-bottom: 0.9rem; }
    label { display: block; font-size: 0.84rem; font-weight: 600; margin-bottom: 0.35rem; color: #cbd5e1; }
    input, select, textarea {
      width: 100%;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      color: var(--text-main);
      padding: 0.55rem 0.75rem;
      border-radius: 6px;
      font-size: 0.9rem;
    }
    textarea { min-height: 90px; resize: vertical; }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.55rem;
      font-size: 0.74rem;
      font-weight: 700;
      border-radius: 999px;
      text-transform: uppercase;
    }
    .badge-status { background: #1e3a8a; color: #93c5fd; }
    .badge-resolved { background: #064e3b; color: #6ee7b7; }
    .badge-cto { background: #831843; color: #f9a8d4; }
    .badge-it { background: #78350f; color: #fde68a; }
    .layout-split {
      display: grid;
      grid-template-columns: 1fr 1.15fr;
      gap: 1.25rem;
    }
    @media (max-width: 960px) { .layout-split { grid-template-columns: 1fr; } }
    .ticket-row {
      padding: 0.85rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 0.65rem;
      background: var(--bg-primary);
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .ticket-row:hover, .ticket-row.selected { border-color: var(--accent); background: rgba(59, 130, 246, 0.08); }
    .ai-box {
      background: rgba(59, 130, 246, 0.1);
      border-left: 4px solid var(--accent);
      padding: 0.85rem;
      border-radius: 6px;
      margin: 0.85rem 0;
      font-size: 0.88rem;
      white-space: pre-wrap;
    }
    .timeline-item {
      border-left: 2px solid var(--border);
      padding-left: 0.85rem;
      margin-bottom: 0.65rem;
      font-size: 0.83rem;
    }
    .alert-error {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid var(--danger);
      color: #fca5a5;
      padding: 0.75rem;
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    .alert-success {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid var(--success);
      color: #6ee7b7;
      padding: 0.75rem;
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
    th, td { text-align: left; padding: 0.65rem; border-bottom: 1px solid var(--border); }
    th { color: var(--text-muted); font-weight: 600; }
  </style>
  <link rel="stylesheet" href="/assets/design.css" />
</head>
<body class="app-page">
  <a class="skip-link" href="#workspace-section">Skip to workspace</a>
  <header role="banner">
    <div class="brand">
      <button class="app-menu" id="app-menu" aria-label="Toggle workspace navigation" aria-expanded="false" aria-controls="workspace-navigation">☰</button><a href="/" aria-label="AIIT home"><span class="brand-badge">AIIT</span></a>
      <div>
        <h1 style="font-size: 1.1rem; font-weight: 700;">AIIT — AI-Powered Enterprise IT Support & Management System</h1>
        <p style="font-size: 0.76rem; color: var(--text-muted);">Intelligent Support. Autonomous Solutions.</p>
      </div>
    </div>
    <div id="user-header-controls" style="display: flex; align-items: center; gap: 0.75rem;"></div>
  </header>

  <main class="container" role="main">
    <div class="banner-mock" role="status">
      <span><strong>Governance Notice:</strong> AI Orchestrator is running in <code>deterministic-mock-ai-provider</code> mode. Active Directory & Self-Hosted Mail production writes are safely disabled until corporate verification.</span>
      <div style="display:flex;gap:10px;align-items:center"><span id="health-pill" class="badge badge-status">Checking Health...</span><button class="btn-secondary" id="retry-health" type="button" style="padding:4px 10px;min-height:30px;font-size:10px">Retry health</button></div>
    </div>

    <div id="global-feedback" aria-live="polite"></div>

    <!-- LOGIN VIEW -->
    <section id="login-section" class="card" style="max-width: 640px; margin: 2rem auto;">
      <div class="login-art" aria-hidden="true">✧</div><div class="eyebrow" style="margin-bottom:14px">Welcome to your workspace</div><h2>Sign in to AIIT</h2>
      <p id="auth-mode-notice" style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 1rem;">
        Checking authentication mode…
      </p>
      <div class="form-group">
        <label for="login-identity-select">Development test identity</label>
        <select id="login-identity-select" aria-label="Select Development Identity"></select>
      </div>
      <div class="form-group">
        <label for="login-email-input">Corporate Email Address</label>
        <input type="email" id="login-email-input" placeholder="e.g., tawsif.zawad@upstra.com" />
      </div>
      <a id="enterprise-login-btn" class="btn-primary" href="/api/auth/oidc/login" style="display:none">Sign in with enterprise identity ↗</a>
      <button id="login-submit-btn" class="btn-primary" type="button">Sign in to development environment ↗</button>
    </section>

    <!-- AUTHENTICATED WORKSPACE -->
    <div id="workspace-section" style="display: none;">
      <div class="workspace-heading"><div><div class="eyebrow" id="workspace-breadcrumb">Workspace / Overview</div><h2 id="workspace-greeting">How can AIIT help you today?</h2><p id="workspace-context">Your requests. Your equipment. Your next step.</p></div><button class="btn-primary" id="quick-create">Create support ticket ↗</button></div><div class="grid-metrics" id="metrics-container"></div>

      <nav class="tabs" id="workspace-navigation" aria-label="Portal Navigation"><button class="tab-btn" data-tab="dashboard" type="button">Overview</button><button class="tab-btn" data-tab="assistant" type="button">AI Assistant</button>
        <button class="tab-btn active" data-tab="tickets" type="button">Tickets & Queue</button>
        <button class="tab-btn" data-tab="create" type="button">+ New Support Request</button>
        <button class="tab-btn" data-tab="catalog" type="button">Service catalog</button><button class="tab-btn" data-tab="notifications" type="button">Notifications</button><button class="tab-btn" data-tab="assets" type="button">IT Assets & Handover</button>
        <button class="tab-btn" data-tab="kb" type="button">Knowledge Base</button>
        <button class="tab-btn" data-tab="approvals" id="tab-btn-approvals" type="button" style="display:none;">Approvals Queue</button>
        <button class="tab-btn" data-tab="cto" id="tab-btn-cto" type="button" style="display:none;">CTO Escalation Dashboard</button>
        <button class="tab-btn" data-tab="audit" id="tab-btn-audit" type="button" style="display:none;">Security Audit & Health</button>
      </nav>

<section id="tab-dashboard" class="tab-panel" style="display:none"><div class="overview-grid"><div class="card"><h2>Recent requests</h2><div id="overview-tickets"></div><button class="btn-secondary" data-go="tickets">View all requests ↗</button></div><div class="card"><div class="eyebrow">A little guidance goes a long way</div><h2 style="font-size:29px;margin:24px 0">Your next step,<br>made clearer.</h2><p>Describe an issue to get knowledge-assisted recommendations, or browse the service catalog.</p><button class="btn-primary" style="margin-top:24px" data-go="assistant">Ask AIIT ✧</button><button class="btn-secondary" style="margin-top:12px" data-go="catalog">Explore services ↗</button></div></div><div class="card"><h2>Authorized ticket distribution</h2><div id="overview-distribution" class="catalog-grid" style="margin-top:20px"></div></div></section>
      <section id="tab-assistant" class="tab-panel" style="display:none"><div class="assistant-layout"><div class="card"><div class="eyebrow">Knowledge-assisted support</div><h2 style="font-size:27px;margin:20px 0">Let's work through it.</h2><div class="assistant-messages" id="assistant-messages" role="log" aria-live="polite"><div class="bubble"><strong>AIIT · MOCK AI</strong><p>Tell me what isn't working. I'll create a support request and return the configured provider's guidance. I do not access your mailbox or execute infrastructure changes.</p></div></div><form id="assistant-form"><label for="assistant-category">Service category</label><select id="assistant-category" required></select><label for="assistant-input" style="margin-top:14px">Describe your IT issue</label><div class="assistant-compose"><textarea id="assistant-input" minlength="10" maxlength="5000" placeholder="For example: Outlook cannot connect to my mail server…" required></textarea><button class="btn-primary" type="submit">Create request & ask ↗</button></div></form></div><aside class="card"><h2>In context</h2><p style="font-size:13px;color:var(--muted);margin:20px 0">Recommendations are generated by the deterministic mock provider from approved, accessible knowledge.</p><div id="assistant-context"><span class="badge badge-status">No request selected</span></div><button class="btn-secondary" data-go="kb" style="margin-top:25px">Browse knowledge ↗</button></aside></div></section>
      <section id="tab-catalog" class="tab-panel" style="display:none"><div class="card"><h2>What can we help with?</h2><p style="font-size:13px;color:var(--muted);margin:14px 0 25px">Choose a configured service to start a request. Directory and email changes require review; production writes remain disabled.</p><div id="catalog-grid" class="catalog-grid"></div></div></section>
      <section id="tab-notifications" class="tab-panel" style="display:none"><div class="card"><h2>Your updates</h2><p style="font-size:12px;color:var(--muted);margin:12px 0">Updates returned by your authorized notification feed. Email transport remains in development mode.</p><button class="btn-secondary" id="refresh-notifications">Refresh updates</button><div id="notifications-list"></div></div></section>
      <!-- TAB: TICKETS & QUEUE -->
      <section id="tab-tickets" class="tab-panel">
        <div class="card" style="padding: 0.85rem 1.25rem; display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;">
          <input type="search" id="filter-search" aria-label="Search tickets" placeholder="Search ticket number, title, description..." style="max-width: 280px;" />
          <select id="filter-status" aria-label="Filter by ticket status" style="max-width: 220px;">
            <option value="">All Statuses</option>
            <option value="RESOLVED_PENDING_CONFIRMATION">Resolved Pending Confirmation</option>
            <option value="ASSIGNED_TO_IT">Assigned to IT</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="ESCALATED_TO_CTO">Escalated to CTO</option>
            <option value="CLOSED">Closed</option>
          </select>
          <select id="filter-severity" aria-label="Filter by priority" style="max-width:170px"><option value="">All priorities</option><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select><button id="refresh-tickets-btn" class="btn-secondary" type="button">Filter / Refresh</button>
        </div>

        <div class="layout-split">
          <div class="card">
            <h2>Scoped Tickets (<span id="ticket-count-label">0</span>)</h2>
            <div id="ticket-list-container"></div><div style="display:flex;gap:10px;align-items:center;margin-top:20px"><button class="btn-secondary" id="previous-page">←</button><span id="page-label" style="font-size:12px">Page 1</span><button class="btn-secondary" id="next-page">→</button></div>
          </div>
          <div class="card" id="ticket-detail-container">
            <p style="color: var(--text-muted);">Select a ticket from the list to inspect AI analysis, state transitions, approvals, and event history.</p>
          </div>
        </div>
      </section>

      <!-- TAB: CREATE TICKET -->
      <section id="tab-create" class="tab-panel" style="display: none;">
        <div class="card" style="max-width: 760px;">
          <h2>Submit IT Service Request or Incident</h2>
          <form id="create-ticket-form">
            <div class="form-group">
              <label for="ticket-category">IT Service Category</label>
              <select id="ticket-category" required></select>
            </div>
            <div class="form-group">
              <label for="ticket-title">Request Summary / Title</label>
              <input type="text" id="ticket-title" required minlength="5" placeholder="Describe the issue or request concisely" />
            </div>
            <div class="form-group">
              <label for="ticket-severity">Requested Severity</label>
              <select id="ticket-severity">
                <option value="LOW">LOW - Minor question or configuration guidance</option>
                <option value="MEDIUM">MEDIUM - Standard service request or single-user disruption</option>
                <option value="HIGH">HIGH - Department or time-sensitive failure</option>
                <option value="CRITICAL">CRITICAL - SBU-wide production or infrastructure outage</option>
              </select>
            </div>
            <div class="form-group">
              <label for="ticket-description">Detailed Description (Untrusted input is sanitized & redacted before AI triage)</label>
              <textarea id="ticket-description" required minlength="10" placeholder="Include relevant symptoms, error messages, floor/desk location, or asset tags..."></textarea>
            </div>
            <button type="submit" class="btn-primary" id="submit-ticket-btn">Submit Ticket for AI Triage & Routing</button>
          </form>
        </div>
      </section>

      <!-- TAB: ASSETS -->
      <section id="tab-assets" class="tab-panel" style="display: none;">
        <div class="card">
          <h2>IT Equipment Inventory & Handover / Takeover Custody</h2>
          <div id="assets-container"></div>
        </div>
      </section>

      <!-- TAB: KNOWLEDGE BASE -->
      <section id="tab-kb" class="tab-panel" style="display: none;">
        <div class="card">
          <h2>Approved Enterprise Knowledge Base</h2>
          <label for="kb-search">Find an article</label><input id="kb-search" type="search" placeholder="Search approved knowledge…" style="margin:10px 0 20px"><div id="kb-container"></div>
        </div>
      </section>

      <!-- TAB: APPROVALS -->
      <section id="tab-approvals" class="tab-panel" style="display: none;">
        <div class="card">
          <h2>Human-in-the-Loop Action Approvals (IT Admin & CTO)</h2>
          <label for="approval-reason">Decision justification</label><textarea id="approval-reason" minlength="5" maxlength="1000" placeholder="Explain the reason for your approval or rejection. Required for every decision."></textarea><div id="approvals-container" style="margin-top:22px"></div>
        </div>
      </section>

      <!-- TAB: CTO ESCALATION DASHBOARD -->
      <section id="tab-cto" class="tab-panel" style="display: none;">
        <div class="card">
          <h2>Executive CTO Escalation Queue & Cross-SBU Insights</h2>
          <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 1rem;">
            Displays authorized critical incidents and escalations. Demo SBU names are configuration fixtures.
          </p>
          <div id="cto-escalation-container"></div>
        </div>
      </section>

      <!-- TAB: AUDIT LOGS & CONNECTOR HEALTH -->
      <section id="tab-audit" class="tab-panel" style="display: none;">
        <div class="card">
          <h2>System Integration Health & Security Audit Trail</h2>
          <div id="connector-health-box" style="margin-bottom: 1.25rem;"></div>
          <h3>Administrative & Security Audit Events (local JSON; not tamper-proof)</h3>
          <div id="audit-logs-container" style="margin-top: 0.75rem;"></div>
        </div>
      </section>
    </div>
    <footer style="color:var(--text-muted);padding:1rem 0;font-size:0.8rem;">Powered by Upstra Communications Limited</footer>
  </main>
  <noscript>AIIT requires JavaScript. Enable JavaScript to sign in and access support.</noscript>

  <script>
    const API_BASE = '${apiBaseUrl}';
    localStorage.removeItem('itsupport_token'); // Remove historical persisted bearer tokens.
    let authToken = '';
    let csrfToken = '';
    let sessionEpoch = 0;
    let currentUser = null;
    let catalogCategories = [];
    let currentTickets = [];
    let selectedTicketId = null;
    let ticketPage = 1;
    let ticketPages = 1;

    function showFeedback(message, type = 'success') {
      const box = document.getElementById('global-feedback');
      box.innerHTML = '<div class="' + (type === 'error' ? 'alert-error' : 'alert-success') + '" role="alert">' + escapeHtml(message) + '</div>';
      setTimeout(() => { box.innerHTML = ''; }, 6000);
    }

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    async function apiFetch(path, options = {}) {
      const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
      const requestToken = authToken;
      const requestEpoch = sessionEpoch;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let res, data;
      try {
        res = await fetch(API_BASE + path, Object.assign({}, options, { headers, signal: controller.signal }));
        data = await res.json();
      } catch (error) {
        throw new Error(error.name === 'AbortError' ? 'Request timed out. Check the API service and retry.' : 'API unavailable or invalid response. Check the API service and retry.');
      } finally {
        clearTimeout(timeout);
      }
      if (requestEpoch !== sessionEpoch || requestToken !== authToken) throw new Error('Session changed. Refresh this view.');
      if (res.status === 401 && !path.startsWith('/api/auth/')) {
        sessionEpoch++; authToken = ''; csrfToken = ''; currentUser = null;
        if (typeof resetPrivateViews === 'function') resetPrivateViews();
        document.getElementById('workspace-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('user-header-controls').innerHTML = '';
        document.body.classList.remove('authenticated', 'nav-open');
        throw new Error('Session expired or invalid. Sign in again.');
      }
      if (!res.ok && !options.acceptError) {
        throw new Error((data.error && data.error.message) || 'Request failed with status ' + res.status);
      }
      return data;
    }

    async function loadHealth() {
      try {
        const health = await apiFetch('/api/health', { acceptError: true });
        if (typeof health.status !== 'string') throw new Error('Invalid health response');
        const pill = document.getElementById('health-pill');
        pill.textContent = 'System: ' + health.status + ' | AD: ' + (health.components?.activeDirectory?.status || 'UNKNOWN');
        const healthBox = document.getElementById('connector-health-box');
        if (healthBox) {
          healthBox.innerHTML = '<pre style="background:#0b0f19;padding:0.85rem;border-radius:8px;overflow:auto;font-size:0.8rem;">' +
            escapeHtml(JSON.stringify(health.components, null, 2)) + '</pre>';
        }
      } catch (e) {
        document.getElementById('health-pill').textContent = 'API unavailable — check backend and retry';
        document.getElementById('health-pill').className = 'badge badge-it';
      }
    }

    async function initAuth() {
      void loadHealth();
      const config = await apiFetch('/api/auth/config').catch(() => ({mode:'unconfigured',ready:false}));
      const development = config.mode === 'development';
      const enterpriseButton = document.getElementById('enterprise-login-btn');
      enterpriseButton.style.display = config.mode === 'enterprise' && config.ready ? 'inline-block' : 'none';
      document.getElementById('login-submit-btn').style.display = development ? 'inline-block' : 'none';
      document.getElementById('login-email-input').parentElement.style.display = development ? 'block' : 'none';
      document.getElementById('login-identity-select').parentElement.style.display = development ? 'block' : 'none';
      document.getElementById('auth-mode-notice').textContent = development ? 'Development mode: select a seeded test identity. This is not live corporate authentication.' : config.ready ? 'Enterprise sign-in uses your configured identity provider. Application permissions remain managed by AIIT.' : 'Authentication is not configured. Contact your administrator; development sign-in is disabled.';
      const idData = development ? await apiFetch('/api/auth/identities').catch(error => { showFeedback(error.message, 'error'); return { identities: [] }; }) : {identities:[]};
      const select = document.getElementById('login-identity-select');
      select.innerHTML = idData.identities.map(u =>
        '<option value="' + escapeHtml(u.email) + '">' + escapeHtml(u.displayName) + ' [' + escapeHtml(u.roleName) + ' | ' + escapeHtml(u.sbuCode) + ']</option>'
      ).join('');
      if (idData.identities.length > 0) {
        document.getElementById('login-email-input').value = idData.identities[0].email;
      }
      select.onchange = () => {
        document.getElementById('login-email-input').value = select.value;
      };

      {
        try {
          const me = await apiFetch('/api/auth/me');
          csrfToken = me.csrfToken || '';
          currentUser = me.user;
          await renderAuthenticatedWorkspace();
          return;
        } catch {
          localStorage.removeItem('itsupport_token');
          authToken = '';
        }
      }
      if (typeof resetPrivateViews === 'function') resetPrivateViews();
      document.getElementById('login-section').style.display = 'block';
      document.body.classList.remove('authenticated', 'nav-open');
      document.getElementById('workspace-section').style.display = 'none';
      document.getElementById('user-header-controls').innerHTML = '';
    }

    document.getElementById('retry-health').onclick = loadHealth;
    document.getElementById('login-submit-btn').onclick = async () => {
      const button = document.getElementById('login-submit-btn');
      button.disabled = true;
      const email = document.getElementById('login-email-input').value.trim();
      try {
        const res = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email })
        });
        authToken = ''; csrfToken = res.csrfToken || ''; sessionEpoch++;
        // Authentication stays in the HttpOnly cookie; upstream tokens never enter JavaScript.
        currentUser = res.user;
        showFeedback('Authenticated as ' + currentUser.displayName + ' (' + currentUser.roleName + ')');
        await renderAuthenticatedWorkspace();
      } catch (err) {
        showFeedback(err.message, 'error');
      } finally { button.disabled = false; }
    };

    async function renderAuthenticatedWorkspace() {
      document.getElementById('login-section').style.display = 'none';
      // Keep navigation hidden until initial data and the default tab are ready.
      // Otherwise the final dashboard switch can discard a user's early form navigation.
      document.getElementById('workspace-section').style.display = 'none';
      document.getElementById('workspace-greeting').textContent = currentUser.roleName === 'CTO' ? 'Clarity for the decisions that matter.' : currentUser.roleName === 'IT_ADMIN' ? 'Let’s keep work moving.' : 'How can AIIT help you today?';
      document.getElementById('workspace-context').textContent = currentUser.displayName + ' · ' + currentUser.roleName.replace('_', ' ') + ' · ' + currentUser.sbuCode; 

      document.getElementById('user-header-controls').innerHTML =
        '<span data-testid="active-user-badge" style="font-size:0.85rem;"><strong>' + escapeHtml(currentUser.displayName) + '</strong> (' +
        escapeHtml(currentUser.roleName) + ' • ' + escapeHtml(currentUser.sbuCode) + ')</span>' +
        '<button id="logout-btn" class="btn-secondary" type="button">Sign Out</button>';

      document.getElementById('logout-btn').onclick = async () => {
        try { await apiFetch('/api/auth/logout', { method: 'POST' }); }
        catch (error) { showFeedback('Sign out failed: ' + error.message + ' Your session is still active; retry sign out.', 'error'); return; }
        localStorage.removeItem('itsupport_token');
        authToken = ''; csrfToken = ''; sessionEpoch++;
        currentUser = null;
        await initAuth();
      };

      const isAdminOrCto = currentUser.roleName === 'IT_ADMIN' || currentUser.roleName === 'CTO';
      document.getElementById('tab-btn-approvals').style.display = isAdminOrCto ? 'inline-block' : 'none';
      document.getElementById('tab-btn-cto').style.display = isAdminOrCto ? 'inline-block' : 'none';
      document.getElementById('tab-btn-audit').style.display = isAdminOrCto ? 'inline-block' : 'none';

      const catRes = await apiFetch('/api/catalog');
      catalogCategories = catRes.categories;
      document.getElementById('ticket-category').innerHTML = catalogCategories.map(c =>
        '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + (c.aiEligible ? ' (AI Auto-Triage Eligible)' : ' (Approval/IT Gated)') + '</option>'
      ).join('');

      await refreshAllData();
      if (typeof setupWorkspace === 'function') setupWorkspace();
      switchTab('dashboard');
      document.getElementById('workspace-section').style.display = 'block';
      document.body.classList.add('authenticated');
    }

    async function refreshAllData() {
      const [summary, ticketsRes] = await Promise.all([
        apiFetch('/api/analytics/summary'),
        apiFetch('/api/tickets?status=' + encodeURIComponent(document.getElementById('filter-status').value) +
          '&search=' + encodeURIComponent(document.getElementById('filter-search').value) + '&severity=' + encodeURIComponent(document.getElementById('filter-severity').value) + '&page=' + ticketPage)
      ]);

      document.getElementById('metrics-container').innerHTML =
        '<div class="metric-card"><div class="metric-label">Accessible Tickets</div><div class="metric-value" data-testid="metric-total">' + summary.totalAccessibleTickets + '</div></div>' +
        '<div class="metric-card"><div class="metric-label">AI Proposed Resolution</div><div class="metric-value">' + summary.aiResolvedPendingConfirmation + '</div></div>' +
        '<div class="metric-card"><div class="metric-label">Assigned to IT Queue</div><div class="metric-value">' + summary.assignedToIT + '</div></div>' +
        '<div class="metric-card"><div class="metric-label">CTO Escalations</div><div class="metric-value" style="color:#f472b6;">' + summary.escalatedToCTO + '</div></div>';

      ticketPages = ticketsRes.pagination.totalPages;
      document.getElementById('page-label').textContent = 'Page ' + ticketPage + ' of ' + ticketPages;
      document.getElementById('previous-page').disabled = ticketPage <= 1;
      document.getElementById('next-page').disabled = ticketPage >= ticketPages;
      currentTickets = ticketsRes.items;
      if (typeof renderOverview === 'function') renderOverview(summary);
      document.getElementById('ticket-count-label').textContent = String(ticketsRes.pagination.total);
      renderTicketList();

      if (selectedTicketId) {
        await inspectTicket(selectedTicketId).catch(() => {});
      } else if (currentTickets.length > 0) {
        await inspectTicket(currentTickets[0].id).catch(() => {});
      }

      renderCtoDashboard().catch(error => showFeedback(error.message, 'error'));
    }

    function renderTicketList() {
      const container = document.getElementById('ticket-list-container');
      if (currentTickets.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">No tickets match current criteria.</p>';
        return;
      }
      container.innerHTML = currentTickets.map(t => {
        const badgeClass = t.status === 'ESCALATED_TO_CTO' ? 'badge-cto'
          : t.status === 'RESOLVED_PENDING_CONFIRMATION' || t.status === 'CLOSED' ? 'badge-resolved'
          : t.status === 'ASSIGNED_TO_IT' ? 'badge-it' : 'badge-status';
        return '<div role="button" tabindex="0" class="ticket-row ' + (t.id === selectedTicketId ? 'selected' : '') + '" data-ticket-id="' + escapeHtml(t.id) + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem;">' +
            '<strong>' + escapeHtml(t.ticketNumber) + '</strong>' +
            '<span class="badge ' + badgeClass + '">' + escapeHtml(t.status) + '</span>' +
          '</div>' +
          '<div style="font-weight:600;font-size:0.92rem;">' + escapeHtml(t.title) + '</div>' +
          '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.25rem;">' +
            'SBU: ' + escapeHtml(t.sbuCode) + ' • Severity: ' + escapeHtml(t.severity) + ' • Requester: ' + escapeHtml(t.requesterName) +
          '</div>' +
        '</div>';
      }).join('');

      container.querySelectorAll('.ticket-row').forEach(el => {
        el.onclick = () => inspectTicket(el.getAttribute('data-ticket-id')).catch(error => showFeedback(error.message, 'error'));
        el.onkeydown = e => { if(e.key === 'Enter' || e.key === ' ') {e.preventDefault();el.click();} };
      });
    }

    async function inspectTicket(ticketId) {
      selectedTicketId = ticketId;
      renderTicketList();
      const detail = await apiFetch('/api/tickets/' + encodeURIComponent(ticketId));
      if (selectedTicketId !== ticketId) return; // discard superseded detail requests
      const t = detail.ticket;
      const box = document.getElementById('ticket-detail-container');

      let actionsHtml = '';
      if (t.status === 'RESOLVED_PENDING_CONFIRMATION' && (t.requesterId === currentUser.id || currentUser.roleName === 'IT_ADMIN' || currentUser.roleName === 'CTO')) {
        actionsHtml += '<button class="btn-success" id="btn-confirm-close" type="button">Confirm Resolution & Close</button> ';
        actionsHtml += '<button class="btn-warning" id="btn-reopen-it" type="button">Unresolved — Route to IT Admin</button> ';
      }
      if ((currentUser.roleName === 'IT_ADMIN' || currentUser.roleName === 'CTO') && ['ASSIGNED_TO_IT', 'IN_PROGRESS'].includes(t.status)) {
        if (t.status === 'ASSIGNED_TO_IT') actionsHtml += '<button class="btn-primary" id="btn-start-progress" type="button">Start IT Progress</button> ';
        actionsHtml += '<button class="btn-success" id="btn-it-resolve" type="button">Propose Resolution</button> ';
      }
      if ((currentUser.roleName === 'IT_ADMIN' || currentUser.roleName === 'CTO') && t.status !== 'ESCALATED_TO_CTO' && t.status !== 'CLOSED') {
        actionsHtml += '<button class="btn-danger" id="btn-escalate-cto" type="button">Escalate to CTO</button>';
      }
      if (currentUser.roleName === 'CTO' && t.status === 'ESCALATED_TO_CTO') {
        actionsHtml += '<button class="btn-success" id="btn-cto-resolve" type="button">CTO Authorize & Resolve</button>';
      }

      box.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">' +
          '<div>' +
            '<span style="font-size:0.8rem;color:var(--text-muted);">' + escapeHtml(t.ticketNumber) + ' • ' + escapeHtml(t.sbuCode) + ' • ' + escapeHtml(t.categoryName) + '</span>' +
            '<h2 style="margin-top:0.2rem;">' + escapeHtml(t.title) + '</h2>' +
          '</div>' +
          '<span class="badge badge-status" data-testid="detail-ticket-status">' + escapeHtml(t.status) + '</span>' +
        '</div>' +
        '<p style="margin:0.75rem 0;font-size:0.92rem;">' + escapeHtml(t.description) + '</p>' +
        (t.aiSuggestedFix ? '<div class="ai-box" data-testid="ai-decision-box"><strong>' + escapeHtml(t.aiSummary || 'AI Evaluation') + '</strong>\\n\\n' + escapeHtml(t.aiSuggestedFix) + '</div>' : '') +
        (t.escalationReason ? '<div class="alert-error"><strong>Escalation / Routing Reason:</strong> ' + escapeHtml(t.escalationReason) + '</div>' : '') +
        '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin:1rem 0;">' + actionsHtml + '</div>' +
        '<h3 style="font-size:0.95rem;margin-top:1.25rem;margin-bottom:0.5rem;">State Transition & Audit Event History</h3>' +
        '<div>' + detail.events.map(ev =>
          '<div class="timeline-item">' +
            '<strong>' + escapeHtml(ev.eventType) + '</strong> ' +
            (ev.fromStatus ? '(' + escapeHtml(ev.fromStatus) + ' &rarr; ' + escapeHtml(ev.toStatus) + ')' : '') +
            '<div style="color:var(--text-muted);font-size:0.76rem;">By ' + escapeHtml(ev.actorName || 'System') + ' at ' + new Date(ev.createdAt).toLocaleTimeString() + '</div>' +
          '</div>'
        ).join('') + '</div>';

      if (typeof renderTicketExtras === 'function') renderTicketExtras(detail);

      const bindTransition = (btnId, targetStatus, notesPrompt) => {
        const el = document.getElementById(btnId);
        if (!el) return;
        el.onclick = async () => {
          try {
            await apiFetch('/api/tickets/' + encodeURIComponent(t.id) + '/transition', {
              method: 'POST',
              body: JSON.stringify({ status: targetStatus, notes: notesPrompt })
            });
            showFeedback('Ticket transitioned to ' + targetStatus);
            await refreshAllData();
          } catch (err) {
            showFeedback(err.message, 'error');
          }
        };
      };

      bindTransition('btn-confirm-close', 'CLOSED', 'Employee confirmed resolution.');
      bindTransition('btn-reopen-it', 'REOPENED', 'Issue persists; requesting human IT Administrator support.');
      bindTransition('btn-start-progress', 'IN_PROGRESS', 'IT Administrator began active investigation.');
      bindTransition('btn-it-resolve', 'RESOLVED_PENDING_CONFIRMATION', 'Resolved by IT Administrator; awaiting requester confirmation.');
      bindTransition('btn-cto-resolve', 'RESOLVED_PENDING_CONFIRMATION', 'CTO authorized emergency resolution and sign-off.');

      const escBtn = document.getElementById('btn-escalate-cto');
      if (escBtn) {
        escBtn.onclick = async () => {
          try {
            await apiFetch('/api/tickets/' + encodeURIComponent(t.id) + '/escalate-cto', {
              method: 'POST',
              body: JSON.stringify({ reason: 'Escalated by IT Administrator due to critical cross-SBU impact or policy threshold.' })
            });
            showFeedback('Ticket ' + t.ticketNumber + ' escalated to CTO Queue.');
            await refreshAllData();
          } catch (err) {
            showFeedback(err.message, 'error');
          }
        };
      }
    }

    async function renderCtoDashboard() {
      const ctoBox = document.getElementById('cto-escalation-container');
      if (!ctoBox) return;
      if (!currentUser || !['IT_ADMIN', 'CTO'].includes(currentUser.roleName)) return;
      const data = await apiFetch('/api/tickets?status=ESCALATED_TO_CTO&pageSize=100');
      const escalated = data.items;
      if (escalated.length === 0) {
        ctoBox.innerHTML = '<p style="color:var(--text-muted);">No active CTO escalations.</p>';
        return;
      }
      ctoBox.innerHTML = '<table><thead><tr><th>Ticket</th><th>SBU</th><th>Severity</th><th>Title</th><th>Escalation Reason</th></tr></thead><tbody>' +
        escalated.map(t =>
          '<tr data-testid="cto-escalated-row">' +
            '<td><strong>' + escapeHtml(t.ticketNumber) + '</strong></td>' +
            '<td>' + escapeHtml(t.sbuCode) + '</td>' +
            '<td><span class="badge badge-cto">' + escapeHtml(t.severity) + '</span></td>' +
            '<td>' + escapeHtml(t.title) + '</td>' +
            '<td>' + escapeHtml(t.escalationReason || '') + '</td>' +
          '</tr>'
        ).join('') + '</tbody></table>';
    }

    document.getElementById('create-ticket-form').onsubmit = async (e) => {
      e.preventDefault();
      const submitButton = document.getElementById('submit-ticket-btn');
      submitButton.disabled = true;
      try {
        const res = await apiFetch('/api/tickets', {
          method: 'POST',
          body: JSON.stringify({
            serviceCategoryId: document.getElementById('ticket-category').value,
            title: document.getElementById('ticket-title').value,
            severity: document.getElementById('ticket-severity').value,
            description: document.getElementById('ticket-description').value,
          })
        });
        document.getElementById('ticket-title').value = '';
        document.getElementById('ticket-description').value = '';
        selectedTicketId = res.ticket.id;
        showFeedback('Created ' + res.ticket.ticketNumber + ' -> Status: ' + res.ticket.status);
        switchTab('tickets');
        await refreshAllData();
      } catch (err) {
        showFeedback(err.message, 'error');
      } finally { submitButton.disabled = false; }
    };

    document.getElementById('refresh-tickets-btn').onclick = () => { ticketPage = 1; refreshAllData().catch(error => showFeedback(error.message, 'error')); };

    async function loadAssetsTab() {
      const data = await apiFetch('/api/assets');
      const box = document.getElementById('assets-container');
      if (!data.items.length) { box.innerHTML = '<p class="empty-state">No equipment is available in your authorized inventory.</p>'; return; }
      box.innerHTML = '<table><thead><tr><th>Asset Tag</th><th>Model</th><th>Serial</th><th>Status</th><th>Handover Custody</th><th>Action</th></tr></thead><tbody>' +
        data.items.map(a =>
          '<tr>' +
            '<td><strong>' + escapeHtml(a.assetTag) + '</strong></td>' +
            '<td>' + escapeHtml(a.modelName) + '</td>' +
            '<td>' + escapeHtml(a.serialNumber) + '</td>' +
            '<td>' + escapeHtml(a.status) + '</td>' +
            '<td>' + escapeHtml(a.handoverAckStatus) + '</td>' +
            '<td>' + (a.handoverAckStatus === 'PENDING_EMPLOYEE_ACK'
              ? '<button class="btn-success btn-ack-asset" data-id="' + escapeHtml(a.id) + '" type="button">Acknowledge Custody</button>'
              : (a.handoverAckStatus === 'ACKNOWLEDGED' ? 'Acknowledged' : 'No acknowledgement pending')) + '</td>' +
          '</tr>'
        ).join('') + '</tbody></table>';

      box.querySelectorAll('.btn-ack-asset').forEach(btn => {
        btn.onclick = async () => {
          try {
          await apiFetch('/api/assets/' + encodeURIComponent(btn.getAttribute('data-id')) + '/acknowledge', { method: 'POST' });
          showFeedback('Equipment custody digitally acknowledged.');
          await loadAssetsTab();
          } catch(error) { showFeedback(error.message, 'error'); }
        };
      });
    }

    async function loadKbTab() {
      const data = await apiFetch('/api/kb');
      const term = document.getElementById('kb-search').value.toLowerCase();
      data.items = data.items.filter(k => (k.title + ' ' + k.content).toLowerCase().includes(term));
      document.getElementById('kb-container').innerHTML = data.items.map(k =>
        '<div style="border-bottom:1px solid var(--border);padding:0.85rem 0;">' +
          '<h3>' + escapeHtml(k.title) + '</h3>' +
          '<p style="white-space:pre-wrap;color:var(--text-main);font-size:0.88rem;margin-top:0.35rem;">' + escapeHtml(k.content) + '</p>' +
        '</div>'
      ).join('') || '<p class="empty-state">No approved articles match your search.</p>';
    }

    async function loadApprovalsTab() {
      const data = await apiFetch('/api/approvals');
      const box = document.getElementById('approvals-container');
      if (!data.items.length) { box.innerHTML = '<p class="empty-state">No approval requests are waiting for review.</p>'; return; }
      box.innerHTML = '<table><thead><tr><th>Ticket</th><th>Action Type</th><th>Required Role</th><th>Justification</th><th>Status</th><th>Decision</th></tr></thead><tbody>' +
        data.items.map(a =>
          '<tr>' +
            '<td>' + escapeHtml(a.ticketNumber) + '</td>' +
            '<td>' + escapeHtml(a.actionType) + '</td>' +
            '<td><span class="badge badge-status">' + escapeHtml(a.requiredRole) + '</span></td>' +
            '<td>' + escapeHtml(a.justification) + '</td>' +
            '<td>' + escapeHtml(a.status) + '</td>' +
            '<td>' + (a.status === 'PENDING' && (a.requiredRole === currentUser.roleName || currentUser.roleName === 'CTO')
              ? '<button class="btn-success btn-decide" data-id="' + escapeHtml(a.id) + '" data-decision="APPROVED" type="button">Approve</button> ' +
                '<button class="btn-danger btn-decide" data-id="' + escapeHtml(a.id) + '" data-decision="REJECTED" type="button">Reject</button>'
              : escapeHtml(a.decisionNotes || '')) + '</td>' +
          '</tr>'
        ).join('') + '</tbody></table>';

      box.querySelectorAll('.btn-decide').forEach(btn => {
        btn.onclick = async () => {
          try {
            if (document.getElementById('approval-reason').value.trim().length < 5) throw new Error('Enter a decision justification of at least 5 characters.');
            await apiFetch('/api/approvals/' + encodeURIComponent(btn.getAttribute('data-id')) + '/decide', {
              method: 'POST',
              body: JSON.stringify({
                decision: btn.getAttribute('data-decision'),
                decisionNotes: document.getElementById('approval-reason').value.trim()
              })
            });
            showFeedback('Approval decision recorded.');
            await loadApprovalsTab();
          } catch (err) {
            showFeedback(err.message, 'error');
          }
        };
      });
    }

    async function loadAuditTab() {
      await loadHealth();
      const data = await apiFetch('/api/audit-logs');
      document.getElementById('audit-logs-container').innerHTML = '<table><thead><tr><th>Time</th><th>Actor</th><th>Role</th><th>Action</th><th>Resource</th></tr></thead><tbody>' +
        data.items.slice(0, 25).map(l =>
          '<tr>' +
            '<td>' + new Date(l.createdAt).toLocaleTimeString() + '</td>' +
            '<td>' + escapeHtml(l.actorEmail || 'System') + '</td>' +
            '<td>' + escapeHtml(l.actorRole || '-') + '</td>' +
            '<td><strong>' + escapeHtml(l.action) + '</strong></td>' +
            '<td>' + escapeHtml(l.resource) + '</td>' +
          '</tr>'
        ).join('') + '</tbody></table>';
    }

    async function loadPanel(loader, targetId) {
      const box = document.getElementById(targetId);
      box.innerHTML = '<p class="loading-note" role="status">Loading…</p>';
      try { await loader(); } catch(error) {
        box.innerHTML = '<div class="alert-error" role="alert">' + escapeHtml(error.message) + '</div><button class="btn-secondary" type="button">Try again</button>';
        box.querySelector('button').onclick = () => loadPanel(loader, targetId);
      }
    }

    function switchTab(tabName) {
      document.body.classList.remove('nav-open');
      document.getElementById('app-menu').setAttribute('aria-expanded', 'false');
      if (typeof onWorkspaceTab === 'function') onWorkspaceTab(tabName);
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
      });
      document.querySelectorAll('.tab-panel').forEach(p => {
        p.style.display = p.id === 'tab-' + tabName ? 'block' : 'none';
      });
      if (tabName === 'assets') loadPanel(loadAssetsTab, 'assets-container');
      if (tabName === 'kb') loadPanel(loadKbTab, 'kb-container');
      if (tabName === 'approvals') loadPanel(loadApprovalsTab, 'approvals-container');
      if (tabName === 'cto') renderCtoDashboard().catch(error => showFeedback(error.message, 'error'));
      if (tabName === 'audit') loadPanel(loadAuditTab, 'audit-logs-container');
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => switchTab(btn.getAttribute('data-tab'));
    });

    initAuth().catch(error => showFeedback(error.message, 'error'));
  </script>
  <script src="/assets/portal.js"></script>
</body>
</html>`;
}

export function createWebServer(apiTargetUrl = API_URL): http.Server {
  const target = new URL(apiTargetUrl);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Unsupported API proxy protocol');

  return http.createServer((req, res) => {
    const url = req.url || '/';

    const assets: Record<string, [string, string]> = {
      '/assets/design.css': ['design.css', 'text/css'],
      '/assets/public.js': ['public.js', 'text/javascript'],
      '/assets/portal.js': ['portal.js', 'text/javascript'],
      '/assets/grain.svg': ['grain.svg', 'image/svg+xml'],
      '/assets/atmosphere.svg': ['atmosphere.svg', 'image/svg+xml'],
    };
    const pathname = new URL(url, 'http://localhost').pathname;
    if (assets[pathname]) {
      const [file, type] = assets[pathname];
      res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
      res.end(fs.readFileSync(new URL('../public/' + file, import.meta.url)));
      return;
    }
    if (pathname === '/') {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff'});
      res.end(getLandingHtml());
      return;
    }
    if (!pathname.startsWith('/api/') && pathname !== '/app') {
      res.writeHead(404, {'Content-Type':'text/html; charset=utf-8'});
      res.end('<h1>Page not found</h1><a href="/">Return to AIIT</a>');
      return;
    }
    // Proxy /api/* requests to the backend API server
    if (url.startsWith('/api/')) {
      const proxyReq = (target.protocol === 'https:' ? https : http).request(
        {
          hostname: target.hostname,
          port: target.port,
          path: url,
          method: req.method,
          headers: req.headers,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        }
      );
      proxyReq.setTimeout(10000, () => proxyReq.destroy(new Error('Backend request timed out')));
      proxyReq.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'BAD_GATEWAY', message: 'Backend API is unavailable.' } }));
      });
      req.pipe(proxyReq, { end: true });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(getPortalHtml(''));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createWebServer();
  server.listen(WEB_PORT, '127.0.0.1', () => {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        service: 'it-support-web',
        event: 'WEB_SERVER_LISTENING',
        url: `http://localhost:${WEB_PORT}`,
      })
    );
  });
}
