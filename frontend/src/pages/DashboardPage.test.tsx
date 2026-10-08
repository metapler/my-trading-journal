import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { DashboardPage } from './DashboardPage'

vi.mock('../hooks/usePrices', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../hooks/usePrices')>()
  return { ...mod, formatUpdatedAt: () => '12:00:00' }
})

const historyEmpty: client.PortfolioHistory = {
  currency: 'USD',
  metric: 'active_positions_value',
  source: 'observed_snapshots',
  requestedRange: '30d',
  requestedFrom: null,
  availableFrom: null,
  availableTo: null,
  generatedAt: '2026-10-04T00:00:00.000Z',
  intervalSeconds: 300,
  coverage: 'none',
  invalidatedFrom: null,
  points: [],
}

const historyTwoPoints: client.PortfolioHistory = {
  ...historyEmpty,
  coverage: 'full',
  availableFrom: '2026-10-02T00:00:00.000Z',
  availableTo: '2026-10-03T00:00:00.000Z',
  points: [
    { capturedAt: '2026-10-02T00:00:00.000Z', valueUsd: '100', activeCostBasisUsd: '90', quality: 'complete' },
    { capturedAt: '2026-10-03T00:00:00.000Z', valueUsd: '150', activeCostBasisUsd: '90', quality: 'complete' },
  ],
}

function mockApi(summary: unknown, positions: unknown, history: unknown = historyEmpty) {
  vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue(summary as client.PortfolioSummary)
  vi.spyOn(client, 'getPositions').mockResolvedValue(positions as client.Position[])
  vi.spyOn(client, 'getPortfolioHistory').mockResolvedValue(history as client.PortfolioHistory)
  vi.spyOn(client, 'getAssets').mockResolvedValue([])
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const summaryOk: client.PortfolioSummary = {
  totalCostBasis: '11640.30',
  portfolioValue: '12482.42',
  unrealizedPnL: '842.12',
  unrealizedPnLPercent: '7.23',
  realizedPnL: '362.44',
  openPositions: 2,
  closedPositions: 1,
  priceCoverage: { withPrice: 2, withoutPrice: 0 },
}

const positionsOk: client.Position[] = [
  {
    assetId: 'a1',
    symbol: 'SOL',
    name: 'Wrapped SOL',
    chain: 'solana',
    status: 'ACTIVE',
    remainingQuantity: '10',
    averageBuy: '142.10',
    remainingCostBasis: '1421',
    realizedPnL: '0',
    currentPrice: '152.40',
    currentValue: '1524',
    unrealizedPnL: '103',
    unrealizedPnLPercent: '7.25',
    bepPrice: '142.10',
    recoveryToBepPercent: '0',
    priceSource: 'stub',
    priceFetchedAt: '2026-10-02T00:00:00.000Z',
    priceStale: false,
    priceCached: false,
  },
]

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('DashboardPage', () => {
  it('shows hero value, range control, summary rows, and positions preview', async () => {
    mockApi(summaryOk, positionsOk, historyTwoPoints)
    renderPage()
    // Hero headline + honest delta (never "return").
    await waitFor(() => expect(screen.getByText('$12,482.42')).toBeInTheDocument())
    expect(screen.getByRole('group', { name: /history range/i })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Perubahan nilai 30D/)).toBeInTheDocument())
    expect(screen.getByText(/Bukan persentase return/)).toBeInTheDocument()
    // Summary rail rows.
    expect(screen.getByRole('region', { name: /ringkasan portofolio/i })).toBeInTheDocument()
    // Positions preview table + mobile cards both render in jsdom — scope to the table.
    expect(within(screen.getAllByRole('table')[0]).getByText('SOL')).toBeInTheDocument()
  })

  it('shows honest empty-history state when positions exist but no snapshots', async () => {
    mockApi(summaryOk, positionsOk, historyEmpty)
    renderPage()
    await waitFor(() =>
      expect(screen.getByText(/Histori mulai direkam sejak sekarang/)).toBeInTheDocument(),
    )
    // No fake line: chart region absent, current value shown instead.
    expect(screen.queryByRole('img', { name: /grafik nilai posisi/i })).not.toBeInTheDocument()
  })

  it('shows loading skeletons while fetching', () => {
    mockApi(new Promise(() => undefined), new Promise(() => undefined), new Promise(() => undefined))
    renderPage()
    expect(screen.getAllByLabelText('Loading').length).toBeGreaterThan(0)
  })

  it('shows error state with retry on failure', async () => {
    vi.spyOn(client, 'getPortfolioSummary').mockRejectedValue(new client.ApiError(500, 'boom', 'INTERNAL_ERROR'))
    vi.spyOn(client, 'getPositions').mockResolvedValue([])
    vi.spyOn(client, 'getPortfolioHistory').mockResolvedValue(historyEmpty)
    vi.spyOn(client, 'getAssets').mockResolvedValue([])
    renderPage()
    // Queries retry once before settling into the error state.
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 })
    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('shows empty state when no positions', async () => {
    mockApi({ ...summaryOk, openPositions: 0, closedPositions: 0 }, [], historyEmpty)
    renderPage()
    await waitFor(() => expect(screen.getByText('No positions yet')).toBeInTheDocument())
  })

  it('warns when price coverage is incomplete', async () => {
    mockApi({ ...summaryOk, priceCoverage: { withPrice: 1, withoutPrice: 1 } }, positionsOk)
    renderPage()
    await waitFor(() => expect(screen.getByRole('note')).toBeInTheDocument())
    expect(screen.getByRole('note')).toHaveTextContent(/1 posisi tanpa harga pasar/)
  })

  it('switching range refetches that range without touching summary', async () => {
    const user = userEvent.setup()
    const historySpy = vi
      .spyOn(client, 'getPortfolioHistory')
      .mockResolvedValue(historyTwoPoints)
    const summarySpy = vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue(summaryOk)
    vi.spyOn(client, 'getPositions').mockResolvedValue(positionsOk)
    vi.spyOn(client, 'getAssets').mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByText('$12,482.42')).toBeInTheDocument())
    const historyBefore = historySpy.mock.calls.length
    const summaryBefore = summarySpy.mock.calls.length
    await user.click(screen.getByRole('button', { name: '7D' }))
    await waitFor(() => expect(historySpy.mock.calls.length).toBeGreaterThan(historyBefore))
    expect(historySpy).toHaveBeenLastCalledWith('7d', expect.anything())
    // Summary is range-independent — no refetch on range switch.
    expect(summarySpy.mock.calls.length).toBe(summaryBefore)
  })
})
