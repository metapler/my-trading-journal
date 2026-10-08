import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { ToastContext } from '../hooks/useToast'
import { JournalPage } from './JournalPage'

function entry(overrides: Partial<client.JournalWithAsset> = {}): client.JournalWithAsset {
  return {
    id: 'j1',
    assetId: 'a1',
    thesis: 'SOL as core L1.',
    entryReason: null,
    invalidation: null,
    target: null,
    riskLevel: null,
    strategy: 'DCA',
    tags: ['L1', 'core'],
    postTradeReview: null,
    exitReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    asset: { id: 'a1', name: 'Wrapped SOL', symbol: 'SOL', chain: 'solana', imageUrl: null },
    ...overrides,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ToastContext.Provider value={{ notify: vi.fn() }}>
        <MemoryRouter>
          <JournalPage />
        </MemoryRouter>
      </ToastContext.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('JournalPage', () => {
  it('lists journals with thesis, strategy, tags, deep-link', async () => {
    vi.spyOn(client, 'listJournals').mockResolvedValue([entry()])
    renderPage()
    await waitFor(() => expect(screen.getByText('SOL')).toBeInTheDocument())
    expect(screen.getByText('DCA')).toBeInTheDocument()
    expect(screen.getByText('L1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /sol/i }).getAttribute('href')).toBe('/assets/a1#journal')
  })

  it('shows empty state when no journals', async () => {
    vi.spyOn(client, 'listJournals').mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No journal entries yet')).toBeInTheDocument()
  })

  it('shows error state with retry', async () => {
    vi.spyOn(client, 'listJournals').mockRejectedValue(new client.ApiError(500, 'boom', 'INTERNAL_ERROR'))
    renderPage()
    expect(await screen.findByRole('alert', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
  })
})
