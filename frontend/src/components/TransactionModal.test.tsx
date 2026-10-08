import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { ToastContext } from '../hooks/useToast'
import { TransactionModal, type TxModalState } from './TransactionModal'

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

function renderModal(state: TxModalState | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const notify = vi.fn()
  return {
    notify,
    ...render(
      <QueryClientProvider client={qc}>
        <ToastContext.Provider value={{ notify }}>
          <MemoryRouter>
            <TransactionModal state={state} onClose={vi.fn()} />
          </MemoryRouter>
        </ToastContext.Provider>
      </QueryClientProvider>,
    ),
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('TransactionModal', () => {
  it('renders nothing when closed', () => {
    renderModal(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows live total helper that flips label for SELL', async () => {
    const user = userEvent.setup()
    renderModal({ asset, type: 'BUY' })
    expect(screen.getByRole('dialog', { name: /add buy for sol/i })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Quantity'), '100')
    await user.type(screen.getByLabelText('Price per Token (USD)'), '1')
    await waitFor(() => expect(screen.getByText('$100.00')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Sell' }))
    await user.clear(screen.getByLabelText('Fee (USD)'))
    await user.type(screen.getByLabelText('Fee (USD)'), '5')
    await waitFor(() => expect(screen.getByText('Estimated proceeds')).toBeInTheDocument())
    expect(screen.getByText('$95.00')).toBeInTheDocument()
  })

  it('prefills market price and shows available quantity', () => {
    renderModal({ asset, type: 'SELL', price: '120.13', availableQuantity: '150' })
    expect(screen.getByLabelText('Price per Token (USD)')).toHaveValue('120.13')
    expect(screen.getByText(/available 150 sol/i)).toBeInTheDocument()
  })

  it('warns on oversell before submit', async () => {
    const user = userEvent.setup()
    renderModal({ asset, type: 'SELL', availableQuantity: '10' })
    await user.type(screen.getByLabelText('Quantity'), '11')
    await user.type(screen.getByLabelText('Price per Token (USD)'), '1')
    expect(await screen.findByRole('note')).toHaveTextContent(/server will reject/i)
  })

  it('blocks invalid input client-side (zero quantity)', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(client, 'createTransaction')
    renderModal({ asset, type: 'BUY' })
    await user.type(screen.getByLabelText('Quantity'), '0')
    await user.type(screen.getByLabelText('Price per Token (USD)'), '1')
    await user.click(screen.getByRole('button', { name: /save buy/i }))
    expect(await screen.findByText(/quantity must be > 0/i)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('submits BUY and toasts success with recalculation note', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const notify = vi.fn()
    vi.spyOn(client, 'createTransaction').mockResolvedValue({
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
    })
    render(
      <QueryClientProvider client={qc}>
        <ToastContext.Provider value={{ notify }}>
          <MemoryRouter>
            <TransactionModal state={{ asset, type: 'BUY' }} onClose={onClose} />
          </MemoryRouter>
        </ToastContext.Provider>
      </QueryClientProvider>,
    )
    await user.type(screen.getByLabelText('Quantity'), '100')
    await user.type(screen.getByLabelText('Price per Token (USD)'), '1')
    await user.click(screen.getByRole('button', { name: /save buy/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(notify).toHaveBeenCalledWith('success', expect.stringMatching(/position recalculated/i))
    expect(client.createTransaction).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ type: 'BUY', quantity: '100', pricePerToken: '1' }),
    )
  })

  it('surfaces INSUFFICIENT_POSITION server rejection inline + toast', async () => {
    const user = userEvent.setup()
    const { notify } = renderModal({ asset, type: 'SELL' })
    vi.spyOn(client, 'createTransaction').mockRejectedValue(
      new client.ApiError(422, 'Sell quantity exceeds current position.', 'INSUFFICIENT_POSITION'),
    )
    await user.type(screen.getByLabelText('Quantity'), '999')
    await user.type(screen.getByLabelText('Price per Token (USD)'), '1')
    await user.click(screen.getByRole('button', { name: /save sell/i }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(/INSUFFICIENT_POSITION/),
    )
    expect(notify).toHaveBeenCalledWith('error', expect.stringMatching(/INSUFFICIENT_POSITION/))
  })

  it('rejects future dates client-side', async () => {
    const user = userEvent.setup()
    renderModal({ asset, type: 'BUY' })
    await user.type(screen.getByLabelText('Quantity'), '1')
    await user.type(screen.getByLabelText('Price per Token (USD)'), '1')
    const when = screen.getByLabelText(/date/i)
    await user.clear(when)
    await user.type(when, '2099-01-01T10:00')
    await user.click(screen.getByRole('button', { name: /save buy/i }))
    expect(await screen.findByText(/must not be in the future/i)).toBeInTheDocument()
  })
})
