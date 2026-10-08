import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Position } from '../api/client'
import { allocationSlices } from '../lib/allocation'
import { formatUsd } from '../lib/format'
import { Panel } from './ui/Panel'
import { cn } from '../lib/cn'

/**
 * Asset allocation (REDESIGN §10): horizontal stacked bar + top-5 + Others,
 * weights over priced positions on one quote snapshot. Text carries every
 * value (never color-only).
 */
export function AllocationPanel({ positions }: { positions: Position[] }) {
  const [expanded, setExpanded] = useState(false)
  const { slices, total, unpriced } = allocationSlices(positions)

  if (positions.length === 0) return null // Dashboard empty state owns this case.
  if (slices.length === 0) {
    return (
      <Panel title="Alokasi aset" meta="Bobot per nilai posisi" label="Alokasi aset">
        <p className="text-sm text-[var(--text-secondary)]">
          Belum ada harga tersedia — alokasi menunggu quote pasar.
        </p>
      </Panel>
    )
  }

  const visible = expanded ? slices : slices.slice(0, 6)

  return (
    <Panel
      title="Alokasi aset"
      meta={unpriced > 0 ? `Aset dengan harga tersedia · ${unpriced} belum terhitung` : 'Bobot per nilai posisi'}
      label="Alokasi aset"
    >
      <div
        role="img"
        aria-label={`Alokasi: ${slices.map((s) => `${s.symbol} ${s.weight.toFixed(1)} persen`).join(', ')}.`}
        className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-hover)]"
      >
        {slices.map((s) => (
          <span
            key={s.assetId}
            aria-hidden
            title={`${s.symbol} — ${s.weight.toFixed(2)}%`}
            style={{ width: `${s.weight}%`, backgroundColor: s.color, minWidth: s.weight > 0 ? 2 : 0 }}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {visible.map((s) => (
          <li key={s.assetId} className="flex items-center gap-2 text-sm">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.assetId === '__others__' ? (
              <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{s.symbol}</span>
            ) : (
              <Link
                to={`/assets/${s.assetId}`}
                className="min-w-0 flex-1 truncate text-[var(--text)] hover:underline"
              >
                {s.symbol}
              </Link>
            )}
            <span className="font-mono text-xs text-[var(--text-secondary)] tabular-nums">{formatUsd(s.value)}</span>
            <span className={cn('w-14 text-right font-mono text-xs tabular-nums text-[var(--text)]')}>
              {s.weight.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between">
        <p className="font-mono text-xs text-[var(--text-muted)] tabular-nums">
          Total terharga {formatUsd(total)}
        </p>
        <div className="flex gap-2">
          {slices.length > 6 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border)] px-3 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              {expanded ? 'Ringkas' : 'Others'}
            </button>
          ) : null}
          <Link
            to="/positions"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--border)] px-3 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            Lihat Positions
          </Link>
        </div>
      </div>
    </Panel>
  )
}
