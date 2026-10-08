import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';

/**
 * Opaque session tokens + CSRF tokens (PLAN §21: nothing in localStorage).
 * Token format: `<id>.<secret>` where only sha256(secret) is stored.
 * Cookie value: `<id>.<secret>.<csrfToken>` — csrf rotates per login, token
 * secret stays opaque server-side via its hash.
 */

export interface ParsedSessionCookie {
  sessionId: string;
  secret: string;
  csrfToken: string;
}

export function newSessionToken(): { sessionId: string; secret: string; csrfToken: string } {
  return {
    sessionId: randomBytes(16).toString('hex'),
    secret: randomBytes(32).toString('hex'),
    csrfToken: randomBytes(32).toString('hex'),
  };
}

/** sha256 HMAC of the token secret with AUTH_SECRET — the stored value. */
export function hashTokenSecret(secret: string): string {
  return createHmac('sha256', env.authSecret).update(secret).digest('hex');
}

export function buildCookieValue(sessionId: string, secret: string, csrfToken: string): string {
  return `${sessionId}.${secret}.${csrfToken}`;
}

export function parseCookieValue(raw: string | undefined): ParsedSessionCookie | null {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) return null;
  const [sessionId, secret, csrfToken] = parts;
  return { sessionId, secret, csrfToken };
}

/** Constant-time session lookup guard (prevents timing oracle on tokenHash). */
export function safeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}
