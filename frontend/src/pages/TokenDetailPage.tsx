import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, Calculator, Check, Copy } from 'lucide-react'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/QueryState'
import { JournalEditor } from '../components/JournalEditor'
import { TransactionModal, type TxModalState } from '../components/TransactionModal'
import { TransactionsTable } from '../components/TransactionsTable'
import { Button } from '../components/ui/Button'
import { Panel } from '../components/ui/Panel'
import { useToast } from '../hooks/useToast'
import { useAsset, useAssetPosition, useAssetTransactions } from '../hooks/useAssets'
import { useJournal } from '../hooks/useJournal'
import { copyText, shortenContract } from '../lib/contract'
import {
  formatEpoch,
  formatQty,
  formatRecovery,
  formatSignedPercent,
  formatSignedUsd,
  formatUsd,
  formatUsdCompact,
  pnlTone,
} from '../lib/format'
import { cn } from '../lib/cn'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.'
}

/** Position panel row: label + tabular value with PnL tone where relevant. */
function PanelRow({
  label,
  value,
  tone = 'neutral',
  title,
}: {
  label: string
  value: string
  tone?: 'profit' | 'loss' | 'neutral'
  title?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5" title={title}>
      <dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
      <dd
        className={cn(
          'font-mono text-sm font-medium tabular-nums',
          tone === 'profit' && 'text-profit',
          tone === 'loss' && 'text-loss',
          tone === 'neutral' && 'text-[var(--text)]',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

export function TokenDetailPage() {
  const { id } = useParams<{ id: string }>()
  const assetId = id ?? null
  const { notify } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [txModal, setTxModal] = useState<TxModalState | null>(null)
  const [copied, setCopied] = useState(false)

  const asset = useAsset(assetId)
  const position = useAssetPosition(assetId)
  const txs = useAssetTransactions(assetId)
  const journal = useJournal(assetId)

  // AddToken → detail handoff (?addTx=BUY|SELL): URL is the source of truth,
  // same pattern as TransactionsPage. Modal derives from params; closing
  // clears them. Requires the asset row so the modal has full identity.
  const handoffParam = searchParams.get('addTx')
  const handoffType: 'BUY' | 'SELL' | null =
    handoffParam === 'BUY' || handoffParam === 'SELL' ? handoffParam : null
  const handoff: TxModalState | null =
    asset.data && handoffType ? { asset: asset.data, type: handoffType } : null
  const effectiveTxModal = txModal ?? handoff

  function closeTxModal() {
    setTxModal(null)
    if (handoff) setSearchParams({}, { replace: true })
  }

  function openTx(type: 'BUY' | 'SELL') {
    if (!asset.data) return
    setTxModal({
      asset: asset.data,
      type,
      price: position.data?.currentPrice ?? null,
      availableQuantity: position.data?.remainingQuantity ?? null,
    })
  }

  async function copyFullContract() {
    const full = asset.data?.contractAddress
    if (!full) return
    if (await copyText(full)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } else {
      notify('error', 'Copy failed — select and copy manually.')
    }
  }

  const refreshing = asset.isFetching || position.isFetching || txs.isFetching
  const updatedAt = position.dataUpdatedAt ?? txs.dataUpdatedAt ?? null

  if (asset.isLoading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton rows={2} />
        <LoadingSkeleton rows={4} />
      </div>
    )
  }

  if (asset.isError || !asset.data) {
    return (
      <div className="space-y-4">
        <Link to="/positions" className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to positions
        </Link>
        <ErrorState
          message={asset.isError ? errorMessage(asset.error) : 'Asset not found.'}
          onRetry={() => asset.refetch()}
          retrying={asset.isFetching}
        />
      </div>
    )
  }

  const a = asset.data
  const p = position.data

  return (
    <div className="min-w-0 space-y-5">
      {/* Header: identity, chain, contract, price, source, update time (§11). */}
      <div>
        <Link to="/positions" className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to positions
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {a.imageUrl ? (
              <img src={a.imageUrl} alt="" className="h-11 w-11 rounded-full bg-[var(--surface-hover)]" />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-hover)] text-base font-semibold text-[var(--text-secondary)]">
                {a.symbol.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
                {a.name} <span className="text-[var(--text-secondary)]">· {a.symbol}</span>
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-secondary)]">
                <span className="rounded-full border border-[var(--border)] px-1.5 py-px">{a.chain}</span>
                {a.dexId ? <span>DEX {a.dexId}</span> : null}
                {a.quoteSymbol ? <span>/ {a.quoteSymbol}</span> : null}
                {a.contractAddress ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="mono-contract" title={a.contractAddress}>
                      {shortenContract(a.contractAddress)}
                    </span>
                    <button
                      type="button"
                      onClick={copyFullContract}
                      className="rounded p-0.5 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                      title="Copy full contract"
                      aria-label={`Copy contract ${a.contractAddress}`}
                    >
                      {copied ? (
                        <Check className="h-3 w-3 text-emerald-400" aria-hidden />
                      ) : (
                        <Copy className="h-3 w-3" aria-hidden />
                      )}
                    </button>
                  </span>
                ) : a.providerAssetId ? (
                  <span>Provider id {a.providerAssetId}</span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-secondary)]">Current Price</p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--text)]">{formatUsd(p?.currentPrice)}</p>
            <p className="mt-1 flex items-center justify-end gap-2 text-xs text-[var(--text-secondary)]">
              {p?.priceSource ? <span>via {p.priceSource}</span> : null}
              {p?.priceStale ? <span className="text-amber-300">(stale)</span> : null}
              <Button
                variant="secondary"
                onClick={() => {
                  void asset.refetch()
                  void position.refetch()
                  void txs.refetch()
                }}
                disabled={refreshing}
                className="min-h-11 px-3 py-1 text-xs"
              >
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </Button>
            </p>
          </div>
        </div>
        {/* 24h data when provided by the price source */}
        {p && (p.currentPrice === null || p.priceSource) ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-[var(--text-secondary)] tabular-nums">
            {p.currentValue !== null ? <span>Position value {formatUsdCompact(p.currentValue)}</span> : null}
            <span>Last updated: {formatEpoch(updatedAt)}</span>
          </div>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-5">
        {/* Position panel — full PLAN metrics retained (§11). */}
        <Panel title="Position" label="Position" className="lg:col-span-2">
          {position.isLoading ? (
            <div className="mt-3"><LoadingSkeleton rows={5} /></div>
          ) : position.isError || !p ? (
            <div className="mt-3">
              <ErrorState
                message={position.isError ? errorMessage(position.error) : 'Position unavailable.'}
                onRetry={() => position.refetch()}
                retrying={position.isFetching}
              />
            </div>
          ) : (
            <dl className="mt-2 divide-y divide-[var(--border)]">
              <PanelRow label="Quantity" value={`${formatQty(p.remainingQuantity)} ${p.symbol}`} />
              <PanelRow label="Average Buy" value={formatUsd(p.averageBuy)} />
              <PanelRow label="Current Price" value={formatUsd(p.currentPrice)} />
              <PanelRow label="BEP" value={formatUsd(p.bepPrice)} title="Break-even price (cost basis ÷ quantity)" />
              <PanelRow label="Cost Basis" value={formatUsd(p.remainingCostBasis)} />
              <PanelRow label="Current Value" value={formatUsd(p.currentValue)} />
              <PanelRow
                label="Unrealized PnL"
                value={`${formatSignedUsd(p.unrealizedPnL)} (${formatSignedPercent(p.unrealizedPnLPercent)})`}
                tone={pnlTone(p.unrealizedPnL)}
              />
              <PanelRow
                label="Realized PnL"
                value={formatSignedUsd(p.realizedPnL)}
                tone={pnlTone(p.realizedPnL)}
                title="Locked in from sells"
              />
              <PanelRow
                label="Need to BEP"
                value={formatRecovery(p.recoveryToBepPercent)}
                title="Gain needed from current price to break even"
              />
            </dl>
          )}

          {/* Primary actions: BUY/DCA + SELL; secondary: simulate (§11). */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openTx('BUY')}
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Catat BUY/DCA
            </button>
            <button
              type="button"
              onClick={() => openTx('SELL')}
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
            >
              Catat SELL
            </button>
            <Link
              to={`/tools/dca?asset=${a.id}`}
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              <Calculator className="h-4 w-4" aria-hidden /> Simulate DCA
            </Link>
            <a
              href="#journal"
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              <BookOpen className="h-4 w-4" aria-hidden /> Edit Journal
            </a>
          </div>
        </Panel>

        {/* Transactions */}
        <section aria-label="Transactions" className="min-w-0 space-y-3 lg:col-span-3">
          <h2 className="panel-title">Transactions</h2>
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
              title="No transactions yet"
              hint={`Record the first BUY to open the ${a.symbol} position.`}
              action={
                <Button variant="primary" onClick={() => openTx('BUY')}>
                  Add first BUY
                </Button>
              }
            />
          )}
        </section>
      </div>

      {/* Journal — structured pre/post-trade notes, persisted per asset (PLAN §17). */}
      <Panel title="Trade Journal" label="Journal" className="scroll-mt-20" >
        <p className="-mt-1 text-xs text-[var(--text-secondary)]">
          Structured thesis and review for {a.symbol} — saved per asset, reload-safe, ready for future strategy
          analytics. No AI in MVP.
        </p>
        <div className="mt-3">
          <JournalEditor assetId={a.id} symbol={a.symbol} journal={journal.data} isLoading={journal.isLoading} />
          {journal.isError ? (
            <div className="mt-3">
              <ErrorState
                message={errorMessage(journal.error)}
                onRetry={() => journal.refetch()}
                retrying={journal.isFetching}
              />
            </div>
          ) : null}
        </div>
      </Panel>

      {/* No fabricated charts: price history intentionally absent until a real candles source exists (PLAN §15). */}

      <TransactionModal state={effectiveTxModal} onClose={closeTxModal} />
    </div>
  )
}
