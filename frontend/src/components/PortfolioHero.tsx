import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { HistoryRange, PortfolioSummary } from '../api/client'
import { HISTORY_RANGES, usePortfolioHistory } from '../hooks/usePortfolioHistory'
import { historyDelta } from '../lib/historyAdapter'
import { formatDateTime, formatSignedPercent, formatSignedUsd, formatUsd } from '../lib/format'
import { cn } from '../lib/cn'
import { Panel } from './ui/Panel'
import { HistoryRangeControl } from './HistoryRangeControl'
import { PortfolioHistoryChart } from './PortfolioHistoryChart'
import { EmptyState, ErrorState } from './QueryState'
import { Button } from './ui/Button'

function rangeLabel(range: HistoryRange): string {
  return range === 'all' ? 'ALL' : range.toUpperCase().replace('D', 'D').replace('H', 'H')
}

/**
 * Hero portfolio panel (REDESIGN §5–7): largest dashboard panel —
 * current active-position value, honest range delta, range control, chart,
 * legend, and data quality. Summary PnL stays range-independent.
 */
export function PortfolioHero({ summary }: { summary: PortfolioSummary }) {
  const [range, setRange] = useState<HistoryRange>('30d')
  const [showCost, setShowCost] = useState(false)
  const query = usePortfolioHistory(range)
  const history = query.data ?? null
  const delta = historyDelta(history)

  const headline = formatUsd(summary.portfolioValue)
  const hasTxs = summary.openPositions + summary.closedPositions > 0

  return (
    <Panel
      title="Nilai posisi aktif"
      meta="USD · nilai pasar posisi yang masih dimiliki"
      label="Nilai posisi aktif"
      glint
      className="min-w-0"
      actions={<HistoryRangeControl value={range} onChange={setRange} disabled={query.isFetching && !history} />}
    >
      <p className="font-mono text-4xl font-light tracking-tight text-white tabular-nums sm:text-5xl">
        {headline}
      </p>

      {/* Honest range delta — value change incl. BUY/SELL, never "return". */}
      {query.isLoading || query.isError || !history || history.points.length === 0 ? null : delta.start &&
        delta.end &&
        delta.deltaValue !== null ? (
        <p className="mt-1.5 text-sm text-[var(--text-secondary)] tabular-nums">
          Perubahan nilai {rangeLabel(range)}:{' '}
          <span className={cn(delta.deltaValue > 0 && 'text-profit', delta.deltaValue < 0 && 'text-loss')}>
            {formatSignedUsd(delta.deltaValue)}{' '}
            {delta.percentValid && delta.deltaPercent !== null ? `(${formatSignedPercent(delta.deltaPercent)})` : '(—)'}
          </span>{' '}
          <span className="text-xs text-[var(--text-muted)]">
            Sejak {formatDateTime(delta.start.capturedAt)}
            {history.coverage === 'limited' ? ' · cakupan terbatas' : ''}
          </span>
        </p>
      ) : null}
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Mencakup perubahan akibat BUY/SELL. Bukan persentase return.
      </p>

      <div className="mt-4 min-w-0">
        {query.isLoading && !history ? (
          <PortfolioHistoryChart history={null} isLoading showCost={showCost} onToggleCost={setShowCost} />
        ) : query.isError ? (
          <ErrorState
            message={query.error instanceof Error ? query.error.message : 'Gagal memuat histori.'}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : !history || history.points.length === 0 ? (
          !hasTxs ? (
            <EmptyState
              title="Mulai catat transaksi untuk membangun histori portofolio"
              hint="Histori direkam dari pengamatan nyata mulai sekarang — tanpa data palsu."
              action={
                <Link to="/transactions">
                  <Button variant="primary">Tambah transaksi pertama</Button>
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="Histori mulai direkam sejak sekarang"
              hint="Posisi aktif sudah bernilai — titik pengamatan berikutnya mengisi grafik (tiap 5 menit)."
              action={
                <p className="font-mono text-sm text-[var(--text)] tabular-nums">
                  Nilai terkini {formatUsd(summary.portfolioValue)}
                </p>
              }
            />
          )
        ) : history.points.length === 1 ? (
          <div className="space-y-3">
            <PortfolioHistoryChart history={history} isLoading={false} showCost={showCost} onToggleCost={setShowCost} />
            <p role="status" className="text-sm text-[var(--text-secondary)]">
              Satu titik pengamatan ({formatDateTime(history.points[0].capturedAt)}) — menunggu pengamatan berikutnya.
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Range-switch loading: overlay in-panel, shell intact, stale label kept. */}
            {query.isFetching ? (
              <p role="status" aria-live="polite" className="absolute top-0 right-0 rounded-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                Memuat {rangeLabel(range)}…
              </p>
            ) : null}
            <PortfolioHistoryChart history={history} isLoading={false} showCost={showCost} onToggleCost={setShowCost} />
            {history.coverage === 'limited' && history.availableFrom ? (
              <p role="note" className="mt-2 text-xs text-[var(--text-secondary)]">
                Cakupan terbatas — tersedia sejak {formatDateTime(history.availableFrom)}
                {history.availableTo ? ` sampai ${formatDateTime(history.availableTo)}` : ''}.
                {HISTORY_RANGES.includes('all') ? (
                  <>
                    {' '}<button type="button" onClick={() => setRange('all')} className="underline hover:text-[var(--text)]">Lihat ALL</button>
                  </>
                ) : null}
              </p>
            ) : null}
            {history.invalidatedFrom ? (
              <p role="note" className="mt-2 rounded-[var(--radius-control)] border border-amber-800/60 bg-amber-950/40 p-2.5 text-xs text-amber-200">
                Histori sebelum koreksi ledger ({formatDateTime(history.invalidatedFrom)}) — delta lintas periode
                tersebut tidak ditampilkan sebagai return.
              </p>
            ) : null}
            {history.availableTo ? (
              <p className="mt-2 font-mono text-xs text-[var(--text-muted)] tabular-nums">
                Histori sampai {formatDateTime(history.availableTo)}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </Panel>
  )
}
