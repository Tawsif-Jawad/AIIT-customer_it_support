# DEF-007 and DEF-008

| Finding | Reproduced failure in Day 5 | Day 6 verification |
| --- | --- | --- |
| DEF-007 | A real web proxy collapsed different forwarded identities into one 250-per-minute socket-address bucket. Its API retained seen keys in process memory. | The real web proxy strips public forwarding headers. An authenticated proxy gets separate client budgets, including IPv6. A direct caller on the same loopback IP without the hop secret cannot bypass its bucket. Independent PostgreSQL API processes share a single atomic budget. |
| DEF-008 | A caller obtained 1,024 abandoned OIDC redirects across five accelerated windows, then blocked initiation until slots expired. | Personal and global initiation budgets cap abandoned flows. Callback budgets cap repeated invalid attempts. A flow initiated on one API process completed once on another. The tests also exhausted the shared budgets and verified expiry, recovery and fail-closed database loss. |

Both fixes are verified for the tested ingress topology. The deployment must configure its real trusted peers, hop secrets and public origin before exposure. [Ingress design](04_TRUSTED_INGRESS.md)
