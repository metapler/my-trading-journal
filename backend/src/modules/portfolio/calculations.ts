import Decimal from 'decimal.js';
import { isNonNegative, isPositive, toDecimal, type DecimalInput } from './decimal';

export type { DecimalInput };

export const ERROR_CODES = {
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  INVALID_PRICE: 'INVALID_PRICE',
  INVALID_FEE: 'INVALID_FEE',
  INVALID_CAPITAL: 'INVALID_CAPITAL',
  INSUFFICIENT_POSITION: 'INSUFFICIENT_POSITION',
} as const;

export type CalculationErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class CalculationError extends Error {
  readonly code: CalculationErrorCode;

  constructor(code: CalculationErrorCode, message: string) {
    super(message);
    this.name = 'CalculationError';
    this.code = code;
  }
}

export type TxType = 'BUY' | 'SELL';

export interface LedgerTransaction {
  type: TxType;
  quantity: DecimalInput;
  pricePerToken: DecimalInput;
  fee?: DecimalInput;
}

// ---------------------------------------------------------------------------
// BUY — moving weighted-average cost basis (PLAN §7)
// ---------------------------------------------------------------------------

export interface BuyInput {
  oldQuantity: DecimalInput;
  oldAverageCost: DecimalInput;
  buyQuantity: DecimalInput;
  buyPrice: DecimalInput;
  buyFee?: DecimalInput;
}

export interface BuyResult {
  oldCostBasis: Decimal;
  newBuyCost: Decimal;
  newQuantity: Decimal;
  newAverageCost: Decimal;
  newCostBasis: Decimal;
}

export function calculateBuy(input: BuyInput): BuyResult {
  const oldQuantity = toDecimal(input.oldQuantity, 'oldQuantity');
  const oldAverageCost = toDecimal(input.oldAverageCost, 'oldAverageCost');
  const buyQuantity = toDecimal(input.buyQuantity, 'buyQuantity');
  const buyPrice = toDecimal(input.buyPrice, 'buyPrice');
  const buyFee = input.buyFee === undefined ? new Decimal(0) : toDecimal(input.buyFee, 'buyFee');

  if (!isNonNegative(oldQuantity)) {
    throw new CalculationError(ERROR_CODES.INVALID_QUANTITY, 'Old quantity must be >= 0.');
  }
  if (!isNonNegative(oldAverageCost)) {
    throw new CalculationError(ERROR_CODES.INVALID_PRICE, 'Old average cost must be >= 0.');
  }
  if (!isPositive(buyQuantity)) {
    throw new CalculationError(ERROR_CODES.INVALID_QUANTITY, 'Buy quantity must be > 0.');
  }
  if (!isPositive(buyPrice)) {
    throw new CalculationError(ERROR_CODES.INVALID_PRICE, 'Buy price must be > 0.');
  }
  if (!isNonNegative(buyFee)) {
    throw new CalculationError(ERROR_CODES.INVALID_FEE, 'Buy fee must be >= 0.');
  }

  const oldCostBasis = oldQuantity.mul(oldAverageCost);
  const newBuyCost = buyQuantity.mul(buyPrice).plus(buyFee);
  const newQuantity = oldQuantity.plus(buyQuantity);
  // newQuantity > 0 guaranteed (buyQuantity > 0, oldQuantity >= 0).
  const newAverageCost = oldCostBasis.plus(newBuyCost).div(newQuantity);
  const newCostBasis = newQuantity.mul(newAverageCost);

  return { oldCostBasis, newBuyCost, newQuantity, newAverageCost, newCostBasis };
}

// ---------------------------------------------------------------------------
// SELL — average-cost method; remaining average unchanged (PLAN §7)
// ---------------------------------------------------------------------------

export interface SellInput {
  averageCostBeforeSell: DecimalInput;
  availableQuantity: DecimalInput;
  sellQuantity: DecimalInput;
  sellPrice: DecimalInput;
  sellFee?: DecimalInput;
}

export interface SellResult {
  remainingQuantity: Decimal;
  averageCost: Decimal;
  grossProceeds: Decimal;
  netProceeds: Decimal;
  soldCostBasis: Decimal;
  realizedPnL: Decimal;
}

