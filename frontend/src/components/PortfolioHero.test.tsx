import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { PortfolioHero } from './PortfolioHero'

function renderHero(summary: client.PortfolioSummary) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PortfolioHero summary={summary} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const summaryBase: client.PortfolioSummary = {
  totalCostBasis: '90',
  portfolioValue: '150',
  unrealizedPnL: '60',
  unrealizedPnLPercent: '66.67',
  realizedPnL: '0',
  openPositions: 1,
  closedPositions: 0,
  priceCoverage: { withPrice: 1, withoutPrice: 0 },
}

const empty: client.PortfolioHistory = {
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

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('PortfolioHero', () => {
  it('shows onboarding empty state when no transactions exist', async () => {
    vi.spyOn(client, 'getPortfolioHistory').mockResolvedValue(empty)
    renderHero({ ...summaryBase, openPositions: 0, closedPositions: 0 })
    await waitFor(() =>
      expect(screen.getByText(/Mulai catat transaksi/)).toBeInTheDocument(),
    )
  })

  it('shows recording state with current value when positions exist but no snapshots', async () => {
    vi.spyOn(client, 'getPortfolioHistory').mockResolvedValue(empty)
    renderHero(summaryBase)
    await waitFor(() =>
      expect(screen.getByText(/Histori mulai direkam sejak sekarang/)).toBeInTheDocument(),
    )
    expect(screen.getByText(/Nilai terkini/)).toBeInTheDocument()
  })

  it('renders one marker with waiting note for a single point (never a flat line)', async () => {
    vi.spyOn(client, 'getPortfolioHistory').mockResolvedValue({
      ...empty,
      coverage: 'full',
      points: [
        { capturedAt: '2026-10-03T00:00:00.000Z', valueUsd: '150', activeCostBasisUsd: '90', quality: 'complete' },
      ],
    })
    renderHero(summaryBase)
    await waitFor(() =>
      expect(screen.getByText(/menunggu pengamatan berikutnya/)).toBeInTheDocument(),
    )
  })

  it('shows limited-coverage note with ALL shortcut and invalidation warning', async () => {
    vi.spyOn(client, 'getPortfolioHistory').mockResolvedValue({
      ...empty,
      coverage: 'limited',
      availableFrom: '2026-10-03T00:00:00.000Z',
      availableTo: '2026-10-03T01:00:00.000Z',
      invalidatedFrom: '2026-10-02T00:00:00.000Z',
      points: [
        { capturedAt: '2026-10-03T00:00:00.000Z', valueUsd: '100', activeCostBasisUsd: '90', quality: 'complete' },
        { capturedAt: '2026-10-03T01:00:00.000Z', valueUsd: '120', activeCostBasisUsd: '90', quality: 'complete' },
      ],
    })
    renderHero(summaryBase)
    await waitFor(() => expect(screen.getByText(/Cakupan terbatas/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /lihat all/i })).toBeInTheDocument()
    expect(screen.getByText(/sebelum koreksi ledger/)).toBeInTheDocument()
  })

  it('toggles the cost-basis overlay with correct legend naming', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'getPortfolioHistory').mockResolvedValue({
      ...empty,
      coverage: 'full',
      points: [
        { capturedAt: '2026-10-03T00:00:00.000Z', valueUsd: '100', activeCostBasisUsd: '90', quality: 'complete' },
        { capturedAt: '2026-10-03T01:00:00.000Z', valueUsd: '120', activeCostBasisUsd: '95', quality: 'complete' },
      ],
    })
    renderHero(summaryBase)
    await waitFor(() => expect(screen.getByText(/Modal posisi tersisa/)).toBeInTheDocument())
    // Never misnamed as total deposit or portfolio BEP.
    expect(screen.queryByText(/total deposit/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/bep portofolio/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /modal posisi tersisa/i }))
    expect(screen.getByRole('checkbox', { name: /modal posisi tersisa/i })).toBeChecked()
  })

  it('renders history error locally with retry', async () => {
    const spy = vi
      .spyOn(client, 'getPortfolioHistory')
      .mockRejectedValue(new client.ApiError(500, 'boom', 'INTERNAL_ERROR'))
    renderHero(summaryBase)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 8000 })
    expect(screen.getByText('boom')).toBeInTheDocument()
    spy.mockResolvedValue(empty)
    await userEvent.setup().click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(1))
  })
})
