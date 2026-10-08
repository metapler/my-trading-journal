import Decimal from 'decimal.js';
import { Router } from 'express';
import { authedUserId } from '../middleware/auth.middleware';
import {
  deleteWatchlist,
  getAssetOrThrow,
  getWatchlist,
  listAssets,
  upsertWatchlist,
} from '../modules/assets/service';
import { upsertWatchlistSchema } from '../modules/assets/validation';
import { getPriceService } from '../modules/prices/service';
import { asyncHandler } from '../utils/apiError';

export const watchlistRouter = Router();

export interface WatchlistRow {
  assetId: string;
  symbol: string;
  name: string;
  chain: string;
  imageUrl: string | null;
  currentPrice: string | null;
  targetEntryPrice: string | null;
  /** (target − current) / current × 100. Null when either side missing. */
  distanceToTargetPercent: string | null;
  /** 'above' | 'below' | 'at' | null — where the target sits vs current price. */
  targetDirection: 'above' | 'below' | 'at' | null;
  note: string | null;
  priceSource: string | null;
  priceFetchedAt: string | null;
  priceStale: boolean;
  updatedAt: string;
}

/**
 * Priced watchlist. Per-row price failures become nulls — one dead provider
 * can't sink the list (same tolerance pattern as batch prices).
 */
watchlistRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = authedUserId(req);
    const assets = await listAssets(userId, 'WATCHLIST');
    const svc = getPriceService();
    const rows: WatchlistRow[] = [];
    for (const asset of assets) {
      const entry = await getWatchlist(userId, asset.id);
      let currentPrice: string | null = null;
      let priceSource: string | null = null;
      let priceFetchedAt: string | null = null;
      let priceStale = false;
      try {
        const r = await svc.getPrice({
          chain: asset.chain,
          contractAddress: asset.contractAddress,
          pairAddress: asset.pairAddress,
          provider: asset.provider,
          providerAssetId: asset.providerAssetId,
          preferredPriceProvider: asset.preferredPriceProvider,
        });
        currentPrice = r.price.priceUsd;
        priceSource = r.price.source;
        priceFetchedAt = r.price.fetchedAt;
        priceStale = r.stale;
      } catch {
        currentPrice = null;
      }

      const target = entry?.targetEntryPrice != null ? entry.targetEntryPrice.toString() : null;
      let distanceToTargetPercent: string | null = null;
      let targetDirection: WatchlistRow['targetDirection'] = null;
      if (target !== null && currentPrice !== null) {
        try {
          const t = new Decimal(target);
          const c = new Decimal(currentPrice);
          if (c.gt(0)) {
            distanceToTargetPercent = t.minus(c).div(c).mul(100).toString();
            targetDirection = t.gt(c) ? 'above' : t.lt(c) ? 'below' : 'at';
          }
        } catch {
          distanceToTargetPercent = null;
          targetDirection = null;
        }
      }

      rows.push({
        assetId: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        chain: asset.chain,
        imageUrl: asset.imageUrl,
        currentPrice,
        targetEntryPrice: target,
        distanceToTargetPercent,
        targetDirection,
        note: entry?.note ?? null,
        priceSource,
        priceFetchedAt,
        priceStale,
        updatedAt: entry?.updatedAt ?? asset.updatedAt,
      });
    }
    res.json({ watchlist: rows });
  }),
);

watchlistRouter.get(
  '/:assetId',
  asyncHandler(async (req, res) => {
    const userId = authedUserId(req);
    await getAssetOrThrow(userId, req.params.assetId);
    res.json({ assetId: req.params.assetId, watchlist: await getWatchlist(userId, req.params.assetId) });
  }),
);

watchlistRouter.put(
  '/:assetId',
  asyncHandler(async (req, res) => {
    const userId = authedUserId(req);
    await getAssetOrThrow(userId, req.params.assetId);
    const entry = await upsertWatchlist(userId, req.params.assetId, upsertWatchlistSchema.parse(req.body));
    res.json({ watchlist: entry });
  }),
);

watchlistRouter.delete(
  '/:assetId',
  asyncHandler(async (req, res) => {
    res.json(await deleteWatchlist(authedUserId(req), req.params.assetId));
  }),
);