export function calculateSell(input: SellInput): SellResult {
  const averageCost = toDecimal(input.averageCostBeforeSell, 'averageCostBeforeSell');
  const availableQuantity = toDecimal(input.availableQuantity, 'availableQuantity');
  const sellQuantity = toDecimal(input.sellQuantity, 'sellQuantity');
  const sellPrice = toDecimal(input.sellPrice, 'sellPrice');
  const sellFee = input.sellFee === undefined ? new Decimal(0) : toDecimal(input.sellFee, 'sellFee');

  if (!isNonNegative(averageCost)) {
    throw new CalculationError(ERROR_CODES.INVALID_PRICE, 'Average cost before sell must be >= 0.');
  }
  if (!isNonNegative(availableQuantity)) {
    throw new CalculationError(ERROR_CODES.INVALID_QUANTITY, 'Available quantity must be >= 0.');
  }
  if (!isPositive(sellQuantity)) {
    throw new CalculationError(ERROR_CODES.INVALID_QUANTITY, 'Sell quantity must be > 0.');
  }
  if (!isPositive(sellPrice)) {
    throw new CalculationError(ERROR_CODES.INVALID_PRICE, 'Sell price must be > 0.');
  }
  if (!isNonNegative(sellFee)) {
    throw new CalculationError(ERROR_CODES.INVALID_FEE, 'Sell fee must be >= 0.');
  }
  if (sellQuantity.gt(availableQuantity)) {
    throw new CalculationError(ERROR_CODES.INSUFFICIENT_POSITION, 'Sell quantity exceeds current position.');
  }

  const grossProceeds = sellQuantity.mul(sellPrice);
  const netProceeds = grossProceeds.minus(sellFee);
  const soldCostBasis = sellQuantity.mul(averageCost);
  const realizedPnL = netProceeds.minus(soldCostBasis);
  const remainingQuantity = availableQuantity.minus(sellQuantity);

  return { remainingQuantity, averageCost, grossProceeds, netProceeds, soldCostBasis, realizedPnL };
}

// ---------------------------------------------------------------------------
// Ledger rebuild — transaction list is source of truth (PLAN §3.1)
// ---------------------------------------------------------------------------

export interface LedgerPosition {
  remainingQuantity: Decimal;
  /** Last weighted-average cost (kept even after full exit for history). */
  averageBuy: Decimal;
  remainingCostBasis: Decimal;
  realizedPnL: Decimal;
}

export function buildPositionFromLedger(transactions: LedgerTransaction[]): LedgerPosition {
  let quantity = new Decimal(0);
  let averageBuy = new Decimal(0);
  let realizedPnL = new Decimal(0);

  for (const tx of transactions) {
    const qty = toDecimal(tx.quantity, 'quantity');
    const price = toDecimal(tx.pricePerToken, 'pricePerToken');
    const fee = tx.fee === undefined ? new Decimal(0) : toDecimal(tx.fee, 'fee');

    if (!isPositive(qty)) {
      throw new CalculationError(ERROR_CODES.INVALID_QUANTITY, 'Transaction quantity must be > 0.');
    }
    if (!isPositive(price)) {
      throw new CalculationError(ERROR_CODES.INVALID_PRICE, 'Transaction price must be > 0.');
    }
    if (!isNonNegative(fee)) {
      throw new CalculationError(ERROR_CODES.INVALID_FEE, 'Transaction fee must be >= 0.');
    }

    if (tx.type === 'BUY') {
      const res = calculateBuy({
        oldQuantity: quantity,
        oldAverageCost: averageBuy,
        buyQuantity: qty,
        buyPrice: price,
        buyFee: fee,
      });
      quantity = res.newQuantity;
      averageBuy = res.newAverageCost;
    } else if (tx.type === 'SELL') {
      const res = calculateSell({
        averageCostBeforeSell: averageBuy,
        availableQuantity: quantity,
        sellQuantity: qty,
        sellPrice: price,
        sellFee: fee,
      });
      quantity = res.remainingQuantity;
      realizedPnL = realizedPnL.plus(res.realizedPnL);
      // averageBuy intentionally unchanged (average-cost method).
    } else {
      throw new CalculationError(ERROR_CODES.INVALID_QUANTITY, `Unknown transaction type: ${String(tx.type)}`);
    }
  }

  const remainingCostBasis = quantity.mul(averageBuy);
  return { remainingQuantity: quantity, averageBuy, remainingCostBasis, realizedPnL };
}

