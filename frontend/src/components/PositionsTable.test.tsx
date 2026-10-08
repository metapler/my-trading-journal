import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Position } from '../api/client'
import { PositionsTable } from './PositionsTable'

vi.mock('../hooks/usePrices', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../hooks/usePrices')>()
  return { ...mod, formatUpdatedAt: (iso: string | null | undefined) => iso ?? 'never' }
})

function position(overrides: Partial<Position> = {}): Position {
  return {
    assetId: 'a1',
    symbol: 'SOL',
    name: 'Wrapped SOL',
    chain: 'solana',
    status: 'ACTIVE',
    remainingQuantity: '150',
    averageBuy: '0.75',
    remainingCostBasis: '112.5',
    realizedPnL: '0',
    currentPrice: '0.6',
    currentValue: '90',
    unrealizedPnL: '-22.5',
    unrealizedPnLPercent: '-20',
    bepPrice: '0.75',
    recoveryToBepPercent: '25',
    priceSource: 'stub',
    priceFetchedAt: '2026-10-02T00:00:00.000Z',
    priceStale: false,
    priceCached: false,
    ...overrides,
  }
}

function renderTable(positions: Position[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PositionsTable positions={positions} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PositionsTable', () => {
  // Both desktop table and mobile cards render in jsdom (CSS hiding does not
  // remove DOM nodes), so desktop assertions scope to the table element.
  function table() {
    return within(screen.getByRole('table'))
  }

  it('renders rows with explicit − sign for losses (not color-only)', () => {
    renderTable([position()])
    expect(table().getByText('SOL')).toBeInTheDocument()
    // PnL cell shows signed value + signed percent
    expect(table().getByText(/−\$22\.50/)).toBeInTheDocument()
    // Exact string: the dedicated PnL % column (regex would also hit the PnL cell)
    expect(table().getByText('−20.00%')).toBeInTheDocument()
    // Recovery column shows +25.00%
    expect(table().getByText('+25.00%')).toBeInTheDocument()
  })

  it('renders + sign for profits', () => {
    renderTable([
      position({ assetId: 'p', symbol: 'BTC', unrealizedPnL: '104.8', unrealizedPnLPercent: '50', recoveryToBepPercent: '0' }),
    ])
    expect(table().getByText(/\+\$104\.80/)).toBeInTheDocument()
    // 0 recovery renders as dash (at/above BEP)
    expect(table().getByText('—')).toBeInTheDocument()
  })

  it('filters by symbol, name, chain', async () => {
    const user = userEvent.setup()
    renderTable([
      position({ assetId: 'a', symbol: 'SOL' }),
      position({ assetId: 'b', symbol: 'BTC', name: 'Bitcoin', chain: 'cmc' }),
    ])
    const search = screen.getByLabelText('Search positions')
    await user.clear(search)
    await user.type(search, 'btc')
    expect(table().queryByText('SOL')).not.toBeInTheDocument()
    expect(table().getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument()
  })

  it('sorts by PnL % ascending/descending', async () => {
    const user = userEvent.setup()
    renderTable([
      position({ assetId: 'a', symbol: 'AAA', unrealizedPnLPercent: '-20', unrealizedPnL: '-1', currentValue: '1' }),
      position({ assetId: 'b', symbol: 'BBB', unrealizedPnLPercent: '50', unrealizedPnL: '5', currentValue: '2' }),
    ])
    const sortBtn = screen.getByRole('button', { name: 'Sort by PnL %' })
    // Current sort is currentValue desc by default; switch to PnL%
    await user.click(sortBtn)
    // desc default for numeric: BBB first (scope to table: mobile cards also render)
    let rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(within(rows[1]).getByText('BBB')).toBeInTheDocument()
    await user.click(sortBtn)
    rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(within(rows[1]).getByText('AAA')).toBeInTheDocument()
  })

  it('flags stale prices inline on desktop and mobile', () => {
    renderTable([position({ priceStale: true })])
    // Desktop table + mobile card both render in jsdom.
    expect(screen.getAllByText('(stale)')).toHaveLength(2)
  })

  it('shows no-match message for empty filter', async () => {
    const user = userEvent.setup()
    renderTable([position()])
    await user.type(screen.getByLabelText('Search positions'), 'zzz-no-match')
    expect(screen.getByText(/No positions match/)).toBeInTheDocument()
  })
})
