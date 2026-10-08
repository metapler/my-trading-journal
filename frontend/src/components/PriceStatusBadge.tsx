import type { PriceResponse } from '../api/client'
import { formatUpdatedAt, priceStatusLabel } from '../hooks/usePrices'
import { cn } from '../lib/cn'

/**
 * Price freshness indicator. Honest states only: never claims "live".
 * Stale/unavailable render distinctly so users don't act on old data.
 */
export function PriceStatusBadge({ price }: { price: PriceResponse | null | undefined }) {
  const status = priceStatusLabel(price)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs',
        status === 'fresh' && 'border-emerald-800 bg-emerald-950 text-emerald-300',
        status === 'cached' && 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]',
        status === 'stale' && 'border-amber-800 bg-amber-950 text-amber-300',
        status === 'unavailable' && 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]',
      )}
      title={price ? `Source: ${price.source} · Fetched: ${price.fetchedAt}` : 'No price available'}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'fresh' && 'bg-emerald-400',
          status === 'cached' && 'bg-[var(--text-secondary)]',
          status === 'stale' && 'bg-amber-400',
          status === 'unavailable' && 'bg-[var(--text-muted)]',
        )}
      />
      {status === 'fresh' ? 'Updated' : status === 'cached' ? 'Cached' : status === 'stale' ? 'Stale' : 'Unavailable'}
      {price ? <span className="text-[var(--text-secondary)]">· {formatUpdatedAt(price.fetchedAt)}</span> : null}
    </span>
  )
}