// ---------------------------------------------------------------------------
// Position metrics vs current price (PLAN §8)
// ---------------------------------------------------------------------------

export interface PositionMetricsInput {
  remainingQuantity: DecimalInput;
  averageBuy: DecimalInput;
  /** Current market price. Null/undefined = unavailable (never coerced to 0). */
  currentPrice?: DecimalInput | null;
}

export interface PositionMetrics {
  remainingQuantity: Decimal;
  averageBuy: Decimal;
  remainingCostBasis: Decimal;
  /** Null when price unavailable. */
  currentPrice: Decimal | null;
  /** Null when price unavailable. */
  currentValue: Decimal | null;
  /** Null when price unavailable. 0 when flat/closed with no exposure. */
  unrealizedPnL: Decimal | null;
  /** Null when price unavailable or no cost basis. */
  unrealizedPnLPercent: Decimal | null;
  /** Null when no remaining quantity. Equals averageBuy otherwise. */
  bepPrice: Decimal | null;
  /** 0 when at/above BEP; null when not computable. */
  recoveryToBepPercent: Decimal | null;
}

export function computePositionMetrics(input: PositionMetricsInput): PositionMetrics {
  const remainingQuantity = toDecimal(input.remainingQuantity, 'remainingQuantity');
  const averageBuy = toDecimal(input.averageBuy, 'averageBuy');

  if (remainingQuantity.lt(0)) {
    throw new CalculationError(ERROR_CODES.INVALID_QUANTITY, 'Remaining quantity must be >= 0.');
  }
  if (!isNonNegative(averageBuy)) {
    throw new CalculationError(ERROR_CODES.INVALID_PRICE, 'Average buy must be >= 0.');
  }

  let currentPrice: Decimal | null = null;
  if (input.currentPrice !== undefined && input.currentPrice !== null) {
    const p = toDecimal(input.currentPrice, 'currentPrice');
    if (p.lt(0)) {
      throw new CalculationError(ERROR_CODES.INVALID_PRICE, 'Current price must be >= 0.');
    }
    currentPrice = p;
  }

  const remainingCostBasis = remainingQuantity.mul(averageBuy);
  const bepPrice = remainingQuantity.gt(0) ? remainingCostBasis.div(remainingQuantity) : null;

  if (currentPrice === null) {
    return {
      remainingQuantity,
      averageBuy,
      remainingCostBasis,
      currentPrice: null,
      currentValue: null,
      unrealizedPnL: null,
      unrealizedPnLPercent: null,
      bepPrice,
      recoveryToBepPercent: null,
    };
  }

  const currentValue = remainingQuantity.mul(currentPrice);
  const unrealizedPnL = currentValue.minus(remainingCostBasis);
  const unrealizedPnLPercent = remainingCostBasis.gt(0)
    ? unrealizedPnL.div(remainingCostBasis).mul(100)
    : null;

  let recoveryToBepPercent: Decimal | null = null;
  if (bepPrice !== null && remainingQuantity.gt(0)) {
    if (currentPrice.gte(bepPrice)) {
      recoveryToBepPercent = new Decimal(0);
    } else if (currentPrice.gt(0)) {
      recoveryToBepPercent = bepPrice.div(currentPrice).minus(1).mul(100);
    } else {
      // Current price is 0 while BEP > 0: recovery is unbounded.
      recoveryToBepPercent = null;
    }
  } else if (remainingQuantity.eq(0)) {
    recoveryToBepPercent = null;
  }

  return {
    remainingQuantity,
    averageBuy,
    remainingCostBasis,
    currentPrice,
    currentValue,
    unrealizedPnL,
    unrealizedPnLPercent,
    bepPrice,
    recoveryToBepPercent,
  };
}

