import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { AddTokenModal } from '../components/AddTokenModal'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/QueryState'
import { PositionsTable } from '../components/PositionsTable'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../hooks/useToast'
import { usePositions } from '../hooks/usePortfolio'
import { formatEpoch } from '../lib/format'

export function PositionsPage() {
  const { notify } = useToast()
  const positions = usePositions()
  const [addTokenOpen, setAddTokenOpen] = useState(false)
  const lastError = useRef<string | null>(null)

  useEffect(() => {
    if (positions.isError && !positions.isFetching) {
      const msg = positions.error instanceof Error ? positions.error.message : 'Request failed.'
      if (lastError.current !== msg) {
        lastError.current = msg
        notify('error', `Positions failed: ${msg}`)
      }
    }
    if (!positions.isError) lastError.current = null
  }, [positions.isError, positions.isFetching, positions.error, notify])

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Positions"
        description={`Every open and closed position with PnL · updated ${formatEpoch(positions.dataUpdatedAt ?? null)}.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setAddTokenOpen(true)}>
              <Plus className="h-[18px] w-[18px]" aria-hidden /> Add Token
            </Button>
            <Button variant="secondary" onClick={() => positions.refetch()} disabled={positions.isFetching}>
              {positions.isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
          </>
        }
      />

      {positions.isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : positions.isError ? (
        <ErrorState
          message={positions.error instanceof Error ? positions.error.message : 'Request failed.'}
          onRetry={() => positions.refetch()}
          retrying={positions.isFetching}
        />
      ) : positions.data && positions.data.length > 0 ? (
        <PositionsTable positions={positions.data} />
      ) : (
        <EmptyState
          title="No positions yet"
          hint="Add your first token and record a BUY to see it here with live value and PnL."
          action={
            <Button variant="primary" onClick={() => setAddTokenOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Add Token
            </Button>
          }
        />
      )}

      <AddTokenModal open={addTokenOpen} onClose={() => setAddTokenOpen(false)} />
    </div>
  )
}
