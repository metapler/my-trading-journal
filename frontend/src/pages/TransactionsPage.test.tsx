import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { ToastContext } from '../hooks/useToast'
import { TransactionsPage } from './TransactionsPage'

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

function tx(overrides: Partial<client.Transaction> = {}): client.Transaction {
  return {
    id: 't1',
    assetId: 'a1',
    type: 'BUY',
    quantity: '100',
    pricePerToken: '1',
    fee: '0.5',
    executedAt: '2026-01-10T10:00:00.000Z',
    note: null,
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-01-10T10:00:00.000Z',
    ...overrides,
  }
}

function renderPage(route = '/transactions') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastContext.Provider value={{ notify: vi.fn() }}>
        <MemoryRouter initialEntries={[route]}>
          <TransactionsPage />
        </MemoryRouter>
      </ToastContext.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(client, 'getAssets').mockResolvedValue([asset])
  vi.spyOn(client, 'getPosition').mockResolvedValue({
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
  })
})

describe('TransactionsPage', () => {
  it('lists ledger rows with type badge and value', async () => {
    vi.spyOn(client, 'getAssetTransactions').mockResolvedValue([
      tx(),
      tx({ id: 't2', type: 'SELL', quantity: '50', pricePerToken: '2', fee: '5' }),
    ])
    renderPage()
    await waitFor(() => expect(screen.getByText('BUY')).toBeInTheDocument())
    expect(screen.getByText('SELL')).toBeInTheDocument()
    // BUY value = 100×1+0.5 = $100.50 ; SELL value = 50×2−5 = $95.00
    expect(screen.getByText('$100.50')).toBeInTheDocument()
    expect(screen.getByText('$95.00')).toBeInTheDocument()
    expect(screen.getByText(/available 150 sol/i)).toBeInTheDocument()
  })

  it('shows empty state with first-BUY CTA when no transactions', async () => {
    vi.spyOn(client, 'getAssetTransactions').mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByText('No transactions for this asset')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /add first buy/i })).toBeInTheDocument()
  })

  it('opens the BUY modal from the toolbar', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'getAssetTransactions').mockResolvedValue([tx()])
    renderPage()
    await waitFor(() => expect(screen.getByText('BUY')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /add buy \/ dca/i }))
    expect(await screen.findByRole('dialog', { name: /add buy for sol/i })).toBeInTheDocument()
  })

  it('auto-opens BUY from ?asset=X&addTx=BUY handoff without setState-in-effect', async () => {
    vi.spyOn(client, 'getAssetTransactions').mockResolvedValue([])
    renderPage('/transactions?asset=a1&addTx=BUY')
    expect(await screen.findByRole('dialog', { name: /add buy for sol/i })).toBeInTheDocument()
  })

  it('shows Add Token entry points and opens the modal', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'getAssetTransactions').mockResolvedValue([tx()])
    vi.spyOn(client, 'searchAssets').mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByText('BUY')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /^add token$/i }))
    expect(await screen.findByRole('dialog', { name: 'Add Token' })).toBeInTheDocument()
  })

  it('shows loading then error with retry', async () => {
    vi.spyOn(client, 'getAssetTransactions').mockRejectedValue(new client.ApiError(500, 'boom', 'INTERNAL_ERROR'))
    renderPage()
    // Queries retry once before settling into the error state.
    expect(await screen.findByRole('alert', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
  })
})
