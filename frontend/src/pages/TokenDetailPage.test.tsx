import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { ToastContext } from '../hooks/useToast'
import { TokenDetailPage } from './TokenDetailPage'

const asset: client.Asset = {
  id: 'a1',
  name: 'Wrapped SOL',
  symbol: 'SOL',
  chain: 'solana',
  contractAddress: 'So11111111111111111111111111111111111111112',
  provider: 'dexscreener',
  providerAssetId: null,
  preferredPriceProvider: 'dexscreener',
  dexId: 'raydium',
  pairAddress: 'P1',
  quoteSymbol: 'USDC',
  imageUrl: null,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const position: client.Position = {
  assetId: 'a1',
  symbol: 'SOL',
  name: 'Wrapped SOL',
  chain: 'solana',
  status: 'ACTIVE',
  remainingQuantity: '150',
  averageBuy: '0.75',
  remainingCostBasis: '112.5',
  realizedPnL: '12.5',
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
}

function renderPage(route = '/assets/a1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastContext.Provider value={{ notify: vi.fn() }}>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/assets/:id" element={<TokenDetailPage />} />
            <Route path="/positions" element={<div>positions-route</div>} />
            <Route path="/tools/dca" element={<div>dca-route</div>} />
            <Route path="/journal" element={<div>journal-route</div>} />
          </Routes>
        </MemoryRouter>
      </ToastContext.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(client, 'getAsset').mockResolvedValue(asset)
  vi.spyOn(client, 'getPosition').mockResolvedValue(position)
  vi.spyOn(client, 'getJournal').mockResolvedValue(null)
})

describe('TokenDetailPage', () => {
  it('renders header with name, chain, shortened contract, price, and source', async () => {
    vi.spyOn(client, 'getAssetTransactions').mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Wrapped SOL'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('· SOL')
    expect(screen.getByText('solana')).toBeInTheDocument()
    expect(screen.getByText(/so11…1112/i)).toBeInTheDocument()
    // Current price renders in both the header and the position panel.
    expect(screen.getAllByText('$0.6000').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('via stub')).toBeInTheDocument()
  })

  it('renders the full position panel with signed PnL and recovery', async () => {
    vi.spyOn(client, 'getAssetTransactions').mockResolvedValue([])
    renderPage()
    const panel = await screen.findByRole('region', { name: 'Position' })
    expect(within(panel).getByText('150 SOL')).toBeInTheDocument()
    expect(within(panel).getByText('−$22.50 (−20.00%)')).toBeInTheDocument()
    expect(within(panel).getByText('+$12.50')).toBeInTheDocument()
    expect(within(panel).getByText('+25.00%')).toBeInTheDocument()
  })

  it('lists transactions in the shared table', async () => {
    vi.spyOn(client, 'getAssetTransactions').mockResolvedValue([
      {
        id: 't1',
        assetId: 'a1',
        type: 'BUY',
        quantity: '100',
        pricePerToken: '1',
        fee: '0',
        executedAt: '2026-01-10T10:00:00.000Z',
        note: null,
        createdAt: '2026-01-10T10:00:00.000Z',
        updatedAt: '2026-01-10T10:00:00.000Z',
      },
    ])
    renderPage()
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.getByText('BUY')).toBeInTheDocument()
  })

  it('opens BUY and SELL modals from actions', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'getAssetTransactions').mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /catat buy\/dca/i }))
    expect(await screen.findByRole('dialog', { name: /add buy for sol/i })).toBeInTheDocument()
  })

  it('auto-opens BUY from ?addTx=BUY handoff (AddToken → detail)', async () => {
    vi.spyOn(client, 'getAssetTransactions').mockResolvedValue([])
    renderPage('/assets/a1?addTx=BUY')
    expect(await screen.findByRole('dialog', { name: /add buy for sol/i })).toBeInTheDocument()
  })

  it('shows 404-style error for unknown asset with back link', async () => {
    vi.restoreAllMocks()
    vi.spyOn(client, 'getAsset').mockRejectedValue(new client.ApiError(404, 'Asset not found.', 'ASSET_NOT_FOUND'))
    vi.spyOn(client, 'getPosition').mockRejectedValue(new client.ApiError(404, 'x', 'ASSET_NOT_FOUND'))
    vi.spyOn(client, 'getAssetTransactions').mockRejectedValue(new client.ApiError(404, 'x', 'ASSET_NOT_FOUND'))
    renderPage('/assets/nope')
    // Queries retry once before settling into the error state.
    expect(await screen.findByRole('alert', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('Asset not found.')).toBeInTheDocument()
    expect(screen.getByText(/back to positions/i)).toBeInTheDocument()
  })

  it('copies the full contract from the header', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'getAssetTransactions').mockResolvedValue([])
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    renderPage()
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /copy contract/i }))
    expect(writeText).toHaveBeenCalledWith('So11111111111111111111111111111111111111112')
    vi.unstubAllGlobals()
  })

  it('links Simulate DCA and Edit Journal without 404 routes', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'getAssetTransactions').mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument())
    await user.click(screen.getByRole('link', { name: /simulate dca/i }))
    expect(await screen.findByText('dca-route')).toBeInTheDocument()
  })

  it('renders the journal section with hydrated editor', async () => {
    vi.spyOn(client, 'getAssetTransactions').mockResolvedValue([])
    const spy = vi.spyOn(client, 'getJournal').mockResolvedValue({
      id: 'j1',
      assetId: 'a1',
      thesis: 'SOL as core L1.',
      entryReason: null,
      invalidation: null,
      target: null,
      riskLevel: null,
      strategy: 'DCA',
      tags: ['L1'],
      postTradeReview: null,
      exitReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    renderPage()
    await waitFor(() => expect(spy).toHaveBeenCalledWith('a1', expect.anything()))
    const section = await screen.findByRole('region', { name: 'Journal' })
    expect(within(section).getByLabelText('Trade thesis')).toHaveValue('SOL as core L1.')
    // Edit Journal action scrolls to the in-page section (anchor, no route).
    expect(screen.getByRole('link', { name: /edit journal/i }).getAttribute('href')).toBe('#journal')
  })
})
