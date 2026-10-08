import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { ToastContext } from '../hooks/useToast'
import { AddTokenModal } from './AddTokenModal'

const sol: client.AssetSearchResult = {
  provider: 'dexscreener',
  name: 'Wrapped SOL',
  symbol: 'SOL',
  chain: 'solana',
  contractAddress: 'So11111111111111111111111111111111111111112',
  providerAssetId: null,
  pairAddress: 'P1',
  dexId: 'raydium',
  quoteSymbol: 'USDC',
  priceUsd: '120.13',
  liquidityUsd: '37141195',
  volume24hUsd: null,
  marketCapUsd: null,
  fdvUsd: null,
  imageUrl: null,
  dexUrl: null,
  exactContractMatch: true,
}

const pepe: client.AssetSearchResult = {
  provider: 'dexscreener',
  name: 'Pepe',
  symbol: 'PEPE',
  chain: 'ethereum',
  contractAddress: '0x6982508145454Ce325dDbE47a25d4ec3d2311933',
  providerAssetId: null,
  pairAddress: 'P2',
  dexId: 'uniswap',
  quoteSymbol: 'WETH',
  priceUsd: '0.000012',
  liquidityUsd: '19000',
  volume24hUsd: null,
  marketCapUsd: null,
  fdvUsd: null,
  imageUrl: null,
  dexUrl: null,
  exactContractMatch: false,
}

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const notify = vi.fn()
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={qc}>
      <ToastContext.Provider value={{ notify }}>
        <MemoryRouter>
          <AddTokenModal open onClose={onClose} />
        </MemoryRouter>
      </ToastContext.Provider>
    </QueryClientProvider>,
  )
  return { notify, onClose }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AddTokenModal', () => {
  it('renders nothing when closed', () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <AddTokenModal open={false} onClose={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows candidates with logo/name/chain/contract/price/liquidity/DEX after debounce', async () => {
    const user = userEvent.setup()
    const searchSpy = vi.spyOn(client, 'searchAssets').mockResolvedValue([sol, pepe])
    renderModal()
    await user.type(screen.getByLabelText(/search name, ticker/i), 'SOL')
    // Debounce is 400ms; wait for the backend call.
    await waitFor(() => expect(searchSpy).toHaveBeenCalledWith('SOL', expect.anything()), { timeout: 5000 })
    await waitFor(() => expect(screen.getByText('Wrapped SOL')).toBeInTheDocument())
    // Candidate card shows chain, shortened contract, DEX, price, liquidity.
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('solana')).toBeInTheDocument()
    expect(within(dialog).getByText(/so11…1112/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/dex raydium/i)).toBeInTheDocument()
    expect(within(dialog).getByText('Exact contract match')).toBeInTheDocument()
    // Both candidates listed: ambiguous results never silently picked.
    expect(within(dialog).getByText('Pepe')).toBeInTheDocument()
  })

  it('selects a candidate and saves with full identity, then hands off to first BUY', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'searchAssets').mockResolvedValue([sol, pepe])
    const created: client.Asset = {
      id: 'new-id',
      name: 'Wrapped SOL',
      symbol: 'SOL',
      chain: 'solana',
      contractAddress: sol.contractAddress,
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
    const createSpy = vi.spyOn(client, 'createAsset').mockResolvedValue(created)
    const { notify, onClose } = renderModal()
    await user.type(screen.getByLabelText(/search name, ticker/i), 'SOL')
    await waitFor(() => expect(screen.getByText('Wrapped SOL')).toBeInTheDocument(), { timeout: 5000 })
    await user.click(screen.getByRole('button', { name: /select wrapped sol/i }))
    await user.click(screen.getByRole('button', { name: /save & add first buy/i }))
    await waitFor(() => expect(createSpy).toHaveBeenCalled())
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Wrapped SOL',
        symbol: 'SOL',
        chain: 'solana',
        contractAddress: sol.contractAddress,
        pairAddress: 'P1',
        dexId: 'raydium',
        status: 'ACTIVE',
      }),
    )
    expect(notify).toHaveBeenCalledWith('success', expect.stringMatching(/first buy/i))
    expect(onClose).toHaveBeenCalled()
  })

  it('surfaces duplicate-asset server rejection', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'searchAssets').mockResolvedValue([sol])
    vi.spyOn(client, 'createAsset').mockRejectedValue(
      new client.ApiError(409, 'An asset with this identity already exists.', 'DUPLICATE_ASSET'),
    )
    const { notify } = renderModal()
    await user.type(screen.getByLabelText(/search name, ticker/i), 'SOL')
    await waitFor(() => expect(screen.getByText('Wrapped SOL')).toBeInTheDocument(), { timeout: 5000 })
    await user.click(screen.getByRole('button', { name: /select wrapped sol/i }))
    await user.click(screen.getByRole('button', { name: /save & add first buy/i }))
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('error', expect.stringMatching(/DUPLICATE_ASSET/)),
    )
  })

  it('shows empty state when no candidates', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'searchAssets').mockResolvedValue([])
    renderModal()
    await user.type(screen.getByLabelText(/search name, ticker/i), 'ZZZNOPE')
    await waitFor(() => expect(screen.getByText(/no candidates for/i)).toBeInTheDocument(), { timeout: 5000 })
  })

  it('copies full contract on copy-button click', async () => {
    const user = userEvent.setup()
    vi.spyOn(client, 'searchAssets').mockResolvedValue([sol])
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    renderModal()
    await user.type(screen.getByLabelText(/search name, ticker/i), 'SOL')
    await waitFor(() => expect(screen.getByText('Wrapped SOL')).toBeInTheDocument(), { timeout: 5000 })
    await user.click(screen.getByRole('button', { name: /copy contract/i }))
    expect(writeText).toHaveBeenCalledWith('So11111111111111111111111111111111111111112')
    vi.unstubAllGlobals()
  })
})
