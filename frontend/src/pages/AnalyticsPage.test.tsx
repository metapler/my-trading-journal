import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { ToastContext } from '../hooks/useToast'
import { AnalyticsPage } from './AnalyticsPage'

function analytics(overrides: Partial<client.Analytics> = {}): client.Analytics {
  return {
    totalRealizedPnL: '0',
    totalUnrealizedPnL: '-30',
    closedPositions: 2,
    winningPositions: 1,
    losingPositions: 1,
    winRate: '50',
    averageWinner: '20',
    averageLoser: '-20',
    largestRealizedWinner: { assetId: 'w1', symbol: 'WIN', realizedPnL: '20' },
    largestRealizedLoser: { assetId: 'l1', symbol: 'LOSS', realizedPnL: '-20' },
    performanceByStrategy: [{ strategy: 'DCA', closedPositions: 2, realizedPnL: '0', winRate: '50' }],
    hasEnoughData: true,
    priceCoverage: { withPrice: 1, withoutPrice: 0 },
    ...overrides,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastContext.Provider value={{ notify: vi.fn() }}>
        <MemoryRouter initialEntries={['/analytics']}>
          <Routes>
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/assets/:id" element={<div>detail-route</div>} />
            <Route path="/positions" element={<div>positions-route</div>} />
          </Routes>
        </MemoryRouter>
      </ToastContext.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AnalyticsPage', () => {
  it('renders closed-trade stats with explicit signs, extremes, and strategy table', async () => {
    vi.spyOn(client, 'getAnalytics').mockResolvedValue(analytics())
    renderPage()
    // Win rate 50.00% appears in both the stat card and the strategy table.
    await waitFor(() => expect(screen.getAllByText('50.00%').length).toBeGreaterThanOrEqual(2))
    // Explicit + / − signs, never color-only.
    expect(screen.getByText('+$20.00')).toBeInTheDocument()
    expect(screen.getByText('−$20.00')).toBeInTheDocument()
    expect(screen.getByText('1W · 1L · 2 closed')).toBeInTheDocument()
    expect(screen.getByText('WIN →')).toBeInTheDocument()
    expect(screen.getByText('LOSS →')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('DCA')).toBeInTheDocument()
  })

  it('gates on the PLAN empty state until a position is fully closed', async () => {
    vi.spyOn(client, 'getAnalytics').mockResolvedValue(analytics({ hasEnoughData: false, closedPositions: 0 }))
    renderPage()
    expect(await screen.findByText('Not enough closed trades yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view positions/i }).getAttribute('href')).toBe('/positions')
  })

  it('flags incomplete price coverage on unrealized', async () => {
    vi.spyOn(client, 'getAnalytics').mockResolvedValue(
      analytics({ priceCoverage: { withPrice: 1, withoutPrice: 2 } }),
    )
    renderPage()
    await waitFor(() => expect(screen.getByText(/2 position\(s\) without price excluded/)).toBeInTheDocument())
  })

  it('shows per-strategy empty hint when no strategy tags exist', async () => {
    vi.spyOn(client, 'getAnalytics').mockResolvedValue(analytics({ performanceByStrategy: [] }))
    renderPage()
    await waitFor(() => expect(screen.getByText(/no strategy tags/i)).toBeInTheDocument())
  })

  it('shows error state with retry', async () => {
    vi.spyOn(client, 'getAnalytics').mockRejectedValue(new client.ApiError(500, 'boom', 'INTERNAL_ERROR'))
    renderPage()
    expect(await screen.findByRole('alert', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
  })
})
