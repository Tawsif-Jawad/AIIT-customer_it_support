/** Literal loopback only. Hostnames can be resolved through an office DNS or proxy. */
export function isLoopbackDestination(url: URL): boolean {
  return ['127.0.0.1', '[::1]'].includes(url.hostname) && !url.username && !url.password;
}

export function disposablePostgresUrl(url: URL): boolean {
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
      url.username !== 'aiit_test' || url.password || !url.port || url.hash ||
      !/^\/aiit_test(?:_[a-z0-9_]+)?$/.test(url.pathname)) return false;

  const allowed = new Set(['connect_timeout', 'connection_limit']);
  for (const [name, value] of url.searchParams) {
    if (!allowed.delete(name) || !/^[1-9][0-9]{0,3}$/.test(value)) return false;
  }
  return true;
}
