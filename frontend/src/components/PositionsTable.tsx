import { ArrowDown, ArrowUp, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Position } from '../api/client'
import { formatQty, formatRecovery, formatSignedPercent, formatSignedUsd, formatUsd, pnlTone } from '../lib/format'
import { cn } from '../lib/cn'
import { formatUpdatedAt } from '../hooks/usePrices'

type SortKey = 'symbol' | 'currentValue' | 'unrealizedPnL' | 'unrealizedPnLPercent' | 'recoveryToBepPercent'

const sortLabels: Record<SortKey, string> = {
  symbol: 'Token',
  currentValue: 'Current Value',
  unrealizedPnL: 'PnL',
  unrealizedPnLPercent: 'PnL %',
  recoveryToBepPercent: 'Need to BEP',
}

function numOrNull(v: string | null): number | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function comparePositions(a: Position, b: Position, key: SortKey, dir: 1 | -1): number {
  if (key === 'symbol') return a.symbol.localeCompare(b.symbol) * dir
  // Nulls (unknown) always sink to the bottom regardless of direction.
  const av = numOrNull(key === 'currentValue' ? a.currentValue : key === 'unrealizedPnL' ? a.unrealizedPnL : key === 'unrealizedPnLPercent' ? a.unrealizedPnLPercent : a.recoveryToBepPercent)
  const bv = numOrNull(key === 'currentValue' ? b.currentValue : key === 'unrealizedPnL' ? b.unrealizedPnL : key === 'unrealizedPnLPercent' ? b.unrealizedPnLPercent : b.recoveryToBepPercent)
  if (av === null && bv === null) return 0
  if (av === null) return 1
  if (bv === null) return -1
  return (av - bv) * dir
}

function PnlCell({ value, percent }: { value: string | null; percent: string | null }) {
  const tone = pnlTone(value)
  const Icon = tone === 'profit' ? TrendingUp : tone === 'loss' ? TrendingDown : Minus
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 tabular-nums',
        tone === 'profit' && 'text-profit',
        tone === 'loss' && 'text-loss',
        tone === 'neutral' && 'text-[var(--text-secondary)]',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {formatSignedUsd(value)} ({formatSignedPercent(percent)})
    </span>
  )
}

