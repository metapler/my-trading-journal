import Decimal from 'decimal.js';

/** Canonical decimal string, or null when missing/invalid. */
export function decString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  try {
    const d = new Decimal(typeof value === 'string' || typeof value === 'number' ? value : String(value));
    if (!d.isFinite()) return null;
    return d.toString();
  } catch {
    return null;
  }
}

export function numValue(value: unknown): number {
  const s = decString(value);
  if (s === null) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
