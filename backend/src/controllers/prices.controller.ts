import { Router } from 'express';
import { authedUserId } from '../middleware/auth.middleware';
import { validateQuery, type ValidatedRequest } from '../middleware/validate.middleware';
import { getAssetOrThrow } from '../modules/assets/service';
import { batchPricesQuerySchema } from '../modules/assets/validation';
import { getPriceService } from '../modules/prices/service';
import { asyncHandler } from '../utils/apiError';

export const pricesRouter = Router();

/**
 * Batch prices for the dashboard — one request instead of dozens.
 * Per-asset failures become null rows with errorCode; HTTP stays 200 so one
 * dead provider can't sink the whole dashboard.
 */
pricesRouter.get(
  '/',
  validateQuery(batchPricesQuerySchema),
  asyncHandler(async (req, res) => {
    const { assetIds } = (req as ValidatedRequest<typeof batchPricesQuerySchema>).validatedQuery;
    const svc = getPriceService();

    // Unknown IDs become null rows — one bad id never sinks the batch.
    const idents: Array<{ id: string; ident: Parameters<typeof svc.getBatchPrices>[0][number] }> = [];
    const missing = new Set<string>();
    const userId = authedUserId(req);
    for (const id of assetIds) {
      try {
        const asset = await getAssetOrThrow(userId, id);
        idents.push({
          id,
          ident: {
            chain: asset.chain,
            contractAddress: asset.contractAddress,
            pairAddress: asset.pairAddress,
            provider: asset.provider,
            providerAssetId: asset.providerAssetId,
            preferredPriceProvider: asset.preferredPriceProvider,
          },
        });
      } catch {
        missing.add(id);
      }
    }
    const rows = await svc.getBatchPrices(idents.map((x) => x.ident));

    const prices: Record<string, unknown> = {};
    rows.forEach((r, i) => {
      prices[idents[i].id] = r.price
        ? { ...r.price, cached: r.cached, stale: r.stale, ageMs: r.ageMs }
        : { price: null, errorCode: r.errorCode };
    });
    for (const id of missing) prices[id] = { price: null, errorCode: 'ASSET_NOT_FOUND' };
    res.json({ prices });
  }),
);
