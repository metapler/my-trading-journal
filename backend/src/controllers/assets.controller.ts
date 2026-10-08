import { Router } from 'express';
import { authedUserId } from '../middleware/auth.middleware';
import { searchPriceLimiter } from '../middleware/rateLimit.middleware';
import { validateQuery, type ValidatedRequest } from '../middleware/validate.middleware';
import { getPriceService } from '../modules/prices/service';
import {
  createAsset,
  createTransaction,
  getAssetOrThrow,
  listAssets,
  listTransactions,
  updateAsset,
} from '../modules/assets/service';
import {
  assetListQuerySchema,
  createAssetSchema,
  createTransactionSchema,
  searchQuerySchema,
  updateAssetSchema,
} from '../modules/assets/validation';
import { getPosition } from '../modules/portfolio/service';
import { asyncHandler } from '../utils/apiError';

export const assetsRouter = Router();

// IMPORTANT: /search must be registered before /:id or "search" matches :id.
assetsRouter.get(
  '/search',
  searchPriceLimiter,
  validateQuery(searchQuerySchema),
  asyncHandler(async (req, res) => {
    const { q, provider } = (req as ValidatedRequest<typeof searchQuerySchema>).validatedQuery;
    const results = await getPriceService().search(q, provider);
    res.json({ query: q, count: results.length, results });
  }),
);

assetsRouter.get(
  '/',
  validateQuery(assetListQuerySchema),
  asyncHandler(async (req, res) => {
    const { status } = (req as ValidatedRequest<typeof assetListQuerySchema>).validatedQuery;
    res.json({ assets: await listAssets(authedUserId(req), status) });
  }),
);

assetsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const asset = await createAsset(authedUserId(req), createAssetSchema.parse(req.body));
    res.status(201).json({ asset });
  }),
);

assetsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const asset = await getAssetOrThrow(authedUserId(req), req.params.id);
    res.json({ asset });
  }),
);

assetsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const asset = await updateAsset(authedUserId(req), req.params.id, updateAssetSchema.parse(req.body));
    res.json({ asset });
  }),
);

// --- nested transactions ---

assetsRouter.get(
  '/:id/transactions',
  asyncHandler(async (req, res) => {
    res.json({ assetId: req.params.id, transactions: await listTransactions(authedUserId(req), req.params.id) });
  }),
);

assetsRouter.post(
  '/:id/transactions',
  asyncHandler(async (req, res) => {
    const tx = await createTransaction(authedUserId(req), req.params.id, createTransactionSchema.parse(req.body));
    res.status(201).json({ transaction: tx });
  }),
);

// --- single-asset price (cached, stale-flagged, or 502 unavailable) ---

assetsRouter.get(
  '/:id/price',
  asyncHandler(async (req, res) => {
    const asset = await getAssetOrThrow(authedUserId(req), req.params.id);
    const r = await getPriceService().getPrice({
      chain: asset.chain,
      contractAddress: asset.contractAddress,
      pairAddress: asset.pairAddress,
      provider: asset.provider,
      providerAssetId: asset.providerAssetId,
      preferredPriceProvider: asset.preferredPriceProvider,
    });
    res.json({
      ...r.price,
      assetId: asset.id,
      cached: r.cached,
      stale: r.stale,
      ageMs: r.ageMs,
    });
  }),
);

// --- single-asset full position ---

assetsRouter.get(
  '/:id/position',
  asyncHandler(async (req, res) => {
    res.json({ position: await getPosition(authedUserId(req), req.params.id) });
  }),
);
