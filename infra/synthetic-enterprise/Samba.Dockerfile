FROM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    samba-ad-dc samba-ad-provision ldap-utils ldb-tools ca-certificates \
    libc6=2.41-12+deb13u5 libc-bin=2.41-12+deb13u5 \
    zlib1g=1:1.3.dfsg+really1.3.1-1+deb13u1 \
 && apt-get purge -y --allow-remove-essential \
    python3-markdown \
    dirmngr gnupg gnupg-l10n gpg gpg-agent gpgconf gpgsm \
    bsdutils login mount util-linux \
    ncurses-bin \
 && rm -rf /var/lib/apt/lists/*
COPY provision-samba.py /usr/local/bin/provision-samba.py
ENTRYPOINT ["/usr/bin/python3", "/usr/local/bin/provision-samba.py"]
