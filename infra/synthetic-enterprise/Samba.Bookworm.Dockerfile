FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
RUN apt-get update && apt-get install -y --no-install-recommends samba python3-samba ldap-utils ldb-tools ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY provision-samba.py /usr/local/bin/provision-samba.py
ENTRYPOINT ["/usr/bin/python3", "/usr/local/bin/provision-samba.py"]
