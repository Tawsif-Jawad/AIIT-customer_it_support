import { EXCEPTION_ID } from './day14-preflight.ts';
import type { ExecutionClaim } from './day14-supervisor.ts';

export type RegistryQuery = (
  sql: string, parameters: readonly string[], signal: AbortSignal,
) => Promise<readonly { consumed: boolean }[]>;

// Execute using the owner service's restricted connection to durable PostgreSQL.
export async function consumeExecution(query: RegistryQuery, claim: ExecutionClaim, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted();
  const rows = await query(
    `WITH active_exception AS MATERIALIZED (
       SELECT exception_id FROM day14_authority.exceptions
       WHERE exception_id = $4 AND revoked_at IS NULL FOR SHARE
     )
     UPDATE day14_authority.execution_claims AS claim SET consumed_at = clock_timestamp()
     FROM active_exception
     WHERE claim.exception_id = active_exception.exception_id
       AND claim.execution_id = $1 AND claim.fingerprint = $2 AND claim.expires_at = $3::timestamptz
       AND claim.consumed_at IS NULL AND claim.revoked_at IS NULL AND claim.expires_at > clock_timestamp()
     RETURNING true AS consumed`,
    [claim.id, claim.fingerprint, claim.expiresAtUtc, EXCEPTION_ID], signal,
  );
  signal.throwIfAborted();
  return rows.length === 1 && rows[0]?.consumed === true;
}
