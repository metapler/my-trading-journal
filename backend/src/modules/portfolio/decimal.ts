import Decimal from 'decimal.js';

// High precision for crypto math (tiny prices × huge quantities).
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type DecimalInput = string | number | Decimal;

export function toDecimal(value: DecimalInput, name: string): Decimal {
  try {
    const d = value instanceof Decimal ? new Decimal(value.toString()) : new Decimal(value);
    if (!d.isFinite()) throw new Error('non-finite');
    return d;
  } catch {
    throw new Error(`Invalid decimal for ${name}: ${String(value)}`);
  }
}

export function isPositive(d: Decimal): boolean {
  return d.gt(0);
}

export function isNonNegative(d: Decimal): boolean {
  return d.gte(0);
}
