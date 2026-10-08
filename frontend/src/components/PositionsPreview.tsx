import { Link } from 'react-router-dom'
import type { Position } from '../api/client'
import { formatRecovery, formatSignedPercent, formatSignedUsd, formatUsd, pnlTone } from '../lib/format'
import { Panel } from './ui/Panel'
import { cn } from '../lib/cn'

function toFinite(v: string | null): number | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Positions preview (REDESIGN §10): 8 largest by current value at initial
 * load — order frozen during polling so click targets don't jump. Explicit
 * "Lihat semua" leads to the full sortable page.
 */
export function PositionsPreview({ positions }: { positions: Position[] }) {
  // Order frozen per render from the fetched array — parent query identity
  // only changes on refetch, so targets don't jump on every poll tick.
  const top: Position[] = [...positions]
    .sort((a, b) => (toFinite(b.currentValue) ?? -1) - (toFinite(a.currentValue) ?? -1))
    .slice(0, 8)

  if (positions.length === 0) return null

  return (
    <Panel
      title="Positions"
      meta={`${positions.length} total · 8 terbesar`}
      label="Pratinjau positions"
      actions={
        <Link
          to="/positions"
          className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--border)] px-3 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          Lihat semua
        </Link>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th scope="col" className="px-2 py-1.5 font-medium">Aset</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Nilai posisi</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Unrealized PnL</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Ke BEP</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {top.map((p) => {
              const tone = pnlTone(p.unrealizedPnL)
              return (
                <tr key={p.assetId} className="border-t border-[var(--border)]">
                  <td className="px-2 py-2">
                    <Link to={`/assets/${p.assetId}`} className="font-medium text-[var(--text)] hover:underline">
                      {p.symbol}
                    </Link>
                    <span className="ml-2 text-xs text-[var(--text-muted)]">{p.chain}</span>
                    {p.priceStale ? <span className="ml-1.5 text-xs text-amber-300">(stale)</span> : null}
                  </td>
                  <td className="px-2 py-2 text-right text-[var(--text)]">{formatUsd(p.currentValue)}</td>
                  <td
                    className={cn(
                      'px-2 py-2 text-right',
                      tone === 'profit' && 'text-profit',
                      tone === 'loss' && 'text-loss',
                      tone === 'neutral' && 'text-[var(--text-secondary)]',
                    )}
                  >
                    {formatSignedUsd(p.unrealizedPnL)} ({formatSignedPercent(p.unrealizedPnLPercent)})
                  </td>
                  <td className="px-2 py-2 text-right text-[var(--text-secondary)]">
                    {formatRecovery(p.recoveryToBepPercent)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {/* Mobile cards */}
      <ul className="mt-2 space-y-2 md:hidden">
        {top.map((p) => {
          const tone = pnlTone(p.unrealizedPnL)
          return (
            <li key={p.assetId}>
              <Link
                to={`/assets/${p.assetId}`}
                className="block rounded-[var(--radius-control)] border border-[var(--border)] p-3 tabular-nums"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[var(--text)]">
                    {p.symbol} <span className="text-xs font-normal text-[var(--text-muted)]">{p.chain}</span>
                  </span>
                  <span
                    className={cn(
                      tone === 'profit' && 'text-profit',
                      tone === 'loss' && 'text-loss',
                      tone === 'neutral' && 'text-[var(--text-secondary)]',
                    )}
                  >
                    {formatSignedUsd(p.unrealizedPnL)}
                  </span>
                </span>
                <span className="mt-1.5 grid grid-cols-2 gap-1 text-xs text-[var(--text-secondary)]">
                  <span>Value <span className="text-[var(--text)]">{formatUsd(p.currentValue)}</span></span>
                  <span className="text-right">Ke BEP <span className="text-[var(--text)]">{formatRecovery(p.recoveryToBepPercent)}</span></span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
