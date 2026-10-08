import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { resolveSession, verifyCsrf } from '../modules/auth/service';
import { ApiError } from '../utils/apiError';

export interface AuthedRequest extends Request {
  userId: string;
  userEmail: string;
}

/**
 * Session gate (PLAN §21). Reads the HTTP-only session cookie, resolves the
 * user, and attaches userId. For mutations (POST/PUT/PATCH/DELETE) also
 * requires the CSRF header to match the session's CSRF token.
 * Safe methods (GET/HEAD/OPTIONS) skip CSRF (cookie-readable, no state change).
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await resolveSession(req.cookies?.[env.sessionCookieName]);
    if (!user) {
      next(new ApiError(401, 'UNAUTHORIZED', 'Authentication required.'));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      const ok = await verifyCsrf(req.cookies?.[env.sessionCookieName], req.get('x-csrf-token') ?? undefined);
      if (!ok) {
        next(new ApiError(403, 'CSRF_MISMATCH', 'Missing or invalid CSRF token.'));
        return;
      }
    }
    (req as AuthedRequest).userId = user.id;
    (req as AuthedRequest).userEmail = user.email;
    next();
  } catch (e) {
    next(e);
  }
}

/** Helper for controllers to read the attached user. */
export function authedUserId(req: Request): string {
  return (req as AuthedRequest).userId;
}
