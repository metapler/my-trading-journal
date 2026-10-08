import { Router } from 'express';
import { authedUserId } from '../middleware/auth.middleware';
import { getAssetOrThrow, getJournal, listJournals, upsertJournal } from '../modules/assets/service';
import { upsertJournalSchema } from '../modules/assets/validation';
import { asyncHandler } from '../utils/apiError';

export const journalRouter = Router();

/** All journals with asset context (for the /journal list page). */
journalRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ journals: await listJournals(authedUserId(req)) });
  }),
);

/** Single-asset journal. Missing row → { journal: null }, not 404. */
journalRouter.get(
  '/:assetId',
  asyncHandler(async (req, res) => {
    const userId = authedUserId(req);
    await getAssetOrThrow(userId, req.params.assetId);
    res.json({ assetId: req.params.assetId, journal: await getJournal(userId, req.params.assetId) });
  }),
);

/** Upsert: PUT is idempotent, creates or patches the single row. */
journalRouter.put(
  '/:assetId',
  asyncHandler(async (req, res) => {
    const userId = authedUserId(req);
    await getAssetOrThrow(userId, req.params.assetId);
    const journal = await upsertJournal(userId, req.params.assetId, upsertJournalSchema.parse(req.body));
    res.json({ journal });
  }),
);
