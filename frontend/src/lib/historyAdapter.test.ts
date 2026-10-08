import { describe, expect, it } from 'vitest'
import type { PortfolioHistory } from '../api/client'
import { historyDelta, isSinglePoint, toLineSegments, toPlotPoints } from './historyAdapter'

function history(points: PortfolioHistory['points'], coverage: PortfolioHistory['coverage'] = 'full'): PortfolioHistory {
  return {
    currency: 'USD',
    metric: 'active_positions_value',
    source: 'observed_snapshots',
    requestedRange: '30d',
    requestedFrom: '2026-09-04T00:00:00.000Z',
    availableFrom: points[0]?.capturedAt ?? null,
    availableTo: points[points.length - 1]?.capturedAt ?? null,
    generatedAt: '2026-10-04T00:00:00.000Z',
    intervalSeconds: 300,
    coverage,
    invalidatedFrom: null,
    points,
  }
}

describe('historyAdapter', () => {
  it('sorts by real timestamp and keeps nulls as gap markers', () => {
    const h = history([
      { capturedAt: '2026-10-03T00:00:00.000Z', valueUsd: '150', activeCostBasisUsd: '100', quality: 'complete' },
      { capturedAt: '2026-10-04T00:00:00.000Z', valueUsd: null, activeCostBasisUsd: '100', quality: 'partial' },
      { capturedAt: '2026-10-02T00:00:00.000Z', valueUsd: '100', activeCostBasisUsd: '100', quality: 'complete' },
    ])
    const pts = toPlotPoints(h)
    expect(pts.map((p) => p.capturedAt)).toEqual([
      '2026-10-02T00:00:00.000Z',
      '2026-10-03T00:00:00.000Z',
      '2026-10-04T00:00:00.000Z',
    ])
    expect(pts[2].value).toBeNull()
    // Gap splits the line — never connected across null.
    expect(toLineSegments(pts)).toHaveLength(1)
  })

  it('computes honest delta; percent invalid when start is 0', () => {
    const h = history([
      { capturedAt: '2026-10-02T00:00:00.000Z', valueUsd: '100', activeCostBasisUsd: '90', quality: 'complete' },
      { capturedAt: '2026-10-03T00:00:00.000Z', valueUsd: '150', activeCostBasisUsd: '90', quality: 'complete' },
    ])
    const d = historyDelta(h)
    expect(d.deltaValue).toBe(50)
    expect(d.deltaPercent).toBe(50)
    expect(d.percentValid).toBe(true)

    const zero = history([
      { capturedAt: '2026-10-02T00:00:00.000Z', valueUsd: '0', activeCostBasisUsd: '0', quality: 'complete' },
      { capturedAt: '2026-10-03T00:00:00.000Z', valueUsd: '150', activeCostBasisUsd: '90', quality: 'complete' },
    ])
    const dz = historyDelta(zero)
    expect(dz.deltaValue).toBe(150)
    expect(dz.percentValid).toBe(false)
    expect(dz.deltaPercent).toBeNull()
  })

  it('flags single-point history so UI renders a marker, not a line', () => {
    const h = history([
      { capturedAt: '2026-10-03T00:00:00.000Z', valueUsd: '150', activeCostBasisUsd: '100', quality: 'complete' },
    ])
    expect(isSinglePoint(h)).toBe(true)
    expect(historyDelta(h).deltaValue).toBeNull()
  })

  it('drops non-finite decimals before plotting', () => {
    const h = history([
      { capturedAt: '2026-10-02T00:00:00.000Z', valueUsd: 'abc', activeCostBasisUsd: '90', quality: 'complete' },
      { capturedAt: 'not-a-date', valueUsd: '150', activeCostBasisUsd: '90', quality: 'complete' },
    ])
    const pts = toPlotPoints(h)
    expect(pts).toHaveLength(1)
    expect(pts[0].value).toBeNull()
  })
})
