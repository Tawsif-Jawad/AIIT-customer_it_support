import type { PrismaClient } from '@prisma/client';
import { budgetBucket, type AbuseCounter } from './abuse-control.ts';
import type { LoginFlowStore, PendingLogin } from './enterprise-auth.ts';

export async function postgresAbuseCounter(client: PrismaClient): Promise<AbuseCounter> {
  const { secret } = await client.abuseKey.findUniqueOrThrow({ where: { id: 'ingress' } });
  let sweepAt = 0;
  return {
    bucket: address => budgetBucket(secret, address),
    async take({ key, limit, seconds }) {
      const [result] = await client.$queryRaw<{ retry: number }[]>`
        INSERT INTO "AbuseBucket" (key, hits, "expiresAt")
        VALUES (${key}, 1, statement_timestamp() + ${seconds} * interval '1 second')
        ON CONFLICT (key) DO UPDATE SET
          hits = CASE WHEN "AbuseBucket"."expiresAt" <= statement_timestamp() THEN 1 ELSE LEAST("AbuseBucket".hits + 1, 100001) END,
          "expiresAt" = CASE WHEN "AbuseBucket"."expiresAt" <= statement_timestamp() THEN statement_timestamp() + ${seconds} * interval '1 second' ELSE "AbuseBucket"."expiresAt" END
        RETURNING CASE WHEN hits > ${limit} THEN GREATEST(1, ceil(extract(epoch FROM ("expiresAt" - clock_timestamp()))))::int ELSE 0 END AS retry`;
      if (Date.now() >= sweepAt) {
        sweepAt = Date.now() + 60000;
        await client.$executeRaw`
          DELETE FROM "AbuseBucket" WHERE key IN (
            SELECT key FROM "AbuseBucket" WHERE "expiresAt" <= clock_timestamp()
            ORDER BY "expiresAt" LIMIT 2048 FOR UPDATE SKIP LOCKED
          )`;
      }
      return result.retry;
    },
  };
}

export function postgresLoginFlows(client: PrismaClient): LoginFlowStore {
  return {
    async put(id, flow) {
      await client.$transaction([
        client.$executeRaw`DELETE FROM "OidcLoginFlow" WHERE "expiresAt" <= clock_timestamp()`,
        client.$executeRaw`
          INSERT INTO "OidcLoginFlow" (id, state, nonce, verifier, "expiresAt", "previousDigest")
          VALUES (${id}, ${flow.state}, ${flow.nonce}, ${flow.verifier}, clock_timestamp() + interval '5 minutes', ${flow.previousDigest ?? null})`,
      ]);
    },
    async consume(id) {
      const [row] = await client.$queryRaw<(Omit<PendingLogin, 'expiresAt'> & { expiresAt: Date; valid: boolean })[]>`
        DELETE FROM "OidcLoginFlow" WHERE id = ${id}
        RETURNING state, nonce, verifier, "expiresAt", "previousDigest", "expiresAt" > clock_timestamp() AS valid`;
      return row?.valid ? { ...row, expiresAt: row.expiresAt.getTime() } : undefined;
    },
  };
}
