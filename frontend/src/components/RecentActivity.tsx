import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getAssetTransactions, type Asset, type Position } from '../api/client'
import { formatDateTime, formatQty, formatUsd } from '../lib/format'
import { Panel } from './ui/Panel'
import { LoadingSkeleton } from './QueryState'
import { cn } from '../lib/cn'

export interface ActivityRow {
  id: string
  assetId: string
  symbol: string
  type: 'BUY' | 'SELL'
  quantity: string
  pricePerToken: string
  executedAt: string
}

/**
 * Recent activity (REDESIGN §5): 5 latest transactions across assets.
 * Reuses the per-asset ledger endpoint + cached asset list — no new API.
 * Polling stays off here; parent queries refresh on mutations.
 */
export function RecentActivity({ assets, positions }: { assets: Asset[]; positions: Position[] }) {
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])
  // Cap fan-out: query the 12 most valuable positions (preview shows 8).
  const ids = useMemo(() => {
    const val = (p: Position) => {
      const n = p.currentValue === null ? -1 : Number(p.currentValue)
      return Number.isFinite(n) ? (n as number) : -1
    }
    return [...positions].sort((a, b) => val(b) - val(a)).slice(0, 12).map((p) => p.assetId)
  }, [positions])

  const txQueries = useQueries({
    queries: ids.map((assetId) => ({
      queryKey: ['transactions', assetId],
      queryFn: ({ signal }: { signal: AbortSignal }) => getAssetTransactions(assetId, signal),
      staleTime: 30_000,
      retry: 1,
    })),
  })

  const loading = txQueries.some((q) => q.isLoading)
  const rows: ActivityRow[] = useMemo(() => {
    const all: ActivityRow[] = []
    txQueries.forEach((q, i) => {
      const assetId = ids[i]
      const symbol = byId.get(assetId)?.symbol ?? '—'
      for (const t of q.data ?? []) {
        all.push({
          id: t.id,
          assetId,
          symbol,
          type: t.type,
          quantity: t.quantity,
          pricePerToken: t.pricePerToken,
          executedAt: t.executedAt,
        })
      }
    })
    return all.sort((a, b) => Date.parse(b.executedAt) - Date.parse(a.executedAt)).slice(0, 5)
  }, [txQueries, ids, byId])

  if (positions.length === 0) return null

  return (
    <Panel
      title="Aktivitas terakhir"
      meta="5 transaksi terbaru"
      label="Aktivitas terakhir"
      actions={
        <Link
          to="/transactions"
          className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--border)] px-3 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          Semua transaksi
        </Link>
      }
    >
      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Belum ada transaksi tercatat.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
              <span
                aria-hidden
                className={cn(
                  'inline-flex h-7 w-14 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold',
                  r.type === 'BUY' ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300',
                )}
              >
                {r.type}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <Link to={`/assets/${r.assetId}`} className="font-medium text-[var(--text)] hover:underline">
                  {r.symbol}
                </Link>{' '}
                <span className="font-mono text-xs text-[var(--text-secondary)] tabular-nums">
                  {formatQty(r.quantity)} @ {formatUsd(r.pricePerToken)}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs text-[var(--text-muted)] tabular-nums">
                {formatDateTime(r.executedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
