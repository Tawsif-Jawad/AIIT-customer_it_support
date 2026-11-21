import {defineConfig} from '@playwright/test';
const postgres = process.env.AIIT_E2E_POSTGRES === 'true';

const baseURL = 'http://127.0.0.1:' + Number(process.env.AIIT_E2E_PORT ?? 4173);

export default defineConfig({
 outputDir: postgres ? 'test-results/postgres' : 'test-results/default',
 testDir:'./tests/e2e',timeout:30000,workers:1,retries:0,
 use:{baseURL,trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:postgres ? undefined : {command:'node scripts/e2e-server.ts',url:baseURL+'/app',reuseExistingServer:false,timeout:30000},
});
