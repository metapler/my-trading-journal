import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { AddTokenModal } from '../components/AddTokenModal'
import { AllocationPanel } from '../components/AllocationPanel'
import { PortfolioHero } from '../components/PortfolioHero'
import { PortfolioSummary } from '../components/PortfolioSummary'
import { PositionsPreview } from '../components/PositionsPreview'
import { PriceStatusBadge } from '../components/PriceStatusBadge'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/QueryState'
import { RecentActivity } from '../components/RecentActivity'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../hooks/useToast'
import { usePortfolioSummary, usePositions } from '../hooks/usePortfolio'
import { useAssets } from '../hooks/useAssets'
import { formatEpoch } from '../lib/format'
import { useState } from 'react'

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Request failed.'
}

// Static indicator payload — computed once at module load, never in render.
const STALE_BADGE_PRICE = {
  priceUsd: '0',
  source: 'cache',
  fetchedAt: '1970-01-01T00:00:00.000Z',
  cached: true,
  stale: true,
  ageMs: 0,
}

/**
 * Dashboard (REDESIGN §5): hero chart dominates (~70–75% of content width on
 * ≥1280px), summary + allocation rail right, positions preview + activity
 * below. DOM order stays header → hero → summary → allocation → positions →
 * activity for mobile. No big summary-card row above the hero.
 */
export function DashboardPage() {
  const { notify } = useToast()
  const summary = usePortfolioSummary()
  const positions = usePositions()
  const assets = useAssets()
  const [addTokenOpen, setAddTokenOpen] = useState(false)
  const lastSummaryError = useRef<string | null>(null)
  const lastPositionsError = useRef<string | null>(null)

  useEffect(() => {
    if (summary.isError && !summary.isFetching) {
      const msg = errorMessage(summary.error)
      if (lastSummaryError.current !== msg) {
        lastSummaryError.current = msg
        notify('error', `Portfolio summary failed: ${msg}`)
      }
    }
    if (!summary.isError) lastSummaryError.current = null
  }, [summary.isError, summary.isFetching, summary.error, notify])

  useEffect(() => {
    if (positions.isError && !positions.isFetching) {
      const msg = errorMessage(positions.error)
      if (lastPositionsError.current !== msg) {
        lastPositionsError.current = msg
        notify('error', `Positions failed: ${msg}`)
      }
    }
    if (!positions.isError) lastPositionsError.current = null
  }, [positions.isError, positions.isFetching, positions.error, notify])

  const summaryFailed = summary.isError && !summary.isLoading
  const positionsFailed = positions.isError && !positions.isLoading

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Dashboard"
        description={`Nilai posisi aktif dan PnL — diperbarui ${formatEpoch(summary.dataUpdatedAt ?? positions.dataUpdatedAt ?? null)}.`}
        actions={
          <Link to="/transactions">
            <Button variant="primary">Tambah transaksi</Button>
          </Link>
        }
      />

      {/* Main grid: hero ~70–75%, rail 300px (320px on xl). */}
      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {summary.isLoading ? (
            <LoadingSkeleton rows={4} />
          ) : summaryFailed ? (
            <ErrorState
              message={errorMessage(summary.error)}
              onRetry={() => summary.refetch()}
              retrying={summary.isFetching}
            />
          ) : summary.data ? (
            <PortfolioHero summary={summary.data} />
          ) : null}
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-1">
          {summary.isLoading ? (
            <LoadingSkeleton rows={3} />
          ) : summaryFailed ? null : summary.data ? (
            <PortfolioSummary summary={summary.data} />
          ) : null}
          {positions.isLoading ? (
            <LoadingSkeleton rows={3} />
          ) : positionsFailed ? null : positions.data ? (
            <AllocationPanel positions={positions.data} />
          ) : null}
        </div>
      </div>

      {/* Positions preview across both columns (max 8). */}
      {positions.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : positions.isError ? (
        <ErrorState
          message={errorMessage(positions.error)}
          onRetry={() => positions.refetch()}
          retrying={positions.isFetching}
        />
      ) : positions.data && positions.data.length > 0 ? (
        <>
          <PositionsPreview positions={positions.data} />
          {positions.data.some((p) => p.priceStale) ? (
            <div className="flex items-center gap-2 text-xs text-amber-300">
              <PriceStatusBadge price={STALE_BADGE_PRICE} />
              <span>Some prices are stale — values use last-known data.</span>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          title="No positions yet"
          hint="Add your first token and record a BUY to start tracking. Prices refresh automatically once positions exist."
          action={
            <Button variant="primary" onClick={() => setAddTokenOpen(true)}>
              Add your first token
            </Button>
          }
        />
      )}

      {/* Recent activity: 5 latest ledger entries. */}
      {!positions.isLoading && !positionsFailed && positions.data && assets.data ? (
        <RecentActivity assets={assets.data} positions={positions.data} />
      ) : null}

      <AddTokenModal open={addTokenOpen} onClose={() => setAddTokenOpen(false)} />
    </div>
  )
}
