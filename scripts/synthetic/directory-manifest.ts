import { officeDataset } from './dataset.ts';

const { profiles, snapshot } = officeDataset();
const manifest = {
  realm: 'OFFICE.EXAMPLE.TEST',
  organizationalUnits: snapshot.sbus.map(sbu => sbu.code),
  groups: [...new Set(profiles.flatMap(profile => profile.groups))].sort(),
  accounts: profiles.map(({ user, employeeNumber, ou, department, groups }) => ({
    employeeNumber, username: user.email.split('@')[0], email: user.email, displayName: user.displayName,
    enabled: user.isActive, ou, department, groups,
  })),
};
// Offline provisioning input. Federated OIDC subjects must come from verified Keycloak tokens.
process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
