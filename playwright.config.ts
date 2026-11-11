import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e',timeout:30000,workers:1,retries:0,
 use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:process.env.AIIT_E2E_POSTGRES === 'true' ? undefined : {command:'node scripts/e2e-server.ts',url:'http://127.0.0.1:4173/app',reuseExistingServer:false,timeout:30000},
});
