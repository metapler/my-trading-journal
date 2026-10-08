import { Router } from 'express';
import { authedUserId } from '../middleware/auth.middleware';
import { validateQuery, type ValidatedRequest } from '../middleware/validate.middleware';
import { positionListQuerySchema } from '../modules/assets/validation';
import { getPosition, listPositions } from '../modules/portfolio/service';
import { asyncHandler } from '../utils/apiError';

export const positionsRouter = Router();

positionsRouter.get(
  '/',
  validateQuery(positionListQuerySchema),
  asyncHandler(async (req, res) => {
    const { status } = (req as ValidatedRequest<typeof positionListQuerySchema>).validatedQuery;
    res.json({ positions: await listPositions(authedUserId(req), status) });
  }),
);

positionsRouter.get(
  '/:assetId',
  asyncHandler(async (req, res) => {
    res.json({ position: await getPosition(authedUserId(req), req.params.assetId) });
  }),
);
