/**
 * Development Database Seeder
 * Resets and seeds development-only SBUs, Roles, Users, Service Categories,
 * Tickets, Knowledge Articles, Approvals, and Assets.
 */
import { EnterpriseDataStore } from '../store.ts';

const store = new EnterpriseDataStore();
const state = store.resetAndSeed();

console.log(
  JSON.stringify(
    {
      event: 'DEVELOPMENT_SEED_COMPLETED',
      counts: {
        sbus: state.sbus.length,
        roles: state.roles.length,
        users: state.users.length,
        serviceCategories: state.serviceCategories.length,
        tickets: state.tickets.length,
        knowledgeArticles: state.knowledgeArticles.length,
        assets: state.assets.length,
        approvals: state.approvals.length,
      },
    },
    null,
    2
  )
);
