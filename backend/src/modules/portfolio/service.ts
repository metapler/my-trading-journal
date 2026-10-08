import Decimal from 'decimal.js';
import type { PrismaClient } from '../../generated/prisma/client';
import { getPrisma } from '../../config/prisma';
import { ApiError } from '../../utils/apiError';
import { getPriceService, type PriceService } from '../prices/service';
import type { AssetIdentifier } from '../prices/types';

// Re-export for callers that stub prices in tests.
export type { PriceService };
import {
  buildPositionFromLedger,
  computePositionMetrics,
  simulateDca,
  type LedgerTransaction,
} from './calculations';

let clientOverride: PrismaClient | null = null;

/** Test hook — isolated test database. (Prices stub via setPriceServiceForTests.) */
export function setPrismaClientForTests(client: PrismaClient | null): void {
  clientOverride = client;
}

/** Shared accessor so sibling modules (analytics) use the same test client. */
export function getTestClientOverride(): PrismaClient | null {
  return clientOverride;
}

function db(): PrismaClient {
  return clientOverride ?? getPrisma();
}
function prices() {
  return getPriceService();
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

const d = (v: Decimal | null) => (v === null ? null : v.toString());

// ---------------------------------------------------------------------------
// Position for one asset — ledger rebuild + current price (nullable)
// ---------------------------------------------------------------------------

export interface PositionResponse {
  assetId: string;
  symbol: string;
  name: string;
  chain: string;
  status: string;
  remainingQuantity: string;
  averageBuy: string;
  remainingCostBasis: string;
  realizedPnL: string;
  currentPrice: string | null;
  currentValue: string | null;
  unrealizedPnL: string | null;
  unrealizedPnLPercent: string | null;
  bepPrice: string | null;
  recoveryToBepPercent: string | null;
  priceSource: string | null;
  priceFetchedAt: string | null;
  priceStale: boolean;
  priceCached: boolean;
}

export async function getPosition(userId: string, assetId: string): Promise<PositionResponse> {
  const asset = await db().asset.findFirst({ where: { id: assetId, userId } });
  if (!asset) {
    throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
  }
  const txs = await db().transaction.findMany({
    where: { assetId },
    orderBy: [{ executedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const ledger: LedgerTransaction[] = txs.map((t) => ({
    type: t.type as 'BUY' | 'SELL',
    quantity: t.quantity.toString(),
    pricePerToken: t.pricePerToken.toString(),
    fee: t.fee.toString(),
  }));
  const pos = buildPositionFromLedger(ledger);

  // Price unavailable (provider down, no cache) → nulls, never 0.
  let currentPrice: string | null = null;
  let priceSource: string | null = null;
  let priceFetchedAt: string | null = null;
  let priceStale = false;
  let priceCached = false;
  try {
    const r = await prices().getPrice(assetIdentity(asset));
    currentPrice = r.price.priceUsd;
    priceSource = r.price.source;
    priceFetchedAt = r.price.fetchedAt;
    priceStale = r.stale;
    priceCached = r.cached;
  } catch {
    currentPrice = null;
  }

  const m = computePositionMetrics({
    remainingQuantity: pos.remainingQuantity,
    averageBuy: pos.averageBuy,
    currentPrice,
  });

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    chain: asset.chain,
    status: asset.status,
    remainingQuantity: pos.remainingQuantity.toString(),
    averageBuy: pos.averageBuy.toString(),
    remainingCostBasis: pos.remainingCostBasis.toString(),
    realizedPnL: pos.realizedPnL.toString(),
    currentPrice: d(m.currentPrice),
    currentValue: d(m.currentValue),
    unrealizedPnL: d(m.unrealizedPnL),
    unrealizedPnLPercent: d(m.unrealizedPnLPercent),
    bepPrice: d(m.bepPrice),
    recoveryToBepPercent: d(m.recoveryToBepPercent),
    priceSource,
    priceFetchedAt,
    priceStale,
    priceCached,
  };
}

export async function listPositions(userId: string, status?: string): Promise<PositionResponse[]> {
  const assets = await db().asset.findMany({
    where: { userId, ...(status ? { status: status as 'ACTIVE' | 'CLOSED' | 'WATCHLIST' } : {}) },
    orderBy: [{ symbol: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  // Sequential: respects provider rate limits via shared cache.
  const out: PositionResponse[] = [];
  for (const a of assets) out.push(await getPosition(userId, a.id));
  return out;
}

// ---------------------------------------------------------------------------
// Portfolio summary — aggregates across positions
// ---------------------------------------------------------------------------

export interface PortfolioSummary {
  totalCostBasis: string;
  portfolioValue: string;
  unrealizedPnL: string;
  unrealizedPnLPercent: string | null;
  realizedPnL: string;
  openPositions: number;
  closedPositions: number;
  priceCoverage: { withPrice: number; withoutPrice: number };
}

export async function getPortfolioSummary(userId: string): Promise<PortfolioSummary> {
  // Closed positions contribute only realized PnL (qty 0 → value 0, cost 0).
  // Positions without a market price are excluded from value/unrealized but
  // counted in priceCoverage so the UI can flag incomplete data.
  const positions = await listPositions(userId);
  let cost = new Decimal(0);
  let pricedCost = new Decimal(0);
  let value = new Decimal(0);
  let realized = new Decimal(0);
  let open = 0;
  let closed = 0;
  let withPrice = 0;
  let withoutPrice = 0;

  for (const p of positions) {
    const qty = new Decimal(p.remainingQuantity);
    const basis = new Decimal(p.remainingCostBasis);
    cost = cost.plus(basis);
    realized = realized.plus(new Decimal(p.realizedPnL));
    if (qty.gt(0)) open += 1;
    else closed += 1;
    if (p.currentValue !== null) {
      value = value.plus(new Decimal(p.currentValue));
      pricedCost = pricedCost.plus(basis);
      withPrice += 1;
    } else {
      withoutPrice += 1;
    }
  }

  const unrealized = value.minus(pricedCost);
  return {
    totalCostBasis: cost.toString(),
    portfolioValue: value.toString(),
    unrealizedPnL: unrealized.toString(),
    unrealizedPnLPercent: pricedCost.gt(0) ? unrealized.div(pricedCost).mul(100).toString() : null,
    realizedPnL: realized.toString(),
    openPositions: open,
    closedPositions: closed,
    priceCoverage: { withPrice, withoutPrice },
  };
}

// ---------------------------------------------------------------------------
// DCA simulation — pure projection over the live ledger, never persists
// ---------------------------------------------------------------------------

export interface DcaSimulateResponse {
  assetId: string;
  currentAverageBuy: string;
  projectedAverageBuy: string;
  currentBep: string | null;
  projectedBep: string | null;
  currentQuantity: string;
  projectedQuantity: string;
  additionalQuantity: string;
  currentRecoveryToBepPercent: string | null;
  projectedRecoveryToBepPercent: string | null;
  projectedTotalExposure: string;
  buyPriceUsed: string;
  currentPrice: string | null;
}

export async function simulateDcaForAsset(
  userId: string,
  opts: {
    assetId: string;
    additionalCapital: string;
    buyPrice?: string;
    fee?: string;
  },
): Promise<DcaSimulateResponse> {
  const asset = await db().asset.findFirst({ where: { id: opts.assetId, userId } });
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');

  const txs = await db().transaction.findMany({
    where: { assetId: opts.assetId },
    orderBy: [{ executedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const pos = buildPositionFromLedger(
    txs.map((t) => ({
      type: t.type as 'BUY' | 'SELL',
      quantity: t.quantity.toString(),
      pricePerToken: t.pricePerToken.toString(),
      fee: t.fee.toString(),
    })),
  );

  let currentPrice: string | null = null;
  let buyPrice = opts.buyPrice ?? null;
  if (buyPrice === null) {
    // Default to latest market price (PLAN §16).
    try {
      const r = await prices().getPrice(assetIdentity(asset));
      buyPrice = r.price.priceUsd;
      currentPrice = r.price.priceUsd;
    } catch {
      throw new ApiError(422, 'NO_MARKET_PRICE', 'No market price available; pass an explicit buyPrice.');
    }
  } else {
    try {
      const r = await prices().getPrice(assetIdentity(asset));
      currentPrice = r.price.priceUsd;
    } catch {
      currentPrice = null;
    }
  }

  const sim = simulateDca({
    currentQuantity: pos.remainingQuantity,
    currentAverageBuy: pos.averageBuy,
    additionalCapital: opts.additionalCapital,
    buyPrice,
    fee: opts.fee ?? '0',
    currentPrice,
  });

  const before = computePositionMetrics({
    remainingQuantity: pos.remainingQuantity,
    averageBuy: pos.averageBuy,
    currentPrice,
  });
  const after = computePositionMetrics({
    remainingQuantity: sim.projectedQuantity,
    averageBuy: sim.projectedAverageBuy,
    currentPrice,
  });

  return {
    assetId: opts.assetId,
    currentAverageBuy: sim.currentAverageBuy.toString(),
    projectedAverageBuy: sim.projectedAverageBuy.toString(),
    currentBep: d(before.bepPrice),
    projectedBep: d(after.bepPrice),
    currentQuantity: sim.currentQuantity.toString(),
    projectedQuantity: sim.projectedQuantity.toString(),
    additionalQuantity: sim.additionalQuantity.toString(),
    currentRecoveryToBepPercent: d(before.recoveryToBepPercent ?? sim.currentRecoveryToBepPercent),
    projectedRecoveryToBepPercent: d(after.recoveryToBepPercent ?? sim.projectedRecoveryToBepPercent),
    projectedTotalExposure: sim.projectedTotalExposure.toString(),
    buyPriceUsed: buyPrice,
    currentPrice,
  };
}