export function PositionsTable({ positions }: { positions: Position[] }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('currentValue')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = q
      ? positions.filter(
          (p) =>
            p.symbol.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            p.chain.toLowerCase().includes(q),
        )
      : [...positions]
    rows.sort((a, b) => comparePositions(a, b, sortKey, sortDir))
    return rows
  }, [positions, query, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1))
    } else {
      setSortKey(key)
      setSortDir(key === 'symbol' ? 1 : -1)
    }
  }

  const sortButton = (key: SortKey) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      aria-label={`Sort by ${sortLabels[key]}`}
      aria-pressed={sortKey === key}
      className="inline-flex min-h-11 items-center gap-1 hover:text-[var(--text)]"
    >
      {sortLabels[key]}
      {sortKey === key ? (
        sortDir === 1 ? (
          <ArrowUp className="h-3 w-3" aria-hidden />
        ) : (
          <ArrowDown className="h-3 w-3" aria-hidden />
        )
      ) : null}
    </button>
  )

  return (
    <section aria-label="Positions">
      <div className="mb-3 flex items-center gap-2">
        <label htmlFor="positions-search" className="sr-only">
          Search positions
        </label>
          <input
          id="positions-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search token, name, or chain…"
          className="min-h-11 w-full max-w-xs rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--text-muted)] focus:border-[var(--focus)] focus:outline-none"
        />
        <span className="text-xs text-[var(--text-secondary)]" role="status">
          {filtered.length} of {positions.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-[var(--radius-control)] border border-[var(--border)] p-6 text-center text-sm text-[var(--text-secondary)]">
          No positions match “{query}”.
        </p>
      ) : null}

      {/* Desktop table — labeled local scroll, never page-level overflow (§10). */}
      <div className="hidden overflow-x-auto rounded-[var(--radius-control)] border border-[var(--border)] md:block" role="region" aria-label="Positions table" tabIndex={0}>
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)]">
              <th scope="col" className="px-3 py-2 font-medium">
                {sortButton('symbol')}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Chain
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Quantity
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Avg Buy
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Current Price
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Cost Basis
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {sortButton('currentValue')}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {sortButton('unrealizedPnL')}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {sortButton('unrealizedPnLPercent')}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {sortButton('recoveryToBepPercent')}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Last Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.assetId}
                onClick={() => navigate(`/assets/${p.assetId}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') navigate(`/assets/${p.assetId}`)
                }}
                tabIndex={0}
                className="cursor-pointer border-b border-[var(--border)] tabular-nums last:border-0 hover:bg-[var(--surface-hover)] focus:bg-[var(--surface-hover)] focus:outline-none"
                title={`${p.name} — open detail`}
              >
                <td className="px-3 py-2">
                  <span className="font-medium text-[var(--text)]">{p.symbol}</span>
                  <span className="ml-2 text-xs text-[var(--text-secondary)]">{p.name}</span>
                </td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">{p.chain}</td>
                <td className="px-3 py-2 text-right text-[var(--text)]">{formatQty(p.remainingQuantity)}</td>
                <td className="px-3 py-2 text-right text-[var(--text)]">{formatUsd(p.averageBuy)}</td>
                <td className="px-3 py-2 text-right text-[var(--text)]">
                  {formatUsd(p.currentPrice)}
                  {p.priceStale ? <span className="ml-1 text-[11px] text-amber-400">(stale)</span> : null}
                </td>
                <td className="px-3 py-2 text-right text-[var(--text)]">{formatUsd(p.remainingCostBasis)}</td>
                <td className="px-3 py-2 text-right text-[var(--text)]">{formatUsd(p.currentValue)}</td>
                <td className="px-3 py-2 text-right">
                  <PnlCell value={p.unrealizedPnL} percent={p.unrealizedPnLPercent} />
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={cn(
                      'tabular-nums',
                      pnlTone(p.unrealizedPnLPercent) === 'profit' && 'text-profit',
                      pnlTone(p.unrealizedPnLPercent) === 'loss' && 'text-loss',
                      pnlTone(p.unrealizedPnLPercent) === 'neutral' && 'text-[var(--text-secondary)]',
                    )}
                  >
                    {formatSignedPercent(p.unrealizedPnLPercent)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-[var(--text)]">{formatRecovery(p.recoveryToBepPercent)}</td>
                <td className="px-3 py-2 text-right text-xs text-[var(--text-secondary)]">{formatUpdatedAt(p.priceFetchedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {filtered.map((p) => (
          <button
            key={p.assetId}
            type="button"
            onClick={() => navigate(`/assets/${p.assetId}`)}
            className="w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-3 text-left tabular-nums"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-[var(--text)]">
                {p.symbol} <span className="text-xs font-normal text-[var(--text-secondary)]">{p.chain}</span>
              </span>
              <PnlCell value={p.unrealizedPnL} percent={p.unrealizedPnLPercent} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-[var(--text-secondary)]">
              <span>
                Qty <span className="text-[var(--text)]">{formatQty(p.remainingQuantity)}</span>
              </span>
              <span className="text-right">
                Price <span className="text-[var(--text)]">{formatUsd(p.currentPrice)}</span>
                {p.priceStale ? <span className="ml-1 text-[11px] text-amber-400">(stale)</span> : null}
              </span>
              <span>
                Value <span className="text-[var(--text)]">{formatUsd(p.currentValue)}</span>
              </span>
              <span className="text-right">
                Need to BEP <span className="text-[var(--text)]">{formatRecovery(p.recoveryToBepPercent)}</span>
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
