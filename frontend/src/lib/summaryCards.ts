import type { PortfolioSummary } from '../api/client'
import { formatSignedPercent, formatSignedUsd, formatUsd, pnlTone } from './format'

export interface SummaryCard {
  label: string
  value: string
  sub?: string
  tone: 'profit' | 'loss' | 'neutral'
  title: string
}

export function summaryCards(summary: PortfolioSummary): SummaryCard[] {
  const unrealTone = pnlTone(summary.unrealizedPnL)
  const realizedTone = pnlTone(summary.realizedPnL)
  return [
    {
      label: 'Portfolio Value',
      value: formatUsd(summary.portfolioValue),
      tone: 'neutral',
      title: 'Sum of current values for positions with a market price',
    },
    {
      label: 'Active Cost Basis',
      value: formatUsd(summary.totalCostBasis),
      tone: 'neutral',
      title: 'Capital still deployed across open positions',
    },
    {
      label: 'Unrealized PnL',
      value: `${formatSignedUsd(summary.unrealizedPnL)} (${formatSignedPercent(summary.unrealizedPnLPercent)})`,
      tone: unrealTone,
      title: 'Open profit/loss vs cost basis (priced positions only)',
    },
    {
      label: 'Realized PnL',
      value: formatSignedUsd(summary.realizedPnL),
      tone: realizedTone,
      title: 'Locked in from closed/partial sells',
    },
    {
      label: 'Open Positions',
      value: String(summary.openPositions),
      sub: `${summary.closedPositions} closed`,
      tone: 'neutral',
      title: 'Positions with remaining quantity vs fully exited',
    },
  ]
}
