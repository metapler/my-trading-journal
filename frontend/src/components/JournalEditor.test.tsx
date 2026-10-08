import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { ToastContext } from '../hooks/useToast'
import { JournalEditor } from './JournalEditor'

const journal: client.Journal = {
  id: 'j1',
  assetId: 'a1',
  thesis: 'SOL as core L1.',
  entryReason: 'Breakout retest.',
  invalidation: 'Below $120.',
  target: '$200',
  riskLevel: 'medium',
  strategy: 'DCA',
  tags: ['L1', 'core'],
  postTradeReview: 'Sized well.',
  exitReason: 'Trimmed.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

function renderEditor(props: { journal?: client.Journal | null; isLoading?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const notify = vi.fn()
  render(
    <QueryClientProvider client={qc}>
      <ToastContext.Provider value={{ notify }}>
        <MemoryRouter>
          <JournalEditor assetId="a1" symbol="SOL" journal={props.journal ?? null} isLoading={props.isLoading ?? false} />
        </MemoryRouter>
      </ToastContext.Provider>
    </QueryClientProvider>,
  )
  return { notify }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('JournalEditor', () => {
  it('hydrates existing journal including tags', async () => {
    renderEditor({ journal })
    await waitFor(() => expect(screen.getByLabelText('Trade thesis')).toHaveValue('SOL as core L1.'))
    expect(screen.getByLabelText(/tags/i)).toHaveValue('L1, core')
    expect(screen.getByRole('button', { name: /save journal/i })).toBeInTheDocument()
  })

  it('blank form when no journal yet, CTA creates', () => {
    renderEditor({ journal: null })
    expect(screen.getByLabelText('Trade thesis')).toHaveValue('')
    expect(screen.getByRole('button', { name: /create journal/i })).toBeInTheDocument()
  })

  it('saves with parsed tags and toasts reload-safe confirmation', async () => {
    const user = userEvent.setup()
    const putSpy = vi.spyOn(client, 'putJournal').mockResolvedValue(journal)
    const { notify } = renderEditor({ journal: null })
    await user.type(screen.getByLabelText('Trade thesis'), 'New thesis')
    await user.type(screen.getByLabelText(/tags/i), 'L1, core, L1')
    await user.click(screen.getByRole('button', { name: /create journal/i }))
    await waitFor(() => expect(putSpy).toHaveBeenCalledWith('a1', expect.objectContaining({ tags: ['L1', 'core'] })))
    expect(notify).toHaveBeenCalledWith('success', expect.stringMatching(/reload/i))
  })

  it('surfaces server errors via toast', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'putJournal').mockRejectedValue(new client.ApiError(400, 'Bad.', 'VALIDATION_ERROR'))
    const { notify } = renderEditor({ journal: null })
    await user.type(screen.getByLabelText('Trade thesis'), 'x')
    await user.click(screen.getByRole('button', { name: /create journal/i }))
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('error', expect.stringMatching(/VALIDATION_ERROR/)),
    )
  })
})
