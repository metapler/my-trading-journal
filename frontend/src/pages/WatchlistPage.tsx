import { zodResolver } from '@hookform/resolvers/zod'
import { BellOff, LoaderCircle, Save, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import type { WatchlistRow } from '../api/client'
import { AddTokenModal } from '../components/AddTokenModal'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/QueryState'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { apiErrorMessage } from '../hooks/useMutations'
import { useToast } from '../hooks/useToast'
import { useRemoveWatchlist, useUpsertWatchlist, useWatchlist } from '../hooks/useWatchlist'
import { formatEpoch, formatSignedPercent, formatUsd } from '../lib/format'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.'
}

const targetSchema = z.object({
  targetEntryPrice: z
    .string()
    .trim()
    .refine(
      (v) => {
        if (v === '') return true
        if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) return false
        const n = Number(v)
        return Number.isFinite(n) && n > 0
      },
      { message: 'Target must be > 0 (or empty to clear).' },
    ),
  note: z.string().trim().max(2000).optional().default(''),
})

type TargetForm = z.output<typeof targetSchema>
type TargetFormInput = z.input<typeof targetSchema>

function directionLabel(row: WatchlistRow): string {
  if (row.targetDirection === 'above') return 'target above price'
  if (row.targetDirection === 'below') return 'target below price'
  if (row.targetDirection === 'at') return 'at target'
  return '—'
}

function TargetForm({ row }: { row: WatchlistRow }) {
  const { notify } = useToast()
  const upsert = useUpsertWatchlist()
  const [editing, setEditing] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TargetFormInput, unknown, TargetForm>({ resolver: zodResolver(targetSchema) })

  useEffect(() => {
    if (editing) {
      reset({ targetEntryPrice: row.targetEntryPrice ?? '', note: row.note ?? '' })
      upsert.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, row.assetId])

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-1 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)]"
        aria-label={`Set target for ${row.symbol}`}
      >
        {row.targetEntryPrice ? 'Edit target' : 'Set target'}
      </button>
    )
  }

  async function onSubmit(values: TargetForm) {
    const target = values.targetEntryPrice.trim()
    try {
      await upsert.mutateAsync({
        assetId: row.assetId,
        payload: {
          targetEntryPrice: target === '' ? null : target,
          note: values.note?.trim() ? values.note.trim() : null,
        },
      })
      notify('success', `Target for ${row.symbol} saved.`)
      setEditing(false)
    } catch (e) {
      notify('error', `Save failed: ${apiErrorMessage(e, 'Could not save target.')}`)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-start gap-2" noValidate>
      <div>
        <label htmlFor={`target-${row.assetId}`} className="sr-only">
          Target entry price for {row.symbol}
        </label>
        <input
          id={`target-${row.assetId}`}
          inputMode="decimal"
          placeholder="e.g. 60000"
          className="w-32 min-h-11 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs tabular-nums text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--text-muted)] focus:border-[var(--focus)] focus:outline-none"
          {...register('targetEntryPrice')}
        />
        {errors.targetEntryPrice ? <p className="mt-1 text-xs text-[var(--negative)]">{errors.targetEntryPrice.message}</p> : null}
      </div>
      <div>
        <label htmlFor={`note-${row.assetId}`} className="sr-only">
          Watchlist note for {row.symbol}
        </label>
        <input
          id={`note-${row.assetId}`}
          placeholder="Note (optional)"
          className="w-40 min-h-11 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--text-muted)] focus:border-[var(--focus)] focus:outline-none"
          {...register('note')}
        />
      </div>
      <button
        type="submit"
        disabled={upsert.isPending}
        className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {upsert.isPending ? <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden /> : <Save className="h-3 w-3" aria-hidden />}
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-1 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)]"
      >
        Cancel
      </button>
    </form>
  )
}

/**
 * Watchlist (PLAN §18): tokens tracked without a BUY. Target entry, distance
 * with explicit above/below labeling, notes. No automatic price alerts in MVP.
 */
