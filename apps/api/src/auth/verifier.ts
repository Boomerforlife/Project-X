import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AppConfig } from '../config';
import type { AuthUser, AuthVerifier } from '../deps';

function toUser(payload: JWTPayload): AuthUser | null {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
  if (payload['role'] !== 'authenticated') return null;
  const email = typeof payload['email'] === 'string' ? payload['email'] : null;
  const isAnonymous = payload['is_anonymous'] === true;
  const claims = { ...payload, sub: payload.sub, role: 'authenticated' as const } as AuthUser['claims'];
  if (email) claims.email = email;
  if (isAnonymous) claims.is_anonymous = true;
  return { id: payload.sub, email, isAnonymous, claims };
}

/** Builds the verifier for AUTH_MODE jwks | hs256 | test. Never throws from verify(). */
export function createAuthVerifier(config: AppConfig): AuthVerifier {
  if (config.AUTH_MODE === 'jwks') {
    const base = (config.SUPABASE_URL ?? '').replace(/\/+$/, '');
    const jwks = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
    const issuer = config.jwtIssuer ?? undefined;
    return {
      async verify(token) {
        try {
          const { payload } = await jwtVerify(token, jwks, { audience: 'authenticated', ...(issuer ? { issuer } : {}) });
          return toUser(payload);
        } catch {
          return null;
        }
      },
    };
  }
  const secret = new TextEncoder().encode(config.AUTH_MODE === 'hs256' ? (config.SUPABASE_JWT_SECRET ?? '') : (config.TEST_JWT_SECRET ?? ''));
  const issuer = config.AUTH_MODE === 'hs256' ? (config.jwtIssuer ?? undefined) : undefined;
  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, secret, {
          algorithms: ['HS256'],
          audience: 'authenticated',
          ...(issuer ? { issuer } : {}),
        });
        return toUser(payload);
      } catch {
        return null;
      }
    },
  };
}
