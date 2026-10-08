import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/QueryState'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../hooks/useToast'
import { useJournals } from '../hooks/useJournal'
import { formatDateTime } from '../lib/format'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.'
}

/**
 * Journal list (PLAN §17): every asset journal with thesis excerpt, strategy
 * tag, and recency. Deep-links to the per-asset editor on the detail page.
 */
export function JournalPage() {
  const { notify } = useToast()
  const journals = useJournals()
  const lastError = useRef<string | null>(null)

  useEffect(() => {
    if (journals.isError && !journals.isFetching) {
      const msg = errorMessage(journals.error)
      if (lastError.current !== msg) {
        lastError.current = msg
        notify('error', `Journals failed: ${msg}`)
      }
    }
    if (!journals.isError) lastError.current = null
  }, [journals.isError, journals.isFetching, journals.error, notify])

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Trade Journal"
        description="Structured thesis and review per asset — the raw material for future strategy analytics."
        actions={
          <Button variant="secondary" onClick={() => journals.refetch()} disabled={journals.isFetching}>
            {journals.isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />

      {journals.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : journals.isError ? (
        <ErrorState
          message={errorMessage(journals.error)}
          onRetry={() => journals.refetch()}
          retrying={journals.isFetching}
        />
      ) : journals.data && journals.data.length > 0 ? (
        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          {journals.data.map((j) => (
            <Link
              key={j.id}
              to={`/assets/${j.assetId}#journal`}
              className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--text-muted)]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-[var(--text)]">
                  {j.asset.symbol} <span className="text-xs font-normal text-[var(--text-secondary)]">{j.asset.chain}</span>
                </span>
                {j.strategy ? (
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                    {j.strategy}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-[var(--text-secondary)]">
                {j.thesis || j.entryReason || j.postTradeReview || 'No thesis yet — open to write one.'}
              </p>
              {j.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {j.tags.slice(0, 5).map((t) => (
                    <span key={t} className="rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 font-mono text-xs text-[var(--text-muted)] tabular-nums">
                Updated {formatDateTime(j.updatedAt)}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No journal entries yet"
          hint="Open any token and write the thesis — pre-trade reasoning and post-trade review, structured for later analysis."
        />
      )}
    </div>
  )
}
