const observations = {
  internet: 'The simulated WAN uplink is down. Verify local link status and ask IT to inspect the simulated router.',
  wifi: 'The simulated access point rejects authentication. Confirm the correct SSID and ask IT to inspect the access point.',
  dns: 'The simulated resolver cannot resolve the office hostname. Compare hostname resolution with local gateway access.',
  dhcp: 'The simulated workstation has no lease. Check whether other synthetic workstations on this segment are affected.',
  vpn: 'The simulated VPN tunnel is down. Confirm local connectivity and request IT review.',
  printer: 'The simulated network printer is unavailable. Check the selected queue and printer status.',
  latency: 'The simulated LAN exhibits high latency. Record the time and affected segment for IT.',
  intermittent: 'The simulated switch link drops intermittently. Compare wired and wireless symptoms.',
} as const;

export type NetworkFault = keyof typeof observations;

export function createOfficeNetwork() {
  const active = new Set<NetworkFault>();
  return {
    fail(fault: NetworkFault) { active.add(fault); },
    repair(fault: NetworkFault) { return active.delete(fault); },
    observe(fault: NetworkFault) {
      return { component: fault, available: !active.has(fault), observation: active.has(fault) ? observations[fault] : 'Synthetic component is available.' };
    },
  };
}
