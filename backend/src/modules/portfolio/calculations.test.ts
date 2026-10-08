import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  buildPositionFromLedger,
  calculateBuy,
  calculateSell,
  CalculationError,
  computePositionMetrics,
  ERROR_CODES,
  simulateDca,
} from './calculations';

function dec(value: string | number | Decimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/** Strict string equality on Decimal canonical form. */
function expectDec(received: Decimal | null, expected: string) {
  expect(received).not.toBeNull();
  expect(dec(received as Decimal).toString()).toBe(new Decimal(expected).toString());
}

function expectThrowCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(CalculationError);
    expect((e as CalculationError).code).toBe(code);
    return;
  }
  throw new Error(`Expected CalculationError(${code}) but nothing was thrown`);
}

// ---------------------------------------------------------------------------
// BUY
// ---------------------------------------------------------------------------

describe('calculateBuy', () => {
  it('single buy sets quantity and average', () => {
    const r = calculateBuy({ oldQuantity: 0, oldAverageCost: 0, buyQuantity: 100, buyPrice: 1 });
    expectDec(r.newQuantity, '100');
    expectDec(r.newAverageCost, '1');
    expectDec(r.newCostBasis, '100');
    expectDec(r.newBuyCost, '100');
  });

  it('multiple DCA buys produce weighted average', () => {
    const first = calculateBuy({ oldQuantity: 0, oldAverageCost: 0, buyQuantity: 100, buyPrice: 1 });
    const second = calculateBuy({
      oldQuantity: first.newQuantity,
      oldAverageCost: first.newAverageCost,
      buyQuantity: 100,
      buyPrice: 0.5,
    });
    expectDec(second.newQuantity, '200');
    expectDec(second.newAverageCost, '0.75');
    expectDec(second.newCostBasis, '150');
  });

  it('buy fee is folded into cost basis and average', () => {
    const r = calculateBuy({ oldQuantity: 0, oldAverageCost: 0, buyQuantity: 100, buyPrice: 1, buyFee: 10 });
    expectDec(r.newBuyCost, '110');
    expectDec(r.newAverageCost, '1.1');
  });

  it('zero fee behaves identically to omitted fee', () => {
    const a = calculateBuy({ oldQuantity: 10, oldAverageCost: 2, buyQuantity: 10, buyPrice: 4 });
    const b = calculateBuy({ oldQuantity: 10, oldAverageCost: 2, buyQuantity: 10, buyPrice: 4, buyFee: 0 });
    expect(a.newAverageCost.eq(b.newAverageCost)).toBe(true);
  });

  it('rejects zero quantity', () => {
    expectThrowCode(
      () => calculateBuy({ oldQuantity: 0, oldAverageCost: 0, buyQuantity: 0, buyPrice: 1 }),
      ERROR_CODES.INVALID_QUANTITY,
    );
  });

  it('rejects negative price', () => {
    expectThrowCode(
      () => calculateBuy({ oldQuantity: 0, oldAverageCost: 0, buyQuantity: 1, buyPrice: -5 }),
      ERROR_CODES.INVALID_PRICE,
    );
  });

  it('rejects negative fee', () => {
    expectThrowCode(
      () => calculateBuy({ oldQuantity: 0, oldAverageCost: 0, buyQuantity: 1, buyPrice: 1, buyFee: -1 }),
      ERROR_CODES.INVALID_FEE,
    );
  });

  it('keeps Decimal precision (no float drift)', () => {
    // 0.1 + 0.2 must be exactly 0.3, not 0.30000000000000004
    const r = calculateBuy({ oldQuantity: '0.1', oldAverageCost: 1, buyQuantity: '0.2', buyPrice: 1 });
    expectDec(r.newCostBasis, '0.3');
    expectDec(r.newQuantity, '0.3');
    expectDec(r.newAverageCost, '1');
  });
});

// ---------------------------------------------------------------------------
// SELL
// ---------------------------------------------------------------------------

