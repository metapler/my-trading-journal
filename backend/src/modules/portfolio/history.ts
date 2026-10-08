import Decimal from 'decimal.js';
import type { PrismaClient } from '../../generated/prisma/client';
import { getPrisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { getPriceService } from '../prices/service';
import type { AssetIdentifier } from '../prices/types';
import { buildPositionFromLedger, type LedgerTransaction } from './calculations';
import { getTestClientOverride } from './service';

function db(): PrismaClient {
  return getTestClientOverride() ?? getPrisma();
}

/** Snapshot bucket width — REDESIGN §9.2: 5 minutes, UTC. */
export const SNAPSHOT_BUCKET_SECONDS = 300;

/** Max points per history response — aggregate down to ~600 (§9.3). */
export const HISTORY_MAX_POINTS = 600;

export type SnapshotQuality = 'complete' | 'stale' | 'partial' | 'unavailable';

export interface HistoryPoint {
  capturedAt: string;
  valueUsd: string | null;
  activeCostBasisUsd: string | null;
  quality: SnapshotQuality;
}

export type HistoryRange = '24h' | '7d' | '30d' | '90d' | 'all';

export interface PortfolioHistory {
  currency: 'USD';
  metric: 'active_positions_value';
  source: 'observed_snapshots';
  requestedRange: HistoryRange;
  requestedFrom: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  generatedAt: string;
  intervalSeconds: number;
  coverage: 'full' | 'limited' | 'none';
  invalidatedFrom: string | null;
  points: HistoryPoint[];
}

const RANGE_SECONDS: Record<Exclude<HistoryRange, 'all'>, number> = {
  '24h': 24 * 3600,
  '7d': 7 * 24 * 3600,
  '30d': 30 * 24 * 3600,
  '90d': 90 * 24 * 3600,
};

export function historyRangeSchema(): readonly HistoryRange[] {
  return ['24h', '7d', '30d', '90d', 'all'] as const;
}

/** Floor a date to its 5-minute UTC bucket. */
export function bucketStartFor(d: Date): Date {
  const ms = d.getTime();
  const bucketMs = SNAPSHOT_BUCKET_SECONDS * 1000;
  return new Date(Math.floor(ms / bucketMs) * bucketMs);
}

function assetIdentity(a: {
  chain: string | null;
  contractAddress: string | null;
  pairAddress: string | null;
  provider: string | null;
  providerAssetId: string | null;
  preferredPriceProvider: string | null;
}): AssetIdentifier {
  return {
    chain: a.chain,
    contractAddress: a.contractAddress,
    pairAddress: a.pairAddress,
    provider: a.provider,
    providerAssetId: a.providerAssetId,
    preferredPriceProvider: a.preferredPriceProvider,
  };
}

// ---------------------------------------------------------------------------
// Ledger revision — bump on every transaction mutation; observed snapshots
// are never recomputed, edits only mark affected history (§9.2).
// ---------------------------------------------------------------------------

export async function getLedgerRevision(userId: string): Promise<number> {
  const state = await db().portfolioHistoryState.findUnique({ where: { userId } });
  return state?.ledgerRevision ?? 0;
}

/**
 * Bump the ledger revision after a mutation. Normal appends (executed ~now)
 * only bump the revision; backdated creates, edits, and deletes additionally
 * stamp `invalidatedFrom` (sticky earliest) so the UI can mark history
 * before the correction instead of silently recomputing it.
 */
export async function bumpLedgerRevision(userId: string, invalidatedFrom?: Date | null): Promise<void> {
  const existing = await db().portfolioHistoryState.findUnique({ where: { userId } });
  if (!existing) {
    await db().portfolioHistoryState.create({
      data: { userId, ledgerRevision: 1, invalidatedFrom: invalidatedFrom ?? null },
    });
    return;
  }
  let next = existing.invalidatedFrom;
  if (invalidatedFrom) {
    next = next === null || invalidatedFrom < next ? invalidatedFrom : next;
  }
  await db().portfolioHistoryState.update({
    where: { userId },
    data: { ledgerRevision: existing.ledgerRevision + 1, invalidatedFrom: next },
  });
}

/** Grace window: entries dated within this of "now" count as current, not backdated. */
export const BACKDATED_TOLERANCE_MS = 10 * 60_000;

export function isBackdated(executedAt: Date, now = new Date()): boolean {
  return executedAt.getTime() < now.getTime() - BACKDATED_TOLERANCE_MS;
}

// ---------------------------------------------------------------------------
// Snapshot capture — runs in the host process every 5 min (§9.2).
// Consistent ledger read: revision sampled before quotes; if it changed
// mid-capture the pass is skipped (no mixed before/after positions).
// First-write-wins per bucket via unique (userId, bucketStart) → P2002 =
// another tab/worker already captured; treat as success, never overwrite.
// ---------------------------------------------------------------------------

export interface CaptureResult {
  captured: boolean;
  skipped?: 'no_positions' | 'ledger_changed' | 'duplicate_bucket';
  quality?: SnapshotQuality;
  valueUsd?: string | null;
}

export async function capturePortfolioSnapshot(userId: string, now = new Date()): Promise<CaptureResult> {
  const client = db();
  const bucketStart = bucketStartFor(now);
  const revisionBefore = await getLedgerRevision(userId);

  const assets = await client.asset.findMany({ where: { userId } });
  const txs = await client.transaction.findMany({
    where: { asset: { userId } },
    orderBy: [{ executedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    include: { asset: { select: { id: true } } },
  });

  // Group ledger per asset.
  const byAsset = new Map<string, LedgerTransaction[]>();
  for (const t of txs) {
    const list = byAsset.get(t.assetId) ?? [];
    list.push({
      type: t.type as 'BUY' | 'SELL',
      quantity: t.quantity.toString(),
      pricePerToken: t.pricePerToken.toString(),
      fee: t.fee.toString(),
    });
    byAsset.set(t.assetId, list);
  }

  // Open positions only (qty > 0) define the snapshot universe.
  const open: Array<{ assetId: string; qty: Decimal; basis: Decimal }> = [];
  for (const a of assets) {
    const pos = buildPositionFromLedger(byAsset.get(a.id) ?? []);
    if (pos.remainingQuantity.gt(0)) {
      open.push({ assetId: a.id, qty: pos.remainingQuantity, basis: pos.remainingCostBasis });
    }
  }

  if (open.length === 0) {
    // No exposure: nothing to observe. History stays empty (honest §9.4).
    return { captured: false, skipped: 'no_positions' };
  }

  const priceSvc = getPriceService();
  const byId = new Map(assets.map((a) => [a.id, a]));
  let known = new Decimal(0);
  let cost = new Decimal(0);
  let priced = 0;
  let anyStale = false;
  let oldestPriceAt: Date | null = null;

  const priceRows = await priceSvc.getBatchPrices(
    open.map((o) => assetIdentity(byId.get(o.assetId)!)),
  );

  for (let i = 0; i < open.length; i++) {
    const o = open[i];
    cost = cost.plus(o.basis);
    const row = priceRows[i];
    if (row.price) {
      priced += 1;
      known = known.plus(o.qty.mul(new Decimal(row.price.priceUsd)));
      if (row.stale) anyStale = true;
      const at = new Date(row.price.fetchedAt);
      if (!Number.isNaN(at.getTime()) && (oldestPriceAt === null || at < oldestPriceAt)) {
        oldestPriceAt = at;
      }
    }
  }

  // Consistency: revision must not have moved while quotes were gathered.
  const revisionAfter = await getLedgerRevision(userId);
  if (revisionAfter !== revisionBefore) {
    logger.warn({ userId }, 'Snapshot skipped: ledger changed mid-capture.');
    return { captured: false, skipped: 'ledger_changed' };
  }

  const total = open.length;
  let quality: SnapshotQuality;
  let portfolioValueUsd: Decimal | null;
  if (priced === 0) {
    quality = 'unavailable';
    portfolioValueUsd = null;
  } else if (priced < total) {
    quality = 'partial';
    portfolioValueUsd = null; // full total unknown — never present subtotal as total
  } else {
    quality = anyStale ? 'stale' : 'complete';
    portfolioValueUsd = known;
  }

  try {
    await client.portfolioSnapshot.create({
      data: {
        userId,
        capturedAt: now,
        bucketStart,
        portfolioValueUsd: portfolioValueUsd === null ? null : portfolioValueUsd.toFixed(2),
        knownValueUsd: known.toFixed(2),
        activeCostBasisUsd: cost.toFixed(2),
        quality,
        pricedAssetCount: priced,
        totalAssetCount: total,
        oldestPriceAt,
        ledgerRevision: revisionBefore,
      },
    });
  } catch (e) {
    // P2002 unique(userId, bucketStart) — another runner captured first.
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 'P2002') {
      return { captured: false, skipped: 'duplicate_bucket' };
    }
    throw e;
  }

  return { captured: true, quality, valueUsd: portfolioValueUsd?.toString() ?? null };
}

// ---------------------------------------------------------------------------
// History read — GET /api/portfolio/history?range=30d (§9.3).
// UTC ranges, timestamp sort, ≤600 points via last-valid-per-bucket
// aggregation. Gaps preserved (no forward-fill); averages never labeled
// as closes.
// ---------------------------------------------------------------------------

export async function getPortfolioHistory(userId: string, range: HistoryRange): Promise<PortfolioHistory> {
  const now = new Date();
  const from = range === 'all' ? null : new Date(now.getTime() - RANGE_SECONDS[range] * 1000);

  const rows = await db().portfolioSnapshot.findMany({
    where: { userId, ...(from ? { capturedAt: { gte: from } } : {}) },
    orderBy: { capturedAt: 'asc' },
  });

  const state = await db().portfolioHistoryState.findUnique({ where: { userId } });

  let intervalSeconds = SNAPSHOT_BUCKET_SECONDS;
  let points: HistoryPoint[] = rows.map((r) => ({
    capturedAt: r.capturedAt.toISOString(),
    valueUsd: r.portfolioValueUsd === null ? null : r.portfolioValueUsd.toString(),
    activeCostBasisUsd: r.activeCostBasisUsd.toString(),
    quality: r.quality as SnapshotQuality,
  }));

  // Downsample to HISTORY_MAX_POINTS: last valid row per merged bucket.
  if (points.length > HISTORY_MAX_POINTS) {
    const factor = Math.ceil(points.length / HISTORY_MAX_POINTS);
    intervalSeconds = SNAPSHOT_BUCKET_SECONDS * factor;
    const agg: HistoryPoint[] = [];
    for (let i = 0; i < points.length; i += factor) {
      const chunk = points.slice(i, i + factor);
      agg.push(chunk[chunk.length - 1]);
    }
    points = agg;
  }

  const availableFrom = rows.length > 0 ? rows[0].capturedAt.toISOString() : null;
  const availableTo = rows.length > 0 ? rows[rows.length - 1].capturedAt.toISOString() : null;

  let coverage: 'full' | 'limited' | 'none';
  if (rows.length === 0) {
    coverage = 'none';
  } else if (range === 'all') {
    coverage = 'full';
  } else {
    // Full when earliest point covers the requested start (±1 bucket + skew).
    const start = from!.getTime();
    const first = rows[0].capturedAt.getTime();
    coverage = first <= start + SNAPSHOT_BUCKET_SECONDS * 1000 + 60_000 ? 'full' : 'limited';
  }

  return {
    currency: 'USD',
    metric: 'active_positions_value',
    source: 'observed_snapshots',
    requestedRange: range,
    requestedFrom: from ? from.toISOString() : null,
    availableFrom,
    availableTo,
    generatedAt: now.toISOString(),
    intervalSeconds,
    coverage,
    invalidatedFrom: state?.invalidatedFrom ? state.invalidatedFrom.toISOString() : null,
    points,
  };
}
