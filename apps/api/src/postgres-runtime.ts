import type { PrismaClient } from '@prisma/client';
import { createServer } from './app.ts';

export async function createPostgresApiServer(client: PrismaClient) {
  const { PostgresRequestStore } = await import('./postgres-store.ts');
  const { PostgresAuthenticationRepository } = await import('./postgres-auth.ts');
  const store = new PostgresRequestStore(client);
  return createServer(() => store, new PostgresAuthenticationRepository(() => store.transactionClient));
}

export function storageMode(env = process.env): 'json' | 'postgres' {
  const mode = env.STORAGE_MODE;
  if (!mode || mode === 'auto' || mode === 'json') return 'json';
  if (mode !== 'postgres') throw new Error('INVALID_STORAGE_MODE');
  if (env.NODE_ENV !== 'test' && env.NODE_ENV !== 'development') {
    throw new Error('POSTGRES_REQUIRES_DEVELOPMENT_OR_TEST');
  }
  return 'postgres';
}

export async function connectPostgres(env = process.env): Promise<PrismaClient> {
  if (storageMode(env) !== 'postgres') throw new Error('POSTGRES_OPT_IN_REQUIRED');
  if (env.MAIL_PROVIDER && env.MAIL_PROVIDER !== 'mock') throw new Error('MOCK_MAIL_REQUIRED');
  let url: URL;
  try { url = new URL(env.DATABASE_URL || ''); }
  catch { throw new Error('POSTGRES_DATABASE_URL_REQUIRED'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname.length < 2) {
    throw new Error('INVALID_POSTGRES_DATABASE_URL');
  }
  const { PrismaClient } = await import('@prisma/client');
  const client = new PrismaClient({ datasourceUrl: url.href });
  try {
    await client.$queryRaw`SELECT 1 FROM "AuthSession" WHERE kind IS NOT NULL LIMIT 1`;
    await client.$queryRaw`SELECT 1 FROM "NotificationJob" LIMIT 1`;
    const [guard] = await client.$queryRaw<{ enabled: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = '"User"'::regclass
          AND tgname = 'revoke_changed_identity_sessions'
          AND tgenabled IN ('O', 'A')
      ) AS enabled`;
    if (!guard?.enabled) throw new Error('POSTGRES_IDENTITY_GUARD_REQUIRED');
    return client;
  } catch {
    await client.$disconnect();
    throw new Error('POSTGRES_UNAVAILABLE_OR_SCHEMA_NOT_READY');
  }
}
