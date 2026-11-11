import { createHmac, randomBytes } from 'node:crypto';

interface Budget { key: string; limit: number; seconds: number }
export interface AbuseCounter {
  bucket(address: string): string;
  take(budget: Budget): Promise<number>;
}

function positive(env: NodeJS.ProcessEnv, key: string, fallback: number, max: number) {
  const value = env[key] ?? String(fallback);
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || parsed < 1 || parsed > max) throw new Error('INVALID_ABUSE_BUDGET');
  return parsed;
}

export function abusePolicy(env = process.env) {
  return {
    inFlight: positive(env, 'API_MAX_IN_FLIGHT', 128, 2048),
    general: positive(env, 'API_RATE_LIMIT', 250, 100000),
    window: positive(env, 'API_RATE_WINDOW_SECONDS', 60, 3600),
    login: positive(env, 'OIDC_LOGIN_RATE_LIMIT', 12, 128),
    globalLogin: positive(env, 'OIDC_GLOBAL_LOGIN_RATE_LIMIT', 128, 256),
    callback: positive(env, 'OIDC_CALLBACK_RATE_LIMIT', 30, 1000),
  };
}

export function budgetBucket(secret: string, address: string) {
  let identity = address;
  if (address.includes(':')) {
    const [left, right] = address.split('::');
    const leading = left ? left.split(':') : [];
    const trailing = right ? right.split(':') : [];
    const groups = right === undefined ? leading : [...leading, ...Array(8 - leading.length - trailing.length).fill('0'), ...trailing];
    identity = groups.slice(0, 4).map(group => parseInt(group, 16).toString(16)).join(':') + '/64';
  }
  return createHmac('sha256', secret).update(identity).digest('hex').slice(0, 5);
}

export class LocalAbuseCounter implements AbuseCounter {
  private buckets = new Map<string, { count: number; until: number }>();
  private sweepAt = 0;
  private secret = randomBytes(32).toString('hex');

  bucket(address: string) { return budgetBucket(this.secret, address); }

  async take({ key, limit, seconds }: Budget) {
    const now = Date.now();
    if (now >= this.sweepAt) {
      for (const [id, bucket] of this.buckets) if (bucket.until <= now) this.buckets.delete(id);
      this.sweepAt = now + 1000;
    }
    const current = this.buckets.get(key);
    if (current && current.until > now) {
      if (current.count >= limit) return Math.ceil((current.until - now) / 1000);
      current.count++;
    } else {
      if (!current && this.buckets.size >= 16384) return 1;
      this.buckets.set(key, { count: 1, until: now + seconds * 1000 });
    }
    return 0;
  }
}

export async function checkAbuse(counter: AbuseCounter, policy: ReturnType<typeof abusePolicy>, address: string, pathname: string) {
  // A truncated digest assigns bounded buckets without storing literal addresses.
  const key = counter.bucket(address);
  const general = await counter.take({ key: 'api:' + key, limit: policy.general, seconds: policy.window });
  if (general) return general;
  if (pathname === '/api/auth/oidc/login') {
    const personal = await counter.take({ key: 'login:' + key, limit: policy.login, seconds: 300 });
    return personal || counter.take({ key: 'login:global', limit: policy.globalLogin, seconds: 300 });
  }
  if (pathname === '/api/auth/oidc/callback') {
    return counter.take({ key: 'callback:' + key, limit: policy.callback, seconds: 60 });
  }
  return 0;
}