describe('calculateSell', () => {
  it('partial sell keeps average cost of remainder', () => {
    const r = calculateSell({
      averageCostBeforeSell: 0.75,
      availableQuantity: 200,
      sellQuantity: 50,
      sellPrice: 1,
    });
    expectDec(r.remainingQuantity, '150');
    expectDec(r.averageCost, '0.75');
    expectDec(r.grossProceeds, '50');
    expectDec(r.netProceeds, '50');
    expectDec(r.soldCostBasis, '37.5');
    expectDec(r.realizedPnL, '12.5');
  });

  it('sell fee reduces net proceeds and realized PnL', () => {
    const r = calculateSell({
      averageCostBeforeSell: 1,
      availableQuantity: 100,
      sellQuantity: 100,
      sellPrice: 2,
      sellFee: 5,
    });
    expectDec(r.grossProceeds, '200');
    expectDec(r.netProceeds, '195');
    expectDec(r.soldCostBasis, '100');
    expectDec(r.realizedPnL, '95');
    expectDec(r.remainingQuantity, '0');
  });

  it('records realized loss correctly', () => {
    const r = calculateSell({
      averageCostBeforeSell: 10,
      availableQuantity: 5,
      sellQuantity: 5,
      sellPrice: 6,
    });
    expectDec(r.realizedPnL, '-20');
  });

  it('rejects sell larger than available quantity', () => {
    expectThrowCode(
      () => calculateSell({ averageCostBeforeSell: 1, availableQuantity: 10, sellQuantity: 11, sellPrice: 2 }),
      ERROR_CODES.INSUFFICIENT_POSITION,
    );
  });

  it('rejects zero sell quantity', () => {
    expectThrowCode(
      () => calculateSell({ averageCostBeforeSell: 1, availableQuantity: 10, sellQuantity: 0, sellPrice: 2 }),
      ERROR_CODES.INVALID_QUANTITY,
    );
  });
});

// ---------------------------------------------------------------------------
// Ledger rebuild
// ---------------------------------------------------------------------------

describe('buildPositionFromLedger', () => {
  it('single buy', () => {
    const p = buildPositionFromLedger([{ type: 'BUY', quantity: 100, pricePerToken: 1 }]);
    expectDec(p.remainingQuantity, '100');
    expectDec(p.averageBuy, '1');
    expectDec(p.remainingCostBasis, '100');
    expectDec(p.realizedPnL, '0');
  });

  it('PLAN §27 full scenario', () => {
    const p = buildPositionFromLedger([
      { type: 'BUY', quantity: 100, pricePerToken: 1 },
      { type: 'BUY', quantity: 100, pricePerToken: 0.5 },
      { type: 'SELL', quantity: 50, pricePerToken: 1 },
    ]);
    expectDec(p.remainingQuantity, '150');
    expectDec(p.averageBuy, '0.75');
    expectDec(p.remainingCostBasis, '112.5');
    expectDec(p.realizedPnL, '12.5');

    const m = computePositionMetrics({
      remainingQuantity: p.remainingQuantity,
      averageBuy: p.averageBuy,
      currentPrice: 0.6,
    });
    expectDec(m.currentValue, '90');
    expectDec(m.unrealizedPnL, '-22.5');
    expectDec(m.unrealizedPnLPercent, '-20');
    expectDec(m.bepPrice, '0.75');
    expectDec(m.recoveryToBepPercent, '25');
  });

  it('full sell leaves zero quantity and zero cost basis, keeps realized PnL', () => {
    const p = buildPositionFromLedger([
      { type: 'BUY', quantity: 10, pricePerToken: 5 },
      { type: 'SELL', quantity: 10, pricePerToken: 7 },
    ]);
    expectDec(p.remainingQuantity, '0');
    expectDec(p.remainingCostBasis, '0');
    expectDec(p.realizedPnL, '20');
  });

  it('buy again after partial sell uses surviving average', () => {
    const p = buildPositionFromLedger([
      { type: 'BUY', quantity: 100, pricePerToken: 1 },
      { type: 'SELL', quantity: 40, pricePerToken: 2 },
      { type: 'BUY', quantity: 40, pricePerToken: 3 },
    ]);
    // old: 60 × 1 = 60 ; new: 40 × 3 = 120 ; total 180 / 100 = 1.8
    expectDec(p.remainingQuantity, '100');
    expectDec(p.averageBuy, '1.8');
    expectDec(p.remainingCostBasis, '180');
    expectDec(p.realizedPnL, '40');
  });

  it('accumulates realized PnL across multiple sells', () => {
    const p = buildPositionFromLedger([
      { type: 'BUY', quantity: 100, pricePerToken: 1 },
      { type: 'SELL', quantity: 30, pricePerToken: 2 },
      { type: 'SELL', quantity: 30, pricePerToken: 0.5 },
    ]);
    // +30 then -15
    expectDec(p.realizedPnL, '15');
    expectDec(p.remainingQuantity, '40');
  });

  it('fees on both sides flow into cost basis and proceeds', () => {
    const p = buildPositionFromLedger([
      { type: 'BUY', quantity: 10, pricePerToken: 10, fee: 10 },
      { type: 'SELL', quantity: 10, pricePerToken: 12, fee: 5 },
    ]);
    // avg = 110/10 = 11 ; proceeds 120-5=115 ; pnl 115-110 = 5
    expectDec(p.averageBuy, '11');
    expectDec(p.realizedPnL, '5');
  });

  it('handles extremely small token price', () => {
    const p = buildPositionFromLedger([
      { type: 'BUY', quantity: '50000000', pricePerToken: '0.00001254' },
    ]);
    expectDec(p.remainingCostBasis, '627');
    expect(p.averageBuy.toString()).toBe('0.00001254');
  });

  it('handles extremely large quantity', () => {
    const p = buildPositionFromLedger([
      { type: 'BUY', quantity: '1000000000000', pricePerToken: '0.000000001' },
    ]);
    expectDec(p.remainingCostBasis, '1000');
    expectDec(p.remainingQuantity, '1000000000000');
  });

  it('rejects oversell mid-ledger', () => {
    expectThrowCode(
      () =>
        buildPositionFromLedger([
          { type: 'BUY', quantity: 5, pricePerToken: 1 },
          { type: 'SELL', quantity: 6, pricePerToken: 1 },
        ]),
      ERROR_CODES.INSUFFICIENT_POSITION,
    );
  });

  it('rejects zero-quantity transaction', () => {
    expectThrowCode(
      () => buildPositionFromLedger([{ type: 'BUY', quantity: 0, pricePerToken: 1 }]),
      ERROR_CODES.INVALID_QUANTITY,
    );
  });

  it('rejects negative-price transaction', () => {
    expectThrowCode(
      () => buildPositionFromLedger([{ type: 'BUY', quantity: 1, pricePerToken: -1 }]),
      ERROR_CODES.INVALID_PRICE,
    );
  });
});

