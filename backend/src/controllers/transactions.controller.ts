import { Router } from 'express';
import { authedUserId } from '../middleware/auth.middleware';
import { deleteTransaction, updateTransaction } from '../modules/assets/service';
import { updateTransactionSchema } from '../modules/assets/validation';
import { asyncHandler } from '../utils/apiError';

export const transactionsRouter = Router();

transactionsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const tx = await updateTransaction(authedUserId(req), req.params.id, updateTransactionSchema.parse(req.body));
    res.json({ transaction: tx });
  }),
);

transactionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await deleteTransaction(authedUserId(req), req.params.id));
  }),
);