// ---------------------------------------------------------------------------
// DCA simulation — pure projection, never persists (PLAN Phase 9 preview)
// ---------------------------------------------------------------------------

export interface DcaSimulationInput {
  currentQuantity: DecimalInput;
  currentAverageBuy: DecimalInput;
  /** Principal allocated to tokens; fee is added on top into cost basis. */
  additionalCapital: DecimalInput;
  buyPrice: DecimalInput;
  fee?: DecimalInput;
  /** Optional market price used to derive before/after recovery %. */
  currentPrice?: DecimalInput | null;
}

export interface DcaSimulation {
  additionalQuantity: Decimal;
  currentQuantity: Decimal;
  projectedQuantity: Decimal;
  currentAverageBuy: Decimal;
  projectedAverageBuy: Decimal;
  currentCostBasis: Decimal;
  projectedCostBasis: Decimal;
  projectedTotalExposure: Decimal;
  currentRecoveryToBepPercent: Decimal | null;
  projectedRecoveryToBepPercent: Decimal | null;
}

export function simulateDca(input: DcaSimulationInput): DcaSimulation {
  const currentQuantity = toDecimal(input.currentQuantity, 'currentQuantity');
  const currentAverageBuy = toDecimal(input.currentAverageBuy, 'currentAverageBuy');
  const additionalCapital = toDecimal(input.additionalCapital, 'additionalCapital');
  const buyPrice = toDecimal(input.buyPrice, 'buyPrice');
  const fee = input.fee === undefined ? new Decimal(0) : toDecimal(input.fee, 'fee');

  if (currentQuantity.lt(0)) {
    throw new CalculationError(ERROR_CODES.INVALID_QUANTITY, 'Current quantity must be >= 0.');
  }
  if (!isNonNegative(currentAverageBuy)) {
    throw new CalculationError(ERROR_CODES.INVALID_PRICE, 'Current average buy must be >= 0.');
  }
  if (!isPositive(additionalCapital)) {
    throw new CalculationError(ERROR_CODES.INVALID_CAPITAL, 'Additional capital must be > 0.');
  }
  if (!isPositive(buyPrice)) {
    throw new CalculationError(ERROR_CODES.INVALID_PRICE, 'DCA buy price must be > 0.');
  }
  if (!isNonNegative(fee)) {
    throw new CalculationError(ERROR_CODES.INVALID_FEE, 'DCA fee must be >= 0.');
  }

  const additionalQuantity = additionalCapital.div(buyPrice);
  const buyRes = calculateBuy({
    oldQuantity: currentQuantity,
    oldAverageCost: currentAverageBuy,
    buyQuantity: additionalQuantity,
    buyPrice,
    buyFee: fee,
  });

  const currentCostBasis = currentQuantity.mul(currentAverageBuy);
  const projectedCostBasis = buyRes.newCostBasis;

  let currentRecoveryToBepPercent: Decimal | null = null;
  let projectedRecoveryToBepPercent: Decimal | null = null;
  if (input.currentPrice !== undefined && input.currentPrice !== null) {
    const before = computePositionMetrics({
      remainingQuantity: currentQuantity,
      averageBuy: currentAverageBuy,
      currentPrice: input.currentPrice,
    });
    const after = computePositionMetrics({
      remainingQuantity: buyRes.newQuantity,
      averageBuy: buyRes.newAverageCost,
      currentPrice: input.currentPrice,
    });
    currentRecoveryToBepPercent = before.recoveryToBepPercent;
    projectedRecoveryToBepPercent = after.recoveryToBepPercent;
  }

  return {
    additionalQuantity,
    currentQuantity,
    projectedQuantity: buyRes.newQuantity,
    currentAverageBuy,
    projectedAverageBuy: buyRes.newAverageCost,
    currentCostBasis,
    projectedCostBasis,
    projectedTotalExposure: projectedCostBasis,
    currentRecoveryToBepPercent,
    projectedRecoveryToBepPercent,
  };
}