// ---------------------------------------------------------------------------
// Position metrics vs current price
// ---------------------------------------------------------------------------

describe('computePositionMetrics', () => {
  it('computes value, unrealized PnL and BEP', () => {
    const m = computePositionMetrics({ remainingQuantity: 150, averageBuy: 0.75, currentPrice: 0.6 });
    expectDec(m.currentValue, '90');
    expectDec(m.unrealizedPnL, '-22.5');
    expectDec(m.unrealizedPnLPercent, '-20');
    expectDec(m.bepPrice, '0.75');
  });

  it('BEP example: -50% needs +100% recovery', () => {
    const m = computePositionMetrics({ remainingQuantity: 10, averageBuy: 100, currentPrice: 50 });
    expectDec(m.unrealizedPnLPercent, '-50');
    expectDec(m.recoveryToBepPercent, '100');
  });

  it('recovery is 0 when at or above BEP', () => {
    const at = computePositionMetrics({ remainingQuantity: 10, averageBuy: 100, currentPrice: 100 });
    expectDec(at.unrealizedPnL, '0');
    expectDec(at.recoveryToBepPercent, '0');
    const above = computePositionMetrics({ remainingQuantity: 10, averageBuy: 100, currentPrice: 150 });
    expectDec(above.recoveryToBepPercent, '0');
    expectDec(above.unrealizedPnLPercent, '50');
  });

  it('null price yields null market fields, never zero PnL', () => {
    const m = computePositionMetrics({ remainingQuantity: 10, averageBuy: 5, currentPrice: null });
    expect(m.currentPrice).toBeNull();
    expect(m.currentValue).toBeNull();
    expect(m.unrealizedPnL).toBeNull();
    expect(m.unrealizedPnLPercent).toBeNull();
    expect(m.recoveryToBepPercent).toBeNull();
    expectDec(m.bepPrice, '5');
    expectDec(m.remainingCostBasis, '50');
  });

  it('omitted price behaves like null price', () => {
    const m = computePositionMetrics({ remainingQuantity: 10, averageBuy: 5 });
    expect(m.currentValue).toBeNull();
    expect(m.unrealizedPnL).toBeNull();
  });

  it('zero current price gives -100% PnL and null (unbounded) recovery', () => {
    const m = computePositionMetrics({ remainingQuantity: 10, averageBuy: 5, currentPrice: 0 });
    expectDec(m.currentValue, '0');
    expectDec(m.unrealizedPnL, '-50');
    expectDec(m.unrealizedPnLPercent, '-100');
    expect(m.recoveryToBepPercent).toBeNull();
  });

  it('closed position has null BEP and null recovery', () => {
    const m = computePositionMetrics({ remainingQuantity: 0, averageBuy: 5, currentPrice: 10 });
    expectDec(m.currentValue, '0');
    expectDec(m.unrealizedPnL, '0');
    expect(m.unrealizedPnLPercent).toBeNull();
    expect(m.bepPrice).toBeNull();
    expect(m.recoveryToBepPercent).toBeNull();
  });

  it('profit shows positive PnL with + sign intent (value > 0)', () => {
    const m = computePositionMetrics({ remainingQuantity: 2, averageBuy: 100, currentPrice: 152.4 });
    expectDec(m.unrealizedPnL, '104.8');
    expect(m.unrealizedPnL!.gt(0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DCA simulation
// ---------------------------------------------------------------------------

describe('simulateDca', () => {
  it('projects new average and exposure without touching ledger', () => {
    const before = buildPositionFromLedger([{ type: 'BUY', quantity: 100, pricePerToken: 1 }]);
    const sim = simulateDca({
      currentQuantity: before.remainingQuantity,
      currentAverageBuy: before.averageBuy,
      additionalCapital: 200,
      buyPrice: 0.5,
    });
    // +400 tokens @0.5 → 500 tokens, cost 100+200=300, avg 0.6
    expectDec(sim.additionalQuantity, '400');
    expectDec(sim.projectedQuantity, '500');
    expectDec(sim.projectedAverageBuy, '0.6');
    expectDec(sim.projectedCostBasis, '300');
    expectDec(sim.projectedTotalExposure, '300');
    // ledger untouched
    expectDec(before.remainingQuantity, '100');
    expectDec(before.averageBuy, '1');
  });

  it('fee lowers projected quantity economics (raises average)', () => {
    const noFee = simulateDca({ currentQuantity: 100, currentAverageBuy: 1, additionalCapital: 100, buyPrice: 1 });
    const withFee = simulateDca({
      currentQuantity: 100,
      currentAverageBuy: 1,
      additionalCapital: 100,
      buyPrice: 1,
      fee: 10,
    });
    expect(withFee.projectedAverageBuy.gt(noFee.projectedAverageBuy)).toBe(true);
    expectDec(withFee.projectedAverageBuy, '1.05');
  });

  it('reports before/after recovery when current price given', () => {
    const sim = simulateDca({
      currentQuantity: 10,
      currentAverageBuy: 100,
      additionalCapital: 500,
      buyPrice: 50,
      currentPrice: 60,
    });
    // before: BEP 100 @ 60 → 66.67% ; after must be lower
    expect(sim.currentRecoveryToBepPercent).not.toBeNull();
    expect(sim.projectedRecoveryToBepPercent).not.toBeNull();
    expect(sim.projectedRecoveryToBepPercent!.lt(sim.currentRecoveryToBepPercent!)).toBe(true);
  });

  it('recovery fields are null when no current price given', () => {
    const sim = simulateDca({ currentQuantity: 10, currentAverageBuy: 100, additionalCapital: 100, buyPrice: 50 });
    expect(sim.currentRecoveryToBepPercent).toBeNull();
    expect(sim.projectedRecoveryToBepPercent).toBeNull();
  });

  it('rejects zero/negative capital', () => {
    expectThrowCode(
      () => simulateDca({ currentQuantity: 10, currentAverageBuy: 1, additionalCapital: 0, buyPrice: 1 }),
      ERROR_CODES.INVALID_CAPITAL,
    );
  });
});
