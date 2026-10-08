import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, LoaderCircle, Search, X } from 'lucide-react'
import type { AssetSearchResult } from '../api/client'
import { useCreateAsset, apiErrorMessage } from '../hooks/useMutations'
import { useAssetSearch } from '../hooks/useAssetSearch'
import { useToast } from '../hooks/useToast'
import { copyText, shortenContract } from '../lib/contract'
import { formatUsd, formatUsdCompact } from '../lib/format'
import { cn } from '../lib/cn'
import { ErrorState, LoadingSkeleton } from './QueryState'

function CandidateCard({
  result,
  selected,
  saving,
  onSelect,
}: {
  result: AssetSearchResult
  selected: boolean
  saving: boolean
  onSelect: () => void
}) {
  const { notify } = useToast()
  const [copied, setCopied] = useState(false)

  async function copyContract(e: React.MouseEvent) {
    e.stopPropagation()
    if (!result.contractAddress) return
    const ok = await copyText(result.contractAddress)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } else {
      notify('error', 'Copy failed — select and copy manually.')
    }
  }

  return (
    <div
      role="button"
      tabIndex={saving ? -1 : 0}
      onClick={saving ? undefined : onSelect}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !saving) {
          e.preventDefault()
          onSelect()
        }
      }}
      aria-pressed={selected}
      aria-disabled={saving}
      aria-label={`Select ${result.name} (${result.symbol}) on ${result.chain}`}
      className={cn(
        'w-full cursor-pointer rounded-[var(--radius-control)] border p-3 text-left transition-colors',
        saving && 'pointer-events-none opacity-60',
        selected
          ? 'border-emerald-700 bg-emerald-950/30'
          : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--text-muted)]',
      )}
    >
      <div className="flex items-start gap-3">
        {result.imageUrl ? (
          <img src={result.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-full bg-[var(--surface-hover)]" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-hover)] text-sm font-semibold text-[var(--text-secondary)]">
            {result.symbol.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium text-[var(--text)]">{result.name}</span>
            <span className="text-sm text-[var(--text-secondary)]">{result.symbol}</span>
            <span className="rounded-full border border-[var(--border)] px-1.5 py-px text-[11px] text-[var(--text-secondary)]">
              {result.chain}
            </span>
            {result.exactContractMatch ? (
              <span className="rounded-full border border-emerald-800 bg-emerald-950 px-1.5 py-px text-[11px] text-emerald-300">
                Exact contract match
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-secondary)]">
            {result.contractAddress ? (
              <span className="inline-flex items-center gap-1">
                <span className="mono-contract" title={result.contractAddress}>
                  {shortenContract(result.contractAddress)}
                </span>
                <button
                  type="button"
                  onClick={copyContract}
                  onKeyDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="rounded p-0.5 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  title="Copy full contract"
                  aria-label={`Copy contract ${result.contractAddress}`}
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
                </button>
              </span>
            ) : (
              <span>CMC id {result.providerAssetId}</span>
            )}
            {result.dexId ? <span>DEX {result.dexId}</span> : null}
            {result.quoteSymbol ? <span>/ {result.quoteSymbol}</span> : null}
            <span className="tabular-nums">Price {formatUsd(result.priceUsd)}</span>
            <span className="tabular-nums">Liq {formatUsdCompact(result.liquidityUsd)}</span>
          </div>
        </div>
        {selected ? <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-400" aria-hidden /> : null}
      </div>
    </div>
  )
}

export function AddTokenModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { notify } = useToast()
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const search = useAssetSearch(open ? query : '')
  const createAsset = useCreateAsset()

  // Reset state each time the modal opens.
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIdx(null)
      createAsset.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ])

  // Escape closes; background scroll locks while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose ])

  if (!open) return null

  const results = search.data ?? []
  const trimmed = query.trim()
  const selected: AssetSearchResult | null = selectedIdx !== null ? (results[selectedIdx] ?? null) : null

  async function saveAndGo(where: 'buy' | 'watchlist') {
    if (!selected) return
    try {
      const asset = await createAsset.mutateAsync({
        name: selected.name,
        symbol: selected.symbol,
        chain: selected.chain,
        contractAddress: selected.contractAddress,
        provider: selected.provider,
        providerAssetId: selected.providerAssetId,
        preferredPriceProvider: selected.provider,
        dexId: selected.dexId,
        pairAddress: selected.pairAddress,
        quoteSymbol: selected.quoteSymbol,
        imageUrl: selected.imageUrl,
        status: where === 'watchlist' ? 'WATCHLIST' : 'ACTIVE',
      })
      notify('success', where === 'buy' ? `${asset.symbol} saved — add the first BUY.` : `${asset.symbol} saved to watchlist.`)
      onClose()
      // Detail page owns the first-BUY handoff (?addTx=BUY auto-opens the tx
      // modal). Watchlist saves stay in place (Watchlist page lands in Phase 18).
      if (where === 'buy') navigate(`/assets/${asset.id}?addTx=BUY`)
    } catch (e) {
      notify('error', `Save failed: ${apiErrorMessage(e, 'Could not save asset.')}`)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Token"
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text)]">Add Token</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <label htmlFor="add-token-search" className="mt-3 block text-xs text-[var(--text-secondary)]">
          Search name, ticker, or contract address
        </label>
        <div className="relative mt-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden />
          <input
            id="add-token-search"
            type="search"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIdx(null)
            }}
            placeholder="e.g. SOL, PEPE, or paste a contract…"
            className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] py-2 pr-3 pl-9 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--text-muted)] focus:border-[var(--focus)] focus:outline-none"
          />
        </div>

        <div className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto" aria-live="polite">
          {trimmed.length === 0 ? (
            <p className="rounded-[var(--radius-control)] border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--text-secondary)]">
              Type to search across Dexscreener pairs and top centralized assets.
            </p>
          ) : search.isLoading ? (
            <LoadingSkeleton rows={3} />
          ) : search.isError ? (
            <ErrorState
              message={search.error instanceof Error ? search.error.message : 'Search failed.'}
              onRetry={() => search.refetch()}
              retrying={search.isFetching}
            />
          ) : results.length === 0 ? (
            <p className="rounded-[var(--radius-control)] border border-[var(--border)] p-4 text-center text-sm text-[var(--text-secondary)]">
              No candidates for “{trimmed}”. Check the spelling or paste the exact contract.
            </p>
          ) : (
            <>
              <p className="text-xs text-[var(--text-secondary)]" role="status">
                {results.length} candidate{results.length === 1 ? '' : 's'} — pick the exact pair, don’t guess by ticker.
              </p>
              {results.map((r, i) => (
                <CandidateCard
                  key={`${r.provider}|${r.chain}|${r.contractAddress ?? r.providerAssetId}|${r.pairAddress ?? ''}`}
                  result={r}
                  selected={selectedIdx === i}
                  saving={createAsset.isPending}
                  onSelect={() => setSelectedIdx(i)}
                />
              ))}
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || createAsset.isPending}
            onClick={() => saveAndGo('watchlist')}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
          >
            Save to watchlist
          </button>
          <button
            type="button"
            disabled={!selected || createAsset.isPending}
            onClick={() => saveAndGo('buy')}
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-[var(--radius-control)] bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {createAsset.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save & add first BUY
          </button>
        </div>
      </div>
    </div>
  )
}
