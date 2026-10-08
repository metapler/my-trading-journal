import type { HistoryPoint, PortfolioHistory } from '../api/client'

/** Plot-ready point: numeric value only when the snapshot holds a full total. */
export interface PlotPoint {
  t: number
  value: number | null
  quality: HistoryPoint['quality']
  capturedAt: string
}

function toFiniteNumber(v: string | null): number | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Normalize the history contract into plot points. Rules (§7–8):
 * - timestamps are real (sorted, never re-spaced);
 * - null valueUsd (partial/unavailable) breaks the line — never forward-fill;
 * - non-finite decimals never reach the plot.
 */
export function toPlotPoints(history: PortfolioHistory | null | undefined): PlotPoint[] {
  if (!history) return []
  return history.points
    .map((p) => ({ t: Date.parse(p.capturedAt), value: toFiniteNumber(p.valueUsd), quality: p.quality, capturedAt: p.capturedAt }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t)
}

/** Split points into contiguous non-null segments so gaps break the line. */
export function toLineSegments(points: PlotPoint[]): PlotPoint[][] {
  const segments: PlotPoint[][] = []
  let current: PlotPoint[] = []
  for (const p of points) {
    if (p.value === null) {
      if (current.length > 0) {
        segments.push(current)
        current = []
      }
      continue
    }
    current.push(p)
  }
  if (current.length > 0) segments.push(current)
  return segments
}

export interface HistoryDelta {
  start: PlotPoint | null
  end: PlotPoint | null
  deltaValue: number | null
  deltaPercent: number | null
  /** False when start is 0/missing — caller must render nominal + '—'. */
  percentValid: boolean
  /** False when the endpoint predates the requested range (limited coverage). */
  fullCoverage: boolean
}

/**
 * Honest delta (§8): end − start over the visible endpoints only. BUY/SELL
 * moves are value changes, never labeled return. Percent only when start > 0.
 */
export function historyDelta(history: PortfolioHistory | null | undefined): HistoryDelta {
  const points = toPlotPoints(history).filter((p) => p.value !== null)
  const fullCoverage = history?.coverage === 'full'
  if (points.length < 2) {
    return {
      start: points[0] ?? null,
      end: points[points.length - 1] ?? null,
      deltaValue: null,
      deltaPercent: null,
      percentValid: false,
      fullCoverage,
    }
  }
  const start = points[0]
  const end = points[points.length - 1]
  const deltaValue = (end.value as number) - (start.value as number)
  const percentValid = (start.value as number) > 0
  const deltaPercent = percentValid ? (deltaValue / (start.value as number)) * 100 : null
  return { start, end, deltaValue, deltaPercent, percentValid, fullCoverage }
}

/** Single-point history → marker state, never a flat fake line (§9.4). */
export function isSinglePoint(history: PortfolioHistory | null | undefined): boolean {
  return (history?.points.length ?? 0) === 1
}
