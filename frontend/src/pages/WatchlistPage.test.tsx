import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { ToastContext } from '../hooks/useToast'
import { WatchlistPage } from './WatchlistPage'

function row(overrides: Partial<client.WatchlistRow> = {}): client.WatchlistRow {
  return {
    assetId: 'a1',
    symbol: 'BTC',
    name: 'Bitcoin',
    chain: 'cmc',
    imageUrl: null,
    currentPrice: '100',
    targetEntryPrice: '80',
    distanceToTargetPercent: '-20',
    targetDirection: 'below',
    note: 'Dip buy zone.',
    priceSource: 'stub',
    priceFetchedAt: '2026-10-02T00:00:00.000Z',
    priceStale: false,
    updatedAt: '2026-10-02T00:00:00.000Z',
    ...overrides,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastContext.Provider value={{ notify: vi.fn() }}>
        <MemoryRouter initialEntries={['/watchlist']}>
          <Routes>
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/assets/:id" element={<div>detail-route</div>} />
          </Routes>
        </MemoryRouter>
      </ToastContext.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('WatchlistPage', () => {
  it('renders rows with price, target, distance + explicit direction', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([row()])
    renderPage()
    const table = within(await screen.findByRole('table'))
    expect(table.getByText('BTC')).toBeInTheDocument()
    expect(table.getByText('$100.00')).toBeInTheDocument()
    expect(table.getByText('$80.00')).toBeInTheDocument()
    // Explicit above/below label, not color-only.
    expect(table.getByText(/−20\.00% · below/)).toBeInTheDocument()
  })

  it('labels above and null-price rows distinctly', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      row({ assetId: 'a', symbol: 'A', distanceToTargetPercent: '50', targetDirection: 'above', targetEntryPrice: '150', currentPrice: '100' }),
      row({ assetId: 'b', symbol: 'B', distanceToTargetPercent: null, targetDirection: null, targetEntryPrice: '80', currentPrice: null }),
    ])
    renderPage()
    const table = within(await screen.findByRole('table'))
    expect(table.getByText(/\+50\.00% · above/)).toBeInTheDocument()
    expect(table.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('saves target + note via inline form', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([row({ targetEntryPrice: null, distanceToTargetPercent: null, targetDirection: null })])
    const putSpy = vi.spyOn(client, 'putWatchlist').mockResolvedValue(undefined)
    renderPage()
    const table = within(await screen.findByRole('table'))
    await user.click(table.getByRole('button', { name: /set target/i }))
    await user.type(table.getByLabelText(/target entry price/i), '60000')
    // Note field prefills the existing note — clear before typing.
    await user.clear(table.getByLabelText(/watchlist note/i))
    await user.type(table.getByLabelText(/watchlist note/i), 'Breakout watch.')
    await user.click(table.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(putSpy).toHaveBeenCalledWith('a1', { targetEntryPrice: '60000', note: 'Breakout watch.' }),
    )
  })

  it('removes an entry', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([row()])
    const delSpy = vi.spyOn(client, 'removeWatchlist').mockResolvedValue(undefined)
    renderPage()
    const table = within(await screen.findByRole('table'))
    await user.click(table.getByRole('button', { name: /remove btc from watchlist/i }))
    await waitFor(() => expect(delSpy).toHaveBeenCalledWith('a1'))
  })

  it('shows empty state when no entries', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('Watchlist is empty')).toBeInTheDocument()
  })
})
