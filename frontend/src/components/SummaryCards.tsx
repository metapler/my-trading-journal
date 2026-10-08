import type { PortfolioSummary } from '../api/client'
import { summaryCards } from '../lib/summaryCards'
import { cn } from '../lib/cn'

export function SummaryCardsGrid({ summary }: { summary: PortfolioSummary }) {
  const cards = summaryCards(summary)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" role="list" aria-label="Portfolio summary">
      {cards.map((c) => (
        <div
          key={c.label}
          role="listitem"
          title={c.title}
          className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <p className="text-xs text-[var(--text-secondary)]">{c.label}</p>
          <p
            className={cn(
              'mt-2 font-mono text-lg font-semibold tabular-nums',
              c.tone === 'profit' && 'text-profit',
              c.tone === 'loss' && 'text-loss',
              c.tone === 'neutral' && 'text-[var(--text)]',
            )}
          >
            {c.value}
          </p>
          {c.sub ? <p className="mt-1 font-mono text-xs text-[var(--text-secondary)] tabular-nums">{c.sub}</p> : null}
        </div>
      ))}
    </div>
  )
}
