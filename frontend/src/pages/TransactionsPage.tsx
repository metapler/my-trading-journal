import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { AddTokenModal } from '../components/AddTokenModal'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/QueryState'
import { TransactionModal, type TxModalState } from '../components/TransactionModal'
import { TransactionsTable } from '../components/TransactionsTable'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel } from '../components/ui/Panel'
import { useToast } from '../hooks/useToast'
import { useAssetPosition, useAssets, useAssetTransactions } from '../hooks/useAssets'
import { formatEpoch, formatQty, formatUsd } from '../lib/format'
import { inputCls } from '../lib/formClasses'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.'
}

export function TransactionsPage() {
  const { notify } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const assets = useAssets()
  // Initial selection from URL (?asset=X); thereafter user-controlled.
  const [assetId, setAssetId] = useState<string | null>(() => searchParams.get('asset'))
  const [addTokenOpen, setAddTokenOpen] = useState(false)
  const [txModal, setTxModal] = useState<TxModalState | null>(null)
  const lastError = useRef<string | null>(null)

  const list = useMemo(() => assets.data ?? [], [assets.data])
  const selectedId = assetId ?? list[0]?.id ?? null
  const selectedAsset = list.find((a) => a.id === selectedId) ?? null
  const txs = useAssetTransactions(selectedId)
  const position = useAssetPosition(selectedId)

  // Handoff from Add Token → first BUY: the URL itself (?asset=X&addTx=BUY) is
  // the source of truth, so no setState-in-effect is needed. Once assets load,
  // the modal derives directly from URL params; closing it clears the params.
  const handoffParam = searchParams.get('addTx')
  const handoffType: 'BUY' | 'SELL' | null =
    handoffParam === 'BUY' || handoffParam === 'SELL' ? handoffParam : null
  const handoffAsset =
    handoffType !== null ? (list.find((a) => a.id === searchParams.get('asset')) ?? null) : null
  const handoff: TxModalState | null =
    handoffAsset !== null && handoffType !== null ? { asset: handoffAsset, type: handoffType } : null
  const effectiveTxModal = txModal ?? handoff

  function closeTxModal() {
    setTxModal(null)
    if (handoff) setSearchParams({}, { replace: true })
  }

  useEffect(() => {
    if (txs.isError && !txs.isFetching) {
      const msg = errorMessage(txs.error)
      if (lastError.current !== msg) {
        lastError.current = msg
        notify('error', `Transactions failed: ${msg}`)
      }
    }
    if (!txs.isError) lastError.current = null
  }, [txs.isError, txs.isFetching, txs.error, notify])

  function openTx(type: 'BUY' | 'SELL') {
    if (!selectedAsset) return
    setTxModal({
      asset: selectedAsset,
      type,
      price: position.data?.currentPrice ?? null,
      availableQuantity: position.data?.remainingQuantity ?? null,
    })
  }

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Transactions"
        description="Ledger history per asset — the source of truth."
        actions={
          <>
            <Button variant="secondary" onClick={() => setAddTokenOpen(true)}>
              <Plus className="h-[18px] w-[18px]" aria-hidden /> Add Token
            </Button>
            <Button variant="secondary" onClick={() => txs.refetch()} disabled={txs.isFetching}>
              {txs.isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
          </>
        }
      />

      {assets.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : assets.isError ? (
        <ErrorState
          message={errorMessage(assets.error)}
          onRetry={() => assets.refetch()}
          retrying={assets.isFetching}
        />
      ) : list.length === 0 ? (
        <EmptyState
          title="No tokens yet"
          hint="Add your first token, then record a BUY to start the ledger."
          action={
            <Button variant="primary" onClick={() => setAddTokenOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Add Token
            </Button>
          }
        />
      ) : (
        <Panel title="Catat transaksi" meta="Pilih aset, lalu BUY/DCA atau SELL" label="Catat transaksi">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="tx-asset" className="text-xs text-[var(--text-secondary)]">
              Asset
            </label>
            <select
              id="tx-asset"
              value={selectedId ?? ''}
              onChange={(e) => setAssetId(e.target.value || null)}
              className={inputCls}
            >
              {list.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.symbol} · {a.name} ({a.chain})
                </option>
              ))}
            </select>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openTx('BUY')}
                disabled={!selectedAsset}
                className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Add BUY / DCA
              </button>
              <button
                type="button"
                onClick={() => openTx('SELL')}
                disabled={!selectedAsset}
                className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                Add SELL
              </button>
            </div>
          </div>

          {position.data ? (
            <p className="mt-2 text-xs text-[var(--text-secondary)] tabular-nums">
              Available {formatQty(position.data.remainingQuantity)} {position.data.symbol}
              {position.data.currentPrice ? <> · Market {formatUsd(position.data.currentPrice)}</> : null}
            </p>
          ) : null}
        </Panel>
      )}
      {list.length > 0 ? (
        <div className="space-y-3">
          {txs.isLoading ? (
            <LoadingSkeleton rows={4} />
          ) : txs.isError ? (
            <ErrorState
              message={errorMessage(txs.error)}
              onRetry={() => txs.refetch()}
              retrying={txs.isFetching}
            />
          ) : txs.data && txs.data.length > 0 ? (
            <TransactionsTable transactions={txs.data} />
          ) : (
            <EmptyState
              title="No transactions for this asset"
              hint="Record the first BUY to open the position."
              action={
                <Button variant="primary" onClick={() => openTx('BUY')}>
                  Add first BUY
                </Button>
              }
            />
          )}
          <p className="font-mono text-xs text-[var(--text-muted)] tabular-nums">Last updated: {formatEpoch(txs.dataUpdatedAt ?? null)}</p>
        </div>
      ) : null}

      <AddTokenModal open={addTokenOpen} onClose={() => setAddTokenOpen(false)} />
      <TransactionModal state={effectiveTxModal} onClose={closeTxModal} />
    </div>
  )
}
