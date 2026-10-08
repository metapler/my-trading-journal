import { Router } from 'express';
import { authedUserId } from '../middleware/auth.middleware';
import { validateQuery, type ValidatedRequest } from '../middleware/validate.middleware';
import { portfolioHistoryQuerySchema } from '../modules/assets/validation';
import { getAnalytics } from '../modules/portfolio/analytics';
import { getPortfolioHistory } from '../modules/portfolio/history';
import { getPortfolioSummary } from '../modules/portfolio/service';
import { asyncHandler } from '../utils/apiError';

export const portfolioRouter = Router();

portfolioRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    res.json({ summary: await getPortfolioSummary(authedUserId(req)) });
  }),
);

portfolioRouter.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    res.json({ analytics: await getAnalytics(authedUserId(req)) });
  }),
);

// REDESIGN §9.3 — observed portfolio history. Scoped per user, validated
// enum, UTC ranges, ≤600 points; 400 on unknown range via Zod.
portfolioRouter.get(
  '/history',
  validateQuery(portfolioHistoryQuerySchema),
  asyncHandler(async (req, res) => {
    const { range } = (req as ValidatedRequest<typeof portfolioHistoryQuerySchema>).validatedQuery;
    res.json({ history: await getPortfolioHistory(authedUserId(req), range) });
  }),
);
