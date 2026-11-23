# Security isolation

The SMTP adapter retains its disposable PostgreSQL configuration gate, literal loopback destination, certificate and hostname verification, and one synthetic recipient. A partial credential pair fails closed. The capture sink has no relay path. Credentials are generated per run and are excluded from output. No production credential or destination is used.

The Keycloak profile requests an internal bridge, drops capabilities, disables plain HTTP, mounts the realm and generated TLS files read-only, and publishes no ports. The authorized smoke verifies the Docker network's internal setting and absence of an IPv4 default route. This is bounded routing evidence. External DNS resolution, IPv6 routes, host networking variants and an active egress probe were not verified. Container configuration must not be used as proof of OS-wide isolation.

The smoke uses a unique Compose project and removes that project's volumes and containers during cleanup. There is no Docker socket mount or privileged container. The native runner continues to use its owned disposable cluster and local services.

## Remediation implementation

The federation profile uses the existing internal Docker bridge, publishes no container ports and forwards TLS only through a loopback fixture process for Chromium and AIIT. It adds IPv4, IPv6 and UDP DNS probes to reserved documentation addresses. This evidence would cover those exact routes and does not establish behavior of every embedded resolver or runtime configuration. A current vulnerability scan for both runtime images remains required.

The checksum-pinned Grype 0.122.1 job scanned both images. Its first completed scan failed the High threshold for both, including Critical findings in the Keycloak OpenJDK and Debian Python packages. The scanner showed no fix for those example findings. This gate remains failed until a supported patched image passes the unchanged scan threshold. [Hosted scanner output](https://github.com/Tawsif-Jawad/AIIT-customer_it_support/actions/runs/45108360906/job/137474760026)
