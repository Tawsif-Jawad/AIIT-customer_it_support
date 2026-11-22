# Synthetic dataset

| Resource | Initial count |
|---|---:|
| Alder, Birch, Cedar, Elm, Maple and Willow SBUs | 6 |
| Employee records, including 3 disabled accounts | 120 |
| IT administrators | 8 |
| CTO | 1 |
| Assets | 180 |
| Historical and active tickets | 240 |
| Ticket events | 240 |
| Approval requests | 40 |
| Sessions, notifications and delivery jobs | 0 |

Fixed timestamps and index-based generation give repeatable IDs, names, reserved mail addresses, roles, subjects, OUs, groups, fictional departments, responsibilities and building locations. The OIDC issuer URL is assigned per instance. The inventory includes laptops, desktops, monitors, printers, routers, access points and peripherals. Some assets have same-SBU assigned custody; the rest are available. Tickets vary in severity, state, assignee and SLA history. Ten CTO approval fixtures are expired. Pending fixtures for demos have a deterministic far-future expiry. The generator's default profile is fixed in source for reproducibility.

Startup uses the existing non-overwriting importer, validates references and checksum readback, and seeds no outbound messages. Interactive reset shuts down the owned disposable cluster and creates a new one.
