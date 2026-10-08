import type { PortfolioSummary as Summary } from '../api/client'
import { formatSignedPercent, formatSignedUsd, formatUsd, pnlTone } from '../lib/format'
import { cn } from '../lib/cn'
import { Panel } from './ui/Panel'

function Row({
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
    <div title={title} className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] py-2.5 last:border-0">
      <dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
      <dd className="min-w-0 text-right">
        <span
          className={cn(
            'font-mono text-sm tabular-nums',
            tone === 'profit' && 'text-profit',
            tone === 'loss' && 'text-loss',
            tone === 'neutral' && 'text-[var(--text)]',
          )}
        >
          {value}
        </span>
        {sub ? <span className="ml-1.5 font-mono text-xs text-[var(--text-muted)] tabular-nums">{sub}</span> : null}
      </dd>
    </div>
  )
}

/**
 * Portfolio summary rail (REDESIGN §10): 4 labeled rows, not 4 big cards.
 * Current-position metrics only — never shifts with the history range.
 */
export function PortfolioSummary({ summary }: { summary: Summary }) {
  return (
    <Panel title="Ringkasan portofolio" meta="Metrik posisi saat ini" label="Ringkasan portofolio">
      <dl>
        <Row label="Modal aktif" value={formatUsd(summary.totalCostBasis)} title="Remaining cost basis — capital still deployed" />
        <Row
          label="Unrealized PnL"
          value={formatSignedUsd(summary.unrealizedPnL)}
          sub={summary.unrealizedPnLPercent === null ? undefined : `(${formatSignedPercent(summary.unrealizedPnLPercent)})`}
          tone={pnlTone(summary.unrealizedPnL)}
          title="Open profit/loss vs cost basis (priced positions only)"
        />
        <Row
          label="Realized PnL"
          value={formatSignedUsd(summary.realizedPnL)}
          tone={pnlTone(summary.realizedPnL)}
          title="Locked in from closed/partial sells"
        />
        <Row
          label="Posisi aktif"
          value={String(summary.openPositions)}
          sub={summary.closedPositions > 0 ? `· ${summary.closedPositions} closed` : undefined}
          title="Positions with remaining quantity vs fully exited"
        />
      </dl>
      {summary.priceCoverage.withoutPrice > 0 ? (
        <p role="note" className="mt-3 rounded-[var(--radius-control)] border border-amber-800/60 bg-amber-950/40 p-2.5 text-xs text-amber-200">
          {summary.priceCoverage.withoutPrice} posisi tanpa harga pasar — total tidak mencakupnya.
        </p>
      ) : null}
    </Panel>
  )
}
