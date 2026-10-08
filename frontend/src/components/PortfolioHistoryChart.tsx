import { useId, useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PortfolioHistory } from '../api/client'
import { toPlotPoints, type PlotPoint } from '../lib/historyAdapter'
import { formatDateTime, formatUsd, formatUsdCompact } from '../lib/format'
import { LoadingSkeleton } from './QueryState'
import { cn } from '../lib/cn'

export const HISTORY_PLOT_MIN_DESKTOP = 340
export const HISTORY_PLOT_MIN_MOBILE = 240

interface Row extends PlotPoint {
  /** Numeric ms timestamp powers the time-scale X axis (§7.2). */
  ts: number
  /** Cost-basis overlay value (null breaks only its own dashed line). */
  cost: number | null
}

function toFinite(v: string | null): number | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function tickLabel(ts: number): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fullLabel(iso: string): string {
  return formatDateTime(iso)
}

function QualityDot({ quality }: { quality: PlotPoint['quality'] }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-1.5 w-1.5 rounded-full',
        quality === 'complete' && 'bg-emerald-400',
        quality === 'stale' && 'bg-amber-400',
        (quality === 'partial' || quality === 'unavailable') && 'bg-[var(--text-muted)]',
      )}
    />
  )
}

function ChartTooltip({
  active,
  payload,
  showCost,
}: {
  active?: boolean
  payload?: Array<{ payload: Row }>
  showCost: boolean
}) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  return (
    <div className="max-w-64 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-xs shadow-xl">
      <p className="font-medium text-[var(--text)]">{fullLabel(row.capturedAt)}</p>
      <p className="mt-1 font-mono text-sm text-[var(--text)] tabular-nums">
        {row.value === null ? '—' : formatUsd(row.value)}
      </p>
      {showCost ? (
        <p className="mt-0.5 font-mono text-[var(--text-secondary)] tabular-nums">
          Modal aktif: {row.cost === null ? '—' : formatUsd(row.cost)}
        </p>
      ) : null}
      <p className="mt-1 flex items-center gap-1.5 text-[var(--text-muted)]">
        <QualityDot quality={row.quality} />
        {row.quality === 'complete'
          ? 'complete'
          : row.quality === 'stale'
            ? 'stale — last-known quotes'
            : row.quality === 'partial'
              ? 'partial — some quotes missing'
              : 'unavailable'}
      </p>
    </div>
  )
}

/**
 * Hero history chart (REDESIGN §7): linear line + low-fill area over real
 * timestamps, zero-baseline Y for area mode, gaps break the line, linear
 * interpolation only (no smoothing that invents peaks). Optional gold
 * dashed cost-basis overlay ("Modal posisi tersisa", never total deposit).
 */
export function PortfolioHistoryChart({
  history,
  isLoading,
  showCost: showCostProp,
  onToggleCost,
}: {
  history: PortfolioHistory | null | undefined
  isLoading: boolean
  showCost: boolean
  onToggleCost: (v: boolean) => void
}) {
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [tableOpen, setTableOpen] = useState(false)

  const rows: Row[] = useMemo(() => {
    const pts = toPlotPoints(history)
    return pts.map((p) => {
      const raw = history?.points.find((q) => q.capturedAt === p.capturedAt)
      return { ...p, ts: p.t, cost: toFinite(raw?.activeCostBasisUsd ?? null) }
    })
  }, [history])

  const single = rows.length === 1
  const last = rows.length > 0 ? rows[rows.length - 1] : null

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading history">
        <LoadingSkeleton rows={3} />
      </div>
    )
  }

  if (rows.length === 0) return null // Caller renders the §9.4 empty state.

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-5 rounded bg-[#ece7d8]" />
          Nilai posisi aktif (USD)
        </span>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={showCostProp}
            onChange={(e) => onToggleCost(e.target.checked)}
            className="h-4 w-4 accent-[#d4af37]"
          />
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0 w-5 border-t-2 border-dashed border-[#d4af37]" />
            Modal posisi tersisa
          </span>
        </label>
        <button
          type="button"
          onClick={() => setTableOpen((v) => !v)}
          aria-expanded={tableOpen}
          className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border)] px-3 text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          {tableOpen ? 'Sembunyikan data' : 'Lihat data'}
        </button>
      </div>

      <div
        role="img"
        aria-label={`Grafik nilai posisi aktif: ${rows.length} titik dari ${fullLabel(rows[0].capturedAt)} sampai ${fullLabel(rows[rows.length - 1].capturedAt)}.`}
        className="h-[240px] min-w-0 sm:h-[340px] lg:h-[380px]"
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`heroFill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ece7d8" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#ece7d8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(232,230,223,0.08)" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
              tickFormatter={tickLabel}
              tick={{ fill: '#9297a1', fontSize: 11, fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              minTickGap={48}
            />
            <YAxis
              domain={[0, 'auto']}
              tickFormatter={(v: number) => formatUsdCompact(v)}
              tick={{ fill: '#9297a1', fontSize: 11, fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip content={<ChartTooltip showCost={showCostProp} />} cursor={{ stroke: 'rgba(232,230,223,0.25)', strokeWidth: 1 }} />
            {/* Nulls break the line: connectNulls unset (false). Linear only. */}
            <Area
              type="linear"
              dataKey="value"
              name="Nilai posisi aktif"
              stroke="#ece7d8"
              strokeWidth={2}
              fill={`url(#heroFill-${gradientId})`}
              dot={false}
              activeDot={{ r: 3, fill: '#ece7d8', stroke: '#07080a' }}
              isAnimationActive={false}
            />
            {showCostProp ? (
              <Line
                type="linear"
                dataKey="cost"
                name="Modal posisi tersisa"
                stroke="#d4af37"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ) : null}
            {single && last && last.value !== null ? (
              <ReferenceDot x={last.ts} y={last.value} r={4} fill="#ece7d8" stroke="#07080a" />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {tableOpen ? (
        <div className="mt-3 max-h-64 overflow-auto rounded-[var(--radius-control)] border border-[var(--border)]">
          <table className="w-full text-xs">
            <caption className="sr-only">Data histori nilai posisi aktif per waktu pengamatan</caption>
            <thead className="sticky top-0 bg-[var(--surface-raised)]">
              <tr className="text-left text-[var(--text-secondary)]">
                <th scope="col" className="px-3 py-2 font-medium">Waktu</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Nilai (USD)</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Modal aktif</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Kualitas</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {rows.map((r) => (
                <tr key={r.capturedAt} className="border-t border-[var(--border)] text-[var(--text)]">
                  <td className="px-3 py-1.5">{fullLabel(r.capturedAt)}</td>
                  <td className="px-3 py-1.5 text-right">{r.value === null ? '—' : formatUsd(r.value)}</td>
                  <td className="px-3 py-1.5 text-right">{r.cost === null ? '—' : formatUsd(r.cost)}</td>
                  <td className="px-3 py-1.5 text-right">{r.quality}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
