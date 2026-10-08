import { zodResolver } from '@hookform/resolvers/zod'
import { Calculator, LoaderCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'
import { simulateDca, type Asset, type DcaSimulation } from '../api/client'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/QueryState'
import { TransactionModal, type TxModalState } from '../components/TransactionModal'
import { useAssetPosition, useAssets } from '../hooks/useAssets'
import { apiErrorMessage } from '../hooks/useMutations'
import { useToast } from '../hooks/useToast'
import { dcaFormSchema, toSimulatePayload, type DcaFormInput, type DcaFormValues } from '../lib/dcaForm'
import { formatQty, formatRecovery, formatUsd } from '../lib/format'
import { errCls, inputCls, labelCls } from '../lib/formClasses'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel } from '../components/ui/Panel'
import { cn } from '../lib/cn'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.'
}

function ComparisonRow({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <tr className="border-b border-[var(--border)] tabular-nums last:border-0">
      <th scope="row" className="px-3 py-2 text-left text-xs font-normal text-[var(--text-secondary)]">
        {label}
      </th>
      <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{before}</td>
      <td className="px-3 py-2 text-right font-medium text-[var(--text)]">{after}</td>
    </tr>
  )
}

export function DcaPage() {
  const { notify } = useToast()
  const [searchParams] = useSearchParams()
  const assets = useAssets()
  const [txModal, setTxModal] = useState<TxModalState | null>(null)
  const [result, setResult] = useState<DcaSimulation | null>(null)
  const [lastFee, setLastFee] = useState('0')
  const [simError, setSimError] = useState<string | null>(null)
  const [simulating, setSimulating] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<DcaFormInput, unknown, DcaFormValues>({
    resolver: zodResolver(dcaFormSchema),
    defaultValues: {
      assetId: searchParams.get('asset') ?? '',
      additionalCapital: '',
      buyPrice: '',
      fee: '0',
    },
  })

  const watchedAssetId = useWatch({ control, name: 'assetId' })
  const position = useAssetPosition(watchedAssetId && watchedAssetId.length > 0 ? watchedAssetId : null)

  const list: Asset[] = assets.data ?? []
  const selectedAsset = list.find((a) => a.id === watchedAssetId) ?? null
  const marketPrice = position.data?.currentPrice ?? null

  async function onSubmit(values: DcaFormValues) {
    setSimulating(true)
    setSimError(null)
    try {
      const sim = await simulateDca(toSimulatePayload(values))
      setResult(sim)
      setLastFee(values.fee.trim() || '0')
    } catch (e) {
      const msg = apiErrorMessage(e, 'Simulation failed.')
      setSimError(msg)
      setResult(null)
      notify('error', `Simulation failed: ${msg}`)
    } finally {
      setSimulating(false)
    }
  }

  function addAsTransaction() {
    if (!result || !selectedAsset) return
    setTxModal({
      asset: selectedAsset,
      type: 'BUY',
      quantity: result.additionalQuantity,
      price: result.buyPriceUsed,
      fee: lastFee,
    })
  }

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="DCA Calculator"
        description="Project how fresh capital changes your average, BEP, and recovery — before committing a transaction. Simulation never writes to the ledger."
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
          hint="Add a token first, then simulate a DCA into it."
        />
      ) : (
        <div className="grid min-w-0 gap-5 lg:grid-cols-5">
          {/* Form — input left, before/after right on desktop (§11). */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="min-w-0 space-y-3 lg:col-span-2"
          >
          <Panel title="Simulasi DCA" meta="Simulasi — belum menjadi transaksi" label="Form simulasi DCA">
            <div>
              <label htmlFor="dca-asset" className={labelCls}>
                Asset
              </label>
              <select
                id="dca-asset"
                {...register('assetId', {
                  onChange: () => {
                    setResult(null)
                    setSimError(null)
                  },
                })}
                className={cn(inputCls, 'mt-1')}
              >
                <option value="">Choose an asset…</option>
                {list.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.symbol} · {a.name} ({a.chain})
                  </option>
                ))}
              </select>
              {errors.assetId ? <p className={errCls}>{errors.assetId.message}</p> : null}
            </div>

            {selectedAsset && position.data ? (
              <p className="text-xs text-[var(--text-secondary)] tabular-nums">
                Holding {formatQty(position.data.remainingQuantity)} {position.data.symbol}
                {marketPrice ? <> · Market {formatUsd(marketPrice)}</> : <> · Market price unavailable</>}
              </p>
            ) : null}

            <div>
              <label htmlFor="dca-capital" className={labelCls}>
                Additional capital (USD)
              </label>
              <input
                id="dca-capital"
                inputMode="decimal"
                placeholder="e.g. 200"
                className={cn(inputCls, 'mt-1')}
                {...register('additionalCapital')}
              />
              {errors.additionalCapital ? <p className={errCls}>{errors.additionalCapital.message}</p> : null}
            </div>

            <div>
              <label htmlFor="dca-price" className={labelCls}>
                Custom buy price (USD) <span className="text-[var(--text-muted)]">(optional)</span>
              </label>
              <input
                id="dca-price"
                inputMode="decimal"
                placeholder={marketPrice ? `Empty = market ${formatUsd(marketPrice)}` : 'Empty = latest market price'}
                className={cn(inputCls, 'mt-1')}
                {...register('buyPrice')}
              />
              {errors.buyPrice ? <p className={errCls}>{errors.buyPrice.message}</p> : null}
            </div>

            <div>
              <label htmlFor="dca-fee" className={labelCls}>
                Fee (USD)
              </label>
              <input
                id="dca-fee"
                inputMode="decimal"
                placeholder="0"
                className={cn(inputCls, 'mt-1')}
                {...register('fee')}
              />
              {errors.fee ? <p className={errCls}>{errors.fee.message}</p> : null}
            </div>

            <button
              type="submit"
              disabled={simulating}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-[var(--radius-control)] bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {simulating ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Calculator className="h-4 w-4" aria-hidden />
              )}
              {simulating ? 'Simulating…' : 'Simulate DCA'}
            </button>
          </Panel>
          </form>

          {/* Before/After */}
          <section aria-label="Simulation result" className="min-w-0 lg:col-span-3">
            {simError ? (
              <ErrorState message={simError} onRetry={() => setSimError(null)} />
            ) : result ? (
              <Panel title="Hasil simulasi" meta={`Buy price used ${formatUsd(result.buyPriceUsed)}${result.currentPrice ? ` · Market ${formatUsd(result.currentPrice)}` : ''}`} label="Hasil simulasi DCA">
                <div className="overflow-x-auto" role="region" aria-label="Before after table" tabIndex={0}>
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                        <th scope="col" className="px-3 py-2 text-left font-medium">Metric</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Before</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      <ComparisonRow label="Average Buy" before={formatUsd(result.currentAverageBuy)} after={formatUsd(result.projectedAverageBuy)} />
                      <ComparisonRow label="BEP" before={formatUsd(result.currentBep)} after={formatUsd(result.projectedBep)} />
                      <ComparisonRow
                        label="Quantity"
                        before={formatQty(result.currentQuantity)}
                        after={`${formatQty(result.projectedQuantity)} (+${formatQty(result.additionalQuantity)})`}
                      />
                      <ComparisonRow
                        label="Cost Basis"
                        before={formatUsd(Number(result.currentQuantity) * Number(result.currentAverageBuy))}
                        after={formatUsd(result.projectedTotalExposure)}
                      />
                      <ComparisonRow
                        label="Need to BEP"
                        before={formatRecovery(result.currentRecoveryToBepPercent)}
                        after={formatRecovery(result.projectedRecoveryToBepPercent)}
                      />
                      <ComparisonRow
                        label="Exposure"
                        before={formatUsd(Number(result.currentQuantity) * Number(result.currentAverageBuy))}
                        after={formatUsd(result.projectedTotalExposure)}
                      />
                    </tbody>
                  </table>
                </div>
                {/* Separate CTA — simulation never auto-creates a transaction (PLAN §16). */}
                {/* Draft opens prefilled; user still presses Save in the form (§11). */}
                <div className="mt-3">
                  <Button variant="primary" onClick={addAsTransaction}>
                    <Plus className="h-4 w-4" aria-hidden /> Gunakan sebagai draft BUY
                  </Button>
                </div>
              </Panel>
            ) : (
              <div className="rounded-[var(--radius-panel)] border border-dashed border-[var(--border)] p-8 text-center">
                <p className="text-sm font-medium text-[var(--text)]">No simulation yet</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-[var(--text-secondary)]">
                  Pick an asset, enter fresh capital, and simulate — the before/after projection appears here.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      <TransactionModal state={txModal} onClose={() => setTxModal(null)} />
    </div>
  )
}