export function WatchlistPage() {
  const { notify } = useToast()
  const watchlist = useWatchlist()
  const remove = useRemoveWatchlist()
  const [addTokenOpen, setAddTokenOpen] = useState(false)
  const lastError = useRef<string | null>(null)

  useEffect(() => {
    if (watchlist.isError && !watchlist.isFetching) {
      const msg = errorMessage(watchlist.error)
      if (lastError.current !== msg) {
        lastError.current = msg
        notify('error', `Watchlist failed: ${msg}`)
      }
    }
    if (!watchlist.isError) lastError.current = null
  }, [watchlist.isError, watchlist.isFetching, watchlist.error, notify])

  async function removeRow(row: WatchlistRow) {
    try {
      await remove.mutateAsync(row.assetId)
      notify('success', `${row.symbol} removed from watchlist.`)
    } catch (e) {
      notify('error', `Remove failed: ${apiErrorMessage(e, 'Could not remove entry.')}`)
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Watchlist"
        description={`Tokens on deck — target entries with distance · updated ${formatEpoch(watchlist.dataUpdatedAt ?? null)}.`}
        actions={
          <Button variant="secondary" onClick={() => watchlist.refetch()} disabled={watchlist.isFetching}>
            {watchlist.isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />

      {watchlist.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : watchlist.isError ? (
        <ErrorState
          message={errorMessage(watchlist.error)}
          onRetry={() => watchlist.refetch()}
          retrying={watchlist.isFetching}
        />
      ) : watchlist.data && watchlist.data.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto rounded-[var(--radius-control)] border border-[var(--border)] md:block" role="region" aria-label="Watchlist table" tabIndex={0}>
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)]">
                  <th scope="col" className="px-3 py-2 font-medium">Asset</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Current price</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Target entry</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Distance to target</th>
                  <th scope="col" className="px-3 py-2 font-medium">Note</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.data.map((row) => {
                  // Distance is directional info, not profit — neutral zinc
                  // always, with explicit above/below text (never color-only).
                    return (
                      <tr key={row.assetId} className="border-b border-[var(--border)] tabular-nums last:border-0">
                      <td className="px-3 py-2">
                        <Link to={`/assets/${row.assetId}`} className="font-medium text-[var(--text)] hover:underline">
                          {row.symbol}
                        </Link>
                        <span className="ml-2 text-xs text-[var(--text-secondary)]">{row.chain}</span>
                        {row.priceStale ? <span className="ml-1 text-[11px] text-amber-400">(stale)</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--text)]">{formatUsd(row.currentPrice)}</td>
                      <td className="px-3 py-2 text-right text-[var(--text)]">{formatUsd(row.targetEntryPrice)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-[var(--text)]" title={directionLabel(row)}>
                          {row.distanceToTargetPercent === null
                            ? '—'
                            : `${formatSignedPercent(row.distanceToTargetPercent)} · ${row.targetDirection}`}
                        </span>
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-xs text-[var(--text-secondary)]" title={row.note ?? ''}>
                        {row.note ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <TargetForm row={row} />
                          <button
                            type="button"
                            onClick={() => removeRow(row)}
                            disabled={remove.isPending}
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
                            aria-label={`Remove ${row.symbol} from watchlist`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {watchlist.data.map((row) => (
              <div key={row.assetId} className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-3 tabular-nums">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/assets/${row.assetId}`} className="font-medium text-[var(--text)]">
                    {row.symbol} <span className="text-xs font-normal text-[var(--text-secondary)]">{row.chain}</span>
                  </Link>
                  <span className="text-sm text-[var(--text)]">{formatUsd(row.currentPrice)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span>
                    Target <span className="text-[var(--text)]">{formatUsd(row.targetEntryPrice)}</span>
                  </span>
                  <span title={directionLabel(row)}>
                    {row.distanceToTargetPercent === null
                      ? '—'
                      : `${formatSignedPercent(row.distanceToTargetPercent)} · ${row.targetDirection}`}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <TargetForm row={row} />
                  <button
                    type="button"
                    onClick={() => removeRow(row)}
                    disabled={remove.isPending}
                    className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-1 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
                    aria-label={`Remove ${row.symbol} from watchlist`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <BellOff className="h-3.5 w-3.5" aria-hidden />
            Automatic price alerts are out of scope for MVP (PLAN §18) — check back manually.
          </p>
        </>
      ) : (
        <EmptyState
          title="Watchlist is empty"
          hint="Track tokens without buying — set a target entry and watch the distance."
        />
      )}

      <AddTokenModal open={addTokenOpen} onClose={() => setAddTokenOpen(false)} />
    </div>
  )
}
