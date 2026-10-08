import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/QueryState'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel } from '../components/ui/Panel'
import { useToast } from '../hooks/useToast'
import { useAnalytics } from '../hooks/usePortfolio'
import { formatEpoch, formatPercent, formatSignedUsd, pnlTone } from '../lib/format'
import { cn } from '../lib/cn'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.'
}

function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
  title,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'profit' | 'loss' | 'neutral'
  title?: string
}) {
  return (
    <div role="listitem" title={title} className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p
        className={cn(
          'mt-2 font-mono text-lg font-semibold tabular-nums',
          tone === 'profit' && 'text-profit',
          tone === 'loss' && 'text-loss',
          tone === 'neutral' && 'text-[var(--text)]',
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 font-mono text-xs text-[var(--text-secondary)] tabular-nums">{sub}</p> : null}
    </div>
  )
}

/**
 * Performance (PLAN §19): closed-trade stats only. Nothing renders as valid
 * until at least one position is fully exited — otherwise the PLAN-mandated
 * "Not enough closed trades yet." empty state shows.
 */
export function AnalyticsPage() {
  const { notify } = useToast()
  const analytics = useAnalytics()
  const lastError = useRef<string | null>(null)

  useEffect(() => {
    if (analytics.isError && !analytics.isFetching) {
      const msg = errorMessage(analytics.error)
      if (lastError.current !== msg) {
        lastError.current = msg
        notify('error', `Analytics failed: ${msg}`)
      }
    }
    if (!analytics.isError) lastError.current = null
  }, [analytics.isError, analytics.isFetching, analytics.error, notify])

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Performance"
        description={`Closed-trade record — wins, losses, strategy breakdown · updated ${formatEpoch(analytics.dataUpdatedAt ?? null)}.`}
        actions={
          <Button variant="secondary" onClick={() => analytics.refetch()} disabled={analytics.isFetching}>
            {analytics.isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />

      {analytics.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : analytics.isError ? (
        <ErrorState
          message={errorMessage(analytics.error)}
          onRetry={() => analytics.refetch()}
          retrying={analytics.isFetching}
        />
      ) : analytics.data && !analytics.data.hasEnoughData ? (
        <EmptyState
          title="Not enough closed trades yet."
          hint="Close a position fully (sell the entire remaining quantity) and its realized PnL will feed win rate, averages, extremes, and strategy breakdowns here."
          action={
            <Link
              to="/positions"
              className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              View positions
            </Link>
          }
        />
      ) : analytics.data ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" role="list" aria-label="Closed-trade stats">
            <StatCard
              label="Total Realized PnL"
              value={formatSignedUsd(analytics.data.totalRealizedPnL)}
              tone={pnlTone(analytics.data.totalRealizedPnL)}
              title="Sum of realized PnL across fully exited ledgers"
            />
            <StatCard
              label="Total Unrealized PnL"
              value={`${formatSignedUsd(analytics.data.totalUnrealizedPnL)}`}
              tone={pnlTone(analytics.data.totalUnrealizedPnL)}
              sub={
                analytics.data.priceCoverage.withoutPrice > 0
                  ? `${analytics.data.priceCoverage.withoutPrice} position(s) without price excluded`
                  : 'Priced open positions only'
              }
              title="Open profit/loss for positions with a market price"
            />
            <StatCard
              label="Win Rate"
              value={formatPercent(analytics.data.winRate)}
              sub={`${analytics.data.winningPositions}W · ${analytics.data.losingPositions}L · ${analytics.data.closedPositions} closed`}
              title="Winning closed positions ÷ all closed positions"
            />
            <StatCard
              label="Avg Winner / Avg Loser"
              value={`${formatSignedUsd(analytics.data.averageWinner)} / ${formatSignedUsd(analytics.data.averageLoser)}`}
              title="Mean realized PnL of winners vs losers"
            />
          </div>

          <section aria-label="Extremes" className="grid gap-5 sm:grid-cols-2">
            <Panel title="Largest Realized Winner" label="Largest realized winner">
              {analytics.data.largestRealizedWinner ? (
                <>
                  <p className="mt-2 font-mono text-lg font-semibold tabular-nums text-profit">
                    {formatSignedUsd(analytics.data.largestRealizedWinner.realizedPnL)}
                  </p>
                  <Link
                    to={`/assets/${analytics.data.largestRealizedWinner.assetId}`}
                    className="mt-1 inline-block text-sm text-[var(--text-secondary)] hover:text-[var(--text)] hover:underline"
                  >
                    {analytics.data.largestRealizedWinner.symbol} →
                  </Link>
                </>
              ) : (
                <p className="mt-2 text-sm text-[var(--text-secondary)]">No winning closed trades yet.</p>
              )}
            </Panel>
            <Panel title="Largest Realized Loser" label="Largest realized loser">
              {analytics.data.largestRealizedLoser ? (
                <>
                  <p className="mt-2 font-mono text-lg font-semibold tabular-nums text-loss">
                    {formatSignedUsd(analytics.data.largestRealizedLoser.realizedPnL)}
                  </p>
                  <Link
                    to={`/assets/${analytics.data.largestRealizedLoser.assetId}`}
                    className="mt-1 inline-block text-sm text-[var(--text-secondary)] hover:text-[var(--text)] hover:underline"
                  >
                    {analytics.data.largestRealizedLoser.symbol} →
                  </Link>
                </>
              ) : (
                <p className="mt-2 text-sm text-[var(--text-secondary)]">No losing closed trades yet.</p>
              )}
            </Panel>
          </section>

          <Panel title="Performance by Strategy" label="Performance by strategy">
            {analytics.data.performanceByStrategy.length > 0 ? (
              <div className="overflow-x-auto" role="region" aria-label="Strategy table" tabIndex={0}>
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)]">
                      <th scope="col" className="px-3 py-2 font-medium">Strategy</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Closed</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Realized PnL</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {analytics.data.performanceByStrategy.map((row) => (
                      <tr key={row.strategy} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-3 py-2 text-[var(--text)]">{row.strategy}</td>
                        <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{row.closedPositions}</td>
                        <td
                          className={cn(
                            'px-3 py-2 text-right',
                            pnlTone(row.realizedPnL) === 'profit' && 'text-profit',
                            pnlTone(row.realizedPnL) === 'loss' && 'text-loss',
                            pnlTone(row.realizedPnL) === 'neutral' && 'text-[var(--text-secondary)]',
                          )}
                        >
                          {formatSignedUsd(row.realizedPnL)}
                        </td>
                        <td className="px-3 py-2 text-right text-[var(--text-secondary)]">
                          {formatPercent(row.winRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-[var(--radius-control)] border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
                No strategy tags on closed trades yet — add a strategy in the trade journal to unlock this
                breakdown.
              </p>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  )
}
