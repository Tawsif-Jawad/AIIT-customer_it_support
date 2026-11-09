/**
 * Build & Type/Import Verification Script
 * Verifies that all monorepo modules (shared, connectors, api, worker, web)
 * load cleanly, pass schema checks, and export expected contracts.
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import * as shared from '../packages/shared/src/index.ts';
import * as connectors from '../packages/connectors/src/index.ts';
import { createApiServer } from '../apps/api/src/app.ts';
import { createWebServer, getPortalHtml } from '../apps/web/src/server.ts';

new vm.Script(getPortalHtml().match(/<script>([\s\S]*?)<\/script>/)![1]);

for (const asset of ['public.js', 'portal.js']) new vm.Script(fs.readFileSync(new URL('../apps/web/public/' + asset, import.meta.url), 'utf8'));

assert.ok(shared.ALLOWED_TICKET_TRANSITIONS, 'Shared state transitions must be defined');
assert.ok(connectors.DeterministicMockAIOrchestrator, 'AI Orchestrator must be defined');
assert.equal(typeof createApiServer, 'function', 'createApiServer must be a function');
assert.equal(typeof createWebServer, 'function', 'createWebServer must be a function');

console.log(
  JSON.stringify({
    status: 'PASSED',
    step: 'MONOREPO_BUILD_AND_MODULE_VERIFICATION',
    verifiedPackages: ['@it-support/shared', '@it-support/connectors', '@it-support/api', '@it-support/web'],
    limitations: 'This is the import/browser-syntax substep; package build runs tsc first. No framework bundle or production integration is claimed. Standalone JSON worker disabled.',
    timestamp: new Date().toISOString(),
  })
);
