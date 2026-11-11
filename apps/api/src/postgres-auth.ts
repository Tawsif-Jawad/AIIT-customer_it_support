import type { Prisma } from '@prisma/client';
import { SessionPersistenceError, type AuthenticationRepository, type EnterpriseSession } from './enterprise-auth.ts';
import { applicationUser } from './postgres-store.ts';

/** The API owns the surrounding transaction and commits the login audit before
 * releasing the response containing the new cookie. */
export class PostgresAuthenticationRepository implements AuthenticationRepository {
  private readonly transaction: () => Prisma.TransactionClient;

  constructor(transaction: () => Prisma.TransactionClient) { this.transaction = transaction; }

  async resolveIdentity(issuer: string, subject: string) {
    const user = await this.transaction().user.findUnique({
      where: { oidcSubject: subject },
      include: { role: true, sbu: true },
    });
    return user?.oidcIssuer === issuer && user.isActive && user.role.name !== 'SYSTEM_SERVICE'
      ? applicationUser(user) : null;
  }

  async findSession(digest: string): Promise<EnterpriseSession | null> {
    const row = await this.transaction().authSession.findUnique({
      where: { id: digest, kind: 'oidc', expiresAt: { gt: new Date() } },
    });
    if (!row?.issuer || !row.subject) return null;
    return { id: row.id, userId: row.userId, expiresAt: row.expiresAt.getTime(), kind: 'oidc', issuer: row.issuer, subject: row.subject };
  }

  async establish(session: EnterpriseSession, previousDigest?: string) {
    const tx = this.transaction();
    try {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${session.userId} FOR UPDATE`;
      if (previousDigest) await tx.authSession.deleteMany({ where: { id: previousDigest, kind: 'oidc' } });
      await tx.authSession.create({ data: { ...session, expiresAt: new Date(session.expiresAt) } });
    } catch {
      throw new SessionPersistenceError();
    }
  }

  async revoke(digest: string) {
    await this.transaction().authSession.deleteMany({ where: { id: digest, kind: 'oidc' } });
  }
}
