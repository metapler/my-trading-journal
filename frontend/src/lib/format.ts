/**
 * Centralized number formatting (PLAN §20). Adaptive precision: never force
 * all tokens to 2 decimals. Financial values use tabular numbers via CSS.
 */

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** Adaptive USD: $1,234.56 for large, $0.00001254 for dust. Null → '—'. */
export function formatUsd(value: string | number | null | undefined): string {
  const n = toNumber(value)
  if (n === null) return '—'
  const abs = Math.abs(n)
  let digits: number
  if (abs === 0) digits = 2
  else if (abs >= 1000) digits = 2
  else if (abs >= 1) digits = 2
  else if (abs >= 0.01) digits = 4
  else if (abs >= 0.0001) digits = 6
  else digits = 8
  return (
    '$' +
    n.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  )
}

/** Compact USD for axis/header use: $1.28M, $142.52K. */
export function formatUsdCompact(value: string | number | null | undefined): string {
  const n = toNumber(value)
  if (n === null) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`
  return formatUsd(n)
}

/** Signed USD with explicit + / − (PLAN §12: never color-only). */
export function formatSignedUsd(value: string | number | null | undefined): string {
  const n = toNumber(value)
  if (n === null) return '—'
  if (n === 0) return '$0.00'
  return (n > 0 ? '+' : '−') + formatUsd(Math.abs(n))
}

/** Signed percent: +12.42%, −7.13%. */
export function formatSignedPercent(value: string | number | null | undefined): string {
  const n = toNumber(value)
  if (n === null) return '—'
  if (n === 0) return '0.00%'
  const sign = n > 0 ? '+' : '−'
  return `${sign}${Math.abs(n).toFixed(2)}%`
}

/** Unsigned percent for rates that can't be negative (win rate): 50.00%. */
export function formatPercent(value: string | number | null | undefined): string {
  const n = toNumber(value)
  if (n === null) return '—'
  return `${n.toFixed(2)}%`
}

/** Locale date-time for timestamps. Invalid → '—'. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

/** Token quantity with adaptive decimals (up to 8, trimmed). */
export function formatQty(value: string | number | null | undefined): string {
  const n = toNumber(value)
  if (n === null) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 8 })
}

/** Epoch-ms → locale time string for "Last updated" labels. */
export function formatEpoch(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'never'
  return new Date(ms).toLocaleTimeString()
}

/** Recovery display: "+25.00%" or "—" when at/above BEP (0) or unknown. */
export function formatRecovery(value: string | number | null | undefined): string {
  const n = toNumber(value)
  if (n === null) return '—'
  if (n === 0) return '—'
  return `+${n.toFixed(2)}%`
}

/** PnL tone for color + sign (color is never the only signal). */
export type PnlTone = 'profit' | 'loss' | 'neutral'

export function pnlTone(value: string | number | null | undefined): PnlTone {
  const n = toNumber(value)
  if (n === null || n === 0) return 'neutral'
  return n > 0 ? 'profit' : 'loss'
}
