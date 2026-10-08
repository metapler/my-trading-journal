import type { PrismaClient } from '../../generated/prisma/client';
import { getPrisma } from '../../config/prisma';
import { env } from '../../config/env';
import { getTestClientOverride } from '../portfolio/service';
import { ApiError } from '../../utils/apiError';
import { hashPassword, verifyPassword } from './password';
import { buildCookieValue, hashTokenSecret, newSessionToken, safeEqualHex } from './tokens';
import type { LoginInput, RegisterInput } from './validation';

// Reuse the portfolio test-client override so auth, asset, and portfolio
// services always share one client in tests.
function db(): PrismaClient {
  return getTestClientOverride() ?? getPrisma();
}

export interface SessionCredentials {
  cookieValue: string;
  csrfToken: string;
  expiresAt: Date;
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + env.sessionTtlDays * 24 * 60 * 60_000);
}

function toPublicUser(u: { id: string; email: string; createdAt: Date }) {
  return { id: u.id, email: u.email, createdAt: u.createdAt.toISOString() };
}

export async function register(input: RegisterInput) {
  const existing = await db().user.findUnique({ where: { email: input.email } });
  // Same message as login: no account-enumeration oracle.
  if (existing) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
  const user = await db().user.create({
    data: { email: input.email, passwordHash: await hashPassword(input.password) },
  });
  const creds = await createSession(user.id);
  return { user: toPublicUser(user), ...creds };
}

export async function login(input: LoginInput) {
  const user = await db().user.findUnique({ where: { email: input.email } });
  // Uniform failure: timing + message reveal nothing about account existence.
  const ok = user ? await verifyPassword(input.password, user.passwordHash) : false;
  if (!user || !ok) {
    // Burn comparable time for unknown accounts (hash once, discard).
    if (!user) await hashPassword('dummy-fallback-password-000000');
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }
  const creds = await createSession(user.id);
  return { user: toPublicUser(user), ...creds };
}

async function createSession(userId: string): Promise<SessionCredentials> {
  const { sessionId, secret, csrfToken } = newSessionToken();
  const expiresAt = sessionExpiry();
  await db().session.create({
    data: { id: sessionId, userId, tokenHash: hashTokenSecret(secret), csrfToken, expiresAt },
  });
  return { cookieValue: buildCookieValue(sessionId, secret, csrfToken), csrfToken, expiresAt };
}

/** Resolve the current user from a raw cookie value. Null = anonymous. */
export async function resolveSession(cookieValue: string | undefined): Promise<{ id: string; email: string } | null> {
  if (!cookieValue) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) return null;
  const [sessionId] = parts;
  const session = await db().session.findUnique({
    where: { id: sessionId },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    // Lazy cleanup of expired sessions.
    await db().session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

/** Constant-time CSRF check for cookie-authenticated mutations. */
export async function verifyCsrf(cookieValue: string | undefined, headerToken: string | undefined): Promise<boolean> {
  if (!cookieValue || !headerToken) return false;
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return false;
  const [sessionId, , cookieCsrf] = parts;
  // Cookie and header must carry the same hex token (constant-time), then
  // the session row must agree (rotated sessions fail closed).
  if (!safeEqualHex(cookieCsrf, headerToken)) return false;
  const session = await db().session.findUnique({ where: { id: sessionId }, select: { csrfToken: true } });
  if (!session) return false;
  return session.csrfToken === headerToken && session.csrfToken === cookieCsrf;
}

export async function logout(cookieValue: string | undefined): Promise<void> {
  if (!cookieValue) return;
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return;
  await db().session.delete({ where: { id: parts[0] } }).catch(() => undefined);
}

export async function getMe(userId: string) {
  const user = await db().user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Session user no longer exists.');
  return toPublicUser(user);
}
