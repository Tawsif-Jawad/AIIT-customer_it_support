import { timingSafeEqual } from 'node:crypto';
import { isIP, SocketAddress } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';

export function canonicalIp(value: string): string {
  const family = isIP(value);
  if (!family || value.includes('%')) throw new Error('INVALID_CLIENT_ADDRESS');
  if (family === 4) return value;
  const address = new SocketAddress({ address: value, family: 'ipv6' }).address;
  if (address.startsWith('::ffff:') && isIP(address.slice(7)) === 4) return address.slice(7);
  const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(address);
  if (!mapped) return address;
  const [high, low] = mapped.slice(1).map(part => parseInt(part, 16));
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

export function trustedPeers(value?: string): ReadonlySet<string> {
  try { return new Set(value === undefined || value === '' ? [] : value.split(',').map(ip => canonicalIp(ip.trim()))); }
  catch { throw new Error('INVALID_TRUSTED_PROXY_IPS'); }
}

export function clientAddress(remote: string | undefined, headers: IncomingHttpHeaders, trusted: ReadonlySet<string>) {
  const peer = canonicalIp(remote ?? '');
  if (!trusted.has(peer)) return peer;
  const forwarded = headers.forwarded;
  const legacy = headers['x-forwarded-for'];
  if (forwarded === undefined && legacy === undefined) return peer;
  const raw = forwarded ?? legacy;
  if (typeof raw !== 'string' || raw.length > 1024 || (forwarded !== undefined && legacy !== undefined)) {
    throw new Error('INVALID_FORWARDING_CHAIN');
  }
  const entries = raw.split(',');
  if (entries.length > 8) throw new Error('INVALID_FORWARDING_CHAIN');
  const chain = entries.map(entry => {
    if (!forwarded) return canonicalIp(entry.trim());
    // Supported Forwarded profile uses a single for= per element. Scheme and
    // authority come from deployment configuration, never forwarding headers.
    const fields = entry.split(';').map(field => field.trim());
    const forFields = fields.filter(field => /^for=/i.test(field));
    if (forFields.length !== 1) throw new Error('INVALID_FORWARDING_CHAIN');
    const value = forFields[0].slice(4);
    const ip = /^(?:"\[([^\]]+)\]"|"(\d+\.\d+\.\d+\.\d+)"|(\d+\.\d+\.\d+\.\d+))$/.exec(value);
    if (!ip) throw new Error('INVALID_FORWARDING_CHAIN');
    return canonicalIp(ip[1] ?? ip[2] ?? ip[3]);
  });
  let client = peer;
  for (let index = chain.length - 1; index >= 0 && trusted.has(client); index--) client = chain[index];
  return client;
}

export function configuredOrigin(value?: string) {
  if (value === undefined) return undefined;
  const url = new URL(value);
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !localHttp) || url.origin !== value) throw new Error('INVALID_INGRESS_ORIGIN');
  return url.origin;
}

export function directOrigin(host: string | undefined, secure: boolean) {
  if (!host || !/^(?:[a-z0-9.-]+|\[[\da-f:]+\])(?::\d{1,5})?$/i.test(host)) return undefined;
  try {
    const url = new URL(`${secure ? 'https' : 'http'}://${host}`);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? url.origin : undefined;
  }
  catch { return undefined; }
}

export const proxyTokenHeader = 'x-aiit-ingress-token';

export function validateProxyToken(token?: string) {
  if (token !== undefined && !/^[a-zA-Z0-9_-]{32,128}$/.test(token)) {
    throw new Error('INVALID_INGRESS_PROXY_TOKEN');
  }
  return token;
}

export function authenticatedForwarders(peers: string | undefined, token: string | undefined) {
  const trusted = trustedPeers(peers);
  const secret = validateProxyToken(token);
  if (trusted.size && !secret) throw new Error('TRUSTED_PROXY_REQUIRES_TOKEN');
  const untrusted = new Set<string>();
  return {
    enabled: trusted.size > 0,
    resolve(remote: string | undefined, headers: IncomingHttpHeaders) {
      const supplied = headers[proxyTokenHeader];
      const authenticated = !!secret && typeof supplied === 'string' &&
        Buffer.byteLength(supplied) === Buffer.byteLength(secret) &&
        timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
      return clientAddress(remote, headers, authenticated ? trusted : untrusted);
    },
  };
}
