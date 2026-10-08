import { Router } from 'express';
import { authedUserId } from '../middleware/auth.middleware';
import { dcaSimulateSchema } from '../modules/assets/validation';
import { simulateDcaForAsset } from '../modules/portfolio/service';
import { asyncHandler } from '../utils/apiError';

export const dcaRouter = Router();

/**
 * DCA simulation — pure projection, NEVER creates a transaction.
 * buyPrice optional: falls back to latest market price (PLAN §16).
 */
dcaRouter.post(
  '/simulate',
  asyncHandler(async (req, res) => {
    const input = dcaSimulateSchema.parse(req.body);
    res.json({ simulation: await simulateDcaForAsset(authedUserId(req), input) });
  }),
);
