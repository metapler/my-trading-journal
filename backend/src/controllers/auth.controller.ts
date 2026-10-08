import type { Response } from 'express';
import { Router } from 'express';
import { env } from '../config/env';
import { getMe, login, logout, register } from '../modules/auth/service';
import { loginSchema, registerSchema } from '../modules/auth/validation';
import { authedUserId, requireAuth } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/apiError';

export const authRouter = Router();

function setSessionCookie(res: Response, cookieValue: string, expiresAt: Date) {
  res.cookie(env.sessionCookieName, cookieValue, {
    httpOnly: true,
    // Secure in production (HTTPS); plain HTTP locally.
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

function clearSessionCookie(res: Response) {
  res.clearCookie(env.sessionCookieName, { path: '/' });
}

authRouter.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const result = await register(registerSchema.parse(req.body));
    setSessionCookie(res, result.cookieValue, result.expiresAt);
    res.status(201).json({ user: result.user, csrfToken: result.csrfToken });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const result = await login(loginSchema.parse(req.body));
    setSessionCookie(res, result.cookieValue, result.expiresAt);
    res.json({ user: result.user, csrfToken: result.csrfToken });
  }),
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await logout(req.cookies?.[env.sessionCookieName]);
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: await getMe(authedUserId(req)) });
  }),
);
