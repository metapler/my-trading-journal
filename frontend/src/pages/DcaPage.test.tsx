import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { ToastContext } from '../hooks/useToast'
import { DcaPage } from './DcaPage'

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
  remainingQuantity: '100',
  averageBuy: '1',
  remainingCostBasis: '100',
  realizedPnL: '0',
  currentPrice: '0.5',
  currentValue: '50',
  unrealizedPnL: '-50',
  unrealizedPnLPercent: '-50',
  bepPrice: '1',
  recoveryToBepPercent: '100',
  priceSource: 'stub',
  priceFetchedAt: '2026-10-02T00:00:00.000Z',
  priceStale: false,
  priceCached: false,
}

const simulation: client.DcaSimulation = {
  assetId: 'a1',
  currentAverageBuy: '1',
  projectedAverageBuy: '0.6',
  currentBep: '1',
  projectedBep: '0.6',
  currentQuantity: '100',
  projectedQuantity: '500',
  additionalQuantity: '400',
  currentRecoveryToBepPercent: '100',
  projectedRecoveryToBepPercent: '20',
  projectedTotalExposure: '300',
  buyPriceUsed: '0.5',
  currentPrice: '0.5',
}

function renderPage(route = '/tools/dca') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastContext.Provider value={{ notify: vi.fn() }}>
        <MemoryRouter initialEntries={[route]}>
          <DcaPage />
        </MemoryRouter>
      </ToastContext.Provider>
    </QueryClientProvider>,
  )
}

async function fillAndSimulate(user: ReturnType<typeof userEvent.setup>, opts: { capital?: string; price?: string } = {}) {
  await user.selectOptions(screen.getByLabelText('Asset'), 'a1')
  await user.type(screen.getByLabelText(/additional capital/i), opts.capital ?? '200')
  if (opts.price !== undefined) await user.type(screen.getByLabelText(/custom buy price/i), opts.price)
  await user.click(screen.getByRole('button', { name: /simulate dca/i }))
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(client, 'getAssets').mockResolvedValue([asset])
  vi.spyOn(client, 'getPosition').mockResolvedValue(position)
})

describe('DcaPage', () => {
  it('renders before/after projection after simulate', async () => {
    const user = userEvent.setup()
    const simSpy = vi.spyOn(client, 'simulateDca').mockResolvedValue(simulation)
    renderPage()
    await waitFor(() => expect(screen.getByLabelText('Asset')).toBeInTheDocument())
    await fillAndSimulate(user)
    await waitFor(() => expect(simSpy).toHaveBeenCalledWith({ assetId: 'a1', additionalCapital: '200', fee: '0' }))
    const table = within(screen.getByRole('table'))
    // Projected $0.6000 appears in both Average Buy and BEP rows.
    expect(table.getAllByText('$0.6000')).toHaveLength(2)
    // Average Buy row specifically: $1.00 → $0.6000.
    const avgRow = table.getByText('Average Buy').closest('tr') as HTMLElement
    expect(within(avgRow).getByText('$1.00')).toBeInTheDocument()
    expect(within(avgRow).getByText('$0.6000')).toBeInTheDocument()
    expect(table.getByText('+20.00%')).toBeInTheDocument()
    expect(screen.getByText(/buy price used/i)).toBeInTheDocument()
  })

  it('passes custom buy price through when provided', async () => {
    const user = userEvent.setup()
    const simSpy = vi.spyOn(client, 'simulateDca').mockResolvedValue(simulation)
    renderPage()
    await waitFor(() => expect(screen.getByLabelText('Asset')).toBeInTheDocument())
    await fillAndSimulate(user, { price: '0.45' })
    await waitFor(() =>
      expect(simSpy).toHaveBeenCalledWith({ assetId: 'a1', additionalCapital: '200', buyPrice: '0.45', fee: '0' }),
    )
  })

  it('prefills the asset from ?asset= (detail handoff)', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'simulateDca').mockResolvedValue(simulation)
    renderPage('/tools/dca?asset=a1')
    await waitFor(() => expect(screen.getByLabelText('Asset')).toBeInTheDocument())
    // Asset already selected: simulating without touching the dropdown works.
    await user.type(screen.getByLabelText(/additional capital/i), '200')
    await user.click(screen.getByRole('button', { name: /simulate dca/i }))
    await waitFor(() => expect(client.simulateDca).toHaveBeenCalled())
  })

  it('Add-as-Transaction opens the BUY modal prefilled, without auto-creating', async () => {
    const user = userEvent.setup()
    const txSpy = vi.spyOn(client, 'createTransaction')
    vi.spyOn(client, 'simulateDca').mockResolvedValue(simulation)
    renderPage()
    await waitFor(() => expect(screen.getByLabelText('Asset')).toBeInTheDocument())
    await fillAndSimulate(user)
    await waitFor(() => expect(screen.getByRole('button', { name: /gunakan sebagai draft buy/i })).toBeInTheDocument())
    // Simulation alone created nothing.
    expect(txSpy).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /gunakan sebagai draft buy/i }))
    const dialog = await screen.findByRole('dialog', { name: /add buy for sol/i })
    expect(within(dialog).getByLabelText('Quantity')).toHaveValue('400')
    expect(within(dialog).getByLabelText('Price per Token (USD)')).toHaveValue('0.5')
  })

  it('shows NO_MARKET_PRICE error when backend has no price and no custom price', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'simulateDca').mockRejectedValue(
      new client.ApiError(422, 'No market price available; pass an explicit buyPrice.', 'NO_MARKET_PRICE'),
    )
    renderPage()
    await waitFor(() => expect(screen.getByLabelText('Asset')).toBeInTheDocument())
    await fillAndSimulate(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/NO_MARKET_PRICE/)
  })

  it('validates capital client-side (zero rejected, no network)', async () => {
    const user = userEvent.setup()
    const simSpy = vi.spyOn(client, 'simulateDca')
    renderPage()
    await waitFor(() => expect(screen.getByLabelText('Asset')).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Asset'), 'a1')
    await user.type(screen.getByLabelText(/additional capital/i), '0')
    await user.click(screen.getByRole('button', { name: /simulate dca/i }))
    expect(await screen.findByText(/additional capital must be > 0/i)).toBeInTheDocument()
    expect(simSpy).not.toHaveBeenCalled()
  })

  it('shows empty state when no tokens exist', async () => {
    vi.restoreAllMocks()
    vi.spyOn(client, 'getAssets').mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No tokens yet')).toBeInTheDocument()
  })
})
