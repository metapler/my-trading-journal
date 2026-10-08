import type { Position } from '../api/client'

/** Neutral categorical hues — never green/red (allocation ≠ profit). */
export const ALLOCATION_COLORS = ['#7c8db0', '#8f7cc9', '#5aa9a3', '#9a8a5f', '#6b7f9e', '#565d6b']

export interface AllocationSlice {
  assetId: string
  symbol: string
  value: number
  weight: number
  color: string
}

function toFinite(v: string | null): number | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Top-N + Others weights over priced positions on one quote snapshot.
 * Unpriced rows excluded from the total and counted separately (§10).
 */
export function allocationSlices(
  positions: Position[],
  topN = 5,
): { slices: AllocationSlice[]; total: number; unpriced: number } {
  const priced = positions
    .map((p) => ({ p, value: toFinite(p.currentValue) }))
    .filter((x): x is { p: Position; value: number } => x.value !== null)
  const total = priced.reduce((a, x) => a + x.value, 0)
  const sorted = [...priced].sort((a, b) => b.value - a.value)
  const head = sorted.slice(0, topN)
  const rest = sorted.slice(topN)
  const slices: AllocationSlice[] = head.map((x, i) => ({
    assetId: x.p.assetId,
    symbol: x.p.symbol,
    value: x.value,
    weight: total > 0 ? (x.value / total) * 100 : 0,
    color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
  }))
  if (rest.length > 0) {
    const restValue = rest.reduce((a, x) => a + x.value, 0)
    slices.push({
      assetId: '__others__',
      symbol: `Others (${rest.length})`,
      value: restValue,
      weight: total > 0 ? (restValue / total) * 100 : 0,
      color: ALLOCATION_COLORS[topN % ALLOCATION_COLORS.length],
    })
  }
  return { slices, total, unpriced: positions.length - priced.length }
}
