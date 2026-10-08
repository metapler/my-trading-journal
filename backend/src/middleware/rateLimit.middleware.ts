import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';

/**
 * Rate limits (PLAN §25: search/provider endpoints need limits when public).
 * Local-first MVP keeps generous budgets; the point is abuse protection and
 * upstream credit preservation, not throttling normal polling.
 */
/** Exported factory — lets tests build a tight limiter without burning shared budgets. */
export function limiter(opts: { windowMs: number; limit: number }) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Normalized shape consistent with the rest of the API.
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Slow down and try again.' },
      });
    },
  });
}

/** General API budget: 300 req/min per IP. */
export const apiLimiter = limiter({ windowMs: 60_000, limit: 300 });

/** Search + price endpoints (upstream credits): 60 req/min per IP. */
export const searchPriceLimiter = limiter({ windowMs: 60_000, limit: 60 });

/** Mutations: 120 req/min per IP. */
export const mutationLimiter = limiter({ windowMs: 60_000, limit: 120 });

/**
 * Login/register: 10 attempts/min per IP (PLAN §21 brute-force guard).
 * Bypassed in test env so suites can exercise auth logic freely; the
 * production path is covered by a dedicated unit test of this limiter.
 */
export const authLimiter =
  process.env.NODE_ENV === 'test'
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : limiter({ windowMs: 60_000, limit: 10 });
