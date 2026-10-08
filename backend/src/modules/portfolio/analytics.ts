import Decimal from 'decimal.js';
import type { PrismaClient } from '../../generated/prisma/client';
import { getPrisma } from '../../config/prisma';
import { getPriceService } from '../prices/service';
import type { AssetIdentifier } from '../prices/types';
import { buildPositionFromLedger, type LedgerTransaction } from './calculations';
import { getTestClientOverride } from './service';

function db(): PrismaClient {
  return getTestClientOverride() ?? getPrisma();
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

export interface StrategyPerformance {
  strategy: string;
  closedPositions: number;
  realizedPnL: string;
  winRate: string | null;
}

export interface AnalyticsResponse {
  totalRealizedPnL: string;
  totalUnrealizedPnL: string;
  closedPositions: number;
  winningPositions: number;
  losingPositions: number;
  /** 0–100 percent string, or null when no closed positions. */
  winRate: string | null;
  averageWinner: string | null;
  averageLoser: string | null;
  largestRealizedWinner: { assetId: string; symbol: string; realizedPnL: string } | null;
  largestRealizedLoser: { assetId: string; symbol: string; realizedPnL: string } | null;
  performanceByStrategy: StrategyPerformance[];
  /** False until at least one closed position exists (PLAN §19 gating). */
  hasEnoughData: boolean;
  priceCoverage: { withPrice: number; withoutPrice: number };
}

/**
 * Basic analytics (PLAN §19). Closed = fully exited ledger (qty 0), wins and
 * losses split by realized PnL sign (breakeven closed counts as neither).
 * Unrealized only covers positions with a market price; without-price rows
 * are counted in priceCoverage so the UI can flag incomplete data.
 * Strategy rows come from journal.strategy on CLOSED ledgers only.
 */
export async function getAnalytics(userId: string): Promise<AnalyticsResponse> {
  const assets = await db().asset.findMany({
    where: { userId },
    orderBy: [{ symbol: 'asc' }, { createdAt: 'asc' }],
    include: { journal: { select: { strategy: true } } },
  });

  let totalRealized = new Decimal(0);
  let totalUnrealized = new Decimal(0);
  let closedCount = 0;
  let winners = 0;
  let losers = 0;
  let winnerSum = new Decimal(0);
  let loserSum = new Decimal(0);
  let largestWin: { assetId: string; symbol: string; pnl: Decimal } | null = null;
  let largestLoss: { assetId: string; symbol: string; pnl: Decimal } | null = null;
  let withPrice = 0;
  let withoutPrice = 0;
  const byStrategy = new Map<string, { closed: number; pnl: Decimal; wins: number }>();

  for (const asset of assets) {
    const txs = await db().transaction.findMany({
      where: { assetId: asset.id },
      orderBy: [{ executedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    if (txs.length === 0) continue;

    const ledger: LedgerTransaction[] = txs.map((t) => ({
      type: t.type as 'BUY' | 'SELL',
      quantity: t.quantity.toString(),
      pricePerToken: t.pricePerToken.toString(),
      fee: t.fee.toString(),
    }));
    const pos = buildPositionFromLedger(ledger);
    const realized = pos.realizedPnL;
    totalRealized = totalRealized.plus(realized);

    // Unrealized for open positions with a market price.
    if (pos.remainingQuantity.gt(0)) {
      try {
        const r = await getPriceService().getPrice(assetIdentity(asset));
        const current = new Decimal(r.price.priceUsd);
        totalUnrealized = totalUnrealized.plus(pos.remainingQuantity.mul(current).minus(pos.remainingCostBasis));
        withPrice += 1;
      } catch {
        withoutPrice += 1;
      }
    }

    // Closed = fully exited ledger — the only rows that feed win/loss stats.
    if (pos.remainingQuantity.eq(0)) {
      closedCount += 1;
      if (realized.gt(0)) {
        winners += 1;
        winnerSum = winnerSum.plus(realized);
        if (!largestWin || realized.gt(largestWin.pnl)) {
          largestWin = { assetId: asset.id, symbol: asset.symbol, pnl: realized };
        }
      } else if (realized.lt(0)) {
        losers += 1;
        loserSum = loserSum.plus(realized);
        if (!largestLoss || realized.lt(largestLoss.pnl)) {
          largestLoss = { assetId: asset.id, symbol: asset.symbol, pnl: realized };
        }
      }
      const strategy = asset.journal?.strategy?.trim();
      if (strategy) {
        const row = byStrategy.get(strategy) ?? { closed: 0, pnl: new Decimal(0), wins: 0 };
        row.closed += 1;
        row.pnl = row.pnl.plus(realized);
        if (realized.gt(0)) row.wins += 1;
        byStrategy.set(strategy, row);
      }
    }
  }

  const performanceByStrategy: StrategyPerformance[] = [...byStrategy.entries()]
    .map(([strategy, row]) => ({
      strategy,
      closedPositions: row.closed,
      realizedPnL: row.pnl.toString(),
      winRate: row.closed > 0 ? new Decimal(row.wins).div(row.closed).mul(100).toString() : null,
    }))
    .sort((a, b) => new Decimal(b.realizedPnL).minus(new Decimal(a.realizedPnL)).toNumber());

  return {
    totalRealizedPnL: totalRealized.toString(),
    totalUnrealizedPnL: totalUnrealized.toString(),
    closedPositions: closedCount,
    winningPositions: winners,
    losingPositions: losers,
    winRate: closedCount > 0 ? new Decimal(winners).div(closedCount).mul(100).toString() : null,
    averageWinner: winners > 0 ? winnerSum.div(winners).toString() : null,
    averageLoser: losers > 0 ? loserSum.div(losers).toString() : null,
    largestRealizedWinner: largestWin
      ? { assetId: largestWin.assetId, symbol: largestWin.symbol, realizedPnL: largestWin.pnl.toString() }
      : null,
    largestRealizedLoser: largestLoss
      ? { assetId: largestLoss.assetId, symbol: largestLoss.symbol, realizedPnL: largestLoss.pnl.toString() }
      : null,
    performanceByStrategy,
    hasEnoughData: closedCount > 0,
    priceCoverage: { withPrice, withoutPrice },
  };
}
