import { HISTORY_RANGES } from '../hooks/usePortfolioHistory'
import type { HistoryRange } from '../api/client'
import { cn } from '../lib/cn'

const labels: Record<HistoryRange, string> = {
  '24h': '24H',
  '7d': '7D',
  '30d': '30D',
  '90d': '90D',
  all: 'ALL',
}

/**
 * Range selector (REDESIGN §7.1): 24H·7D·30D·90D·ALL inside the hero.
 * aria-pressed selected state; 44px touch targets.
 */
export function HistoryRangeControl({
  value,
  onChange,
  disabled = false,
}: {
  value: HistoryRange
  onChange: (range: HistoryRange) => void
  disabled?: boolean
}) {
  return (
    <div
      role="group"
      aria-label="History range"
      className="inline-flex flex-wrap gap-1 rounded-full border border-[var(--border)] bg-[var(--bg)] p-1"
    >
      {HISTORY_RANGES.map((r) => {
        const active = r === value
        return (
          <button
            key={r}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(r)}
            className={cn(
              'min-h-11 rounded-full px-4 py-2 font-mono text-xs tracking-[0.12em] transition-colors disabled:opacity-50',
              active
                ? 'bg-[var(--gold)] font-semibold text-[#1a1405]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]',
            )}
          >
            {labels[r]}
          </button>
        )
      })}
    </div>
  )
}
