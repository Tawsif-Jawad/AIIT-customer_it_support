/**
 * Keycloak OIDC & JWT Token Service
 * Supports Keycloak OIDC realm federation claims and development OIDC token issuance
 * with HMAC-SHA256 signatures, expiration checks, and least-privilege role/SBU claims.
 */

import crypto from 'node:crypto';
import type { RoleName, User } from '../../../packages/shared/src/index.ts';

export interface OIDCClaims {
  sub: string;
  iss: string;
  aud: string;
  email: string;
  name: string;
  role: RoleName;
  sbuId: string;
  sbuCode: string;
  iat: number;
  exp: number;
}

const DEFAULT_ISSUER = process.env.KEYCLOAK_ISSUER_URL || 'http://localhost:8080/realms/upstra-enterprise';
const DEFAULT_AUDIENCE = process.env.KEYCLOAK_CLIENT_ID || 'it-support-web';

function getSigningSecret(): string {
  return process.env.JWT_SIGNING_SECRET || 'dev-only-hmac-secret-replace-in-production-immediately';
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf-8');
}

export function issueOIDCToken(user: User, expiresInSeconds = 28800): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT', kid: 'kc-dev-realm-key-1' };
  const payload: OIDCClaims = {
    sub: user.id,
    iss: DEFAULT_ISSUER,
    aud: DEFAULT_AUDIENCE,
    email: user.email,
    name: user.displayName,
    role: user.roleName,
    sbuId: user.sbuId,
    sbuCode: user.sbuCode,
    iat: nowSec,
    exp: nowSec + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', getSigningSecret())
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}

export function verifyOIDCToken(token: string): OIDCClaims | null {
  if (process.env.NODE_ENV === 'production' || (process.env.AUTH_MODE && process.env.AUTH_MODE !== 'dev_oidc')) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, providedSignature] = parts;
    const header = JSON.parse(base64UrlDecode(encodedHeader));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = crypto
      .createHmac('sha256', getSigningSecret())
      .update(signingInput)
      .digest('base64url');

    const sigBuf = Buffer.from(providedSignature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const claims = JSON.parse(base64UrlDecode(encodedPayload)) as OIDCClaims;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(claims.exp) || claims.exp <= nowSec ||
        !Number.isFinite(claims.iat) || claims.iat > nowSec ||
        claims.iss !== DEFAULT_ISSUER || claims.aud !== DEFAULT_AUDIENCE ||
        typeof claims.sub !== 'string' || !claims.sub) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
