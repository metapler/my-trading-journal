import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { Asset } from '../api/client'
import { apiErrorMessage, useCreateTransaction } from '../hooks/useMutations'
import { useToast } from '../hooks/useToast'
import { formatQty, formatUsd } from '../lib/format'
import { errCls, inputCls, labelCls } from '../lib/formClasses'
import { calcTxTotal, nowLocalInput, toIsoString, txFormSchema, type TxFormInput, type TxFormValues } from '../lib/txForm'
import { cn } from '../lib/cn'

export interface TxModalState {
  asset: Asset
  type: 'BUY' | 'SELL'
  /** Prefill quantity (e.g. simulator additionalQuantity). */
  quantity?: string | null
  /** Prefill price (e.g. latest market price). */
  price?: string | null
  /** Prefill fee. */
  fee?: string | null
  /** Prefill note (e.g. DCA simulator provenance). */
  note?: string | null
  /** Available quantity for SELL guard display. */
  availableQuantity?: string | null
}



export function TransactionModal({
  state,
  onClose,
}: {
  state: TxModalState | null
  onClose: () => void
}) {
  const { notify } = useToast()
  const createTx = useCreateTransaction()
  const open = state !== null

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    clearErrors,
    control,
    formState: { errors },
  } = useForm<TxFormInput, unknown, TxFormValues>({
    resolver: zodResolver(txFormSchema),
    defaultValues: { type: 'BUY', quantity: '', pricePerToken: '', fee: '0', executedAt: nowLocalInput(), note: '' },
  })

  // Reset form whenever the modal opens for a (new) asset.
  useEffect(() => {
    if (state) {
      reset({
        type: state.type,
        quantity: state.quantity ?? '',
        pricePerToken: state.price ?? '',
        fee: state.fee ?? '0',
        executedAt: nowLocalInput(),
        note: state.note ?? '',
      })
      clearErrors()
      createTx.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.asset.id, state?.type, open])

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
  }, [open, onClose])

  const watched = useWatch({ control })
  const txType = watched.type ?? 'BUY'
  const { total, label } = calcTxTotal({
    type: txType,
    quantity: watched.quantity ?? '',
    pricePerToken: watched.pricePerToken ?? '',
    fee: watched.fee ?? '0',
  })

  if (!open || !state) return null
  const { asset } = state
  const available = state.availableQuantity != null ? Number(state.availableQuantity) : null
  const wanted = Number(watched.quantity)
  const oversell =
    txType === 'SELL' && available !== null && Number.isFinite(wanted) && wanted > 0 && wanted > available

  async function onSubmit(values: TxFormValues) {
    const iso = toIsoString(values.executedAt)
    if (!iso) {
      setError('executedAt', { message: 'Date & time is invalid.' })
      return
    }
    if (new Date(iso).getTime() > Date.now() + 5 * 60_000) {
      setError('executedAt', { message: 'Date & time must not be in the future.' })
      return
    }
    try {
      const tx = await createTx.mutateAsync({
        assetId: asset.id,
        payload: {
          type: values.type,
          quantity: values.quantity.trim(),
          pricePerToken: values.pricePerToken.trim(),
          fee: values.fee.trim() || '0',
          executedAt: iso,
          note: values.note.trim() ? values.note.trim() : null,
        },
      })
      notify('success', `${tx.type} ${formatQty(tx.quantity)} ${asset.symbol} saved — position recalculated.`)
      onClose()
    } catch (e) {
      const msg = apiErrorMessage(e, 'Could not save transaction.')
      setError('root', { message: msg })
      notify('error', `Save failed: ${msg}`)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Add ${txType} for ${asset.symbol}`}
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl sm:p-5"
        noValidate
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text)]">
            Add {txType} <span className="text-[var(--text-secondary)]">· {asset.symbol}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {asset.name} on {asset.chain}
          {available !== null && Number.isFinite(available) ? (
            <span className="tabular-nums"> · Available {formatQty(state.availableQuantity)} {asset.symbol}</span>
          ) : null}
        </p>

        {/* Type toggle */}
        <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Transaction type">
          {(['BUY', 'SELL'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setValue('type', t, { shouldValidate: false })}
              aria-pressed={txType === t}
              className={cn(
                'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                txType === t
                  ? t === 'BUY'
                    ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                    : 'border-red-700 bg-red-950/50 text-red-200'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]',
              )}
            >
              {t === 'BUY' ? 'Buy / DCA' : 'Sell'}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="tx-qty" className={labelCls}>
              Quantity
            </label>
            <input id="tx-qty" inputMode="decimal" placeholder="e.g. 100" className={cn(inputCls, 'mt-1')} {...register('quantity')} />
            {errors.quantity ? <p className={errCls}>{errors.quantity.message}</p> : null}
          </div>
          <div>
            <label htmlFor="tx-price" className={labelCls}>
              Price per Token (USD)
            </label>
            <input id="tx-price" inputMode="decimal" placeholder="e.g. 0.00123" className={cn(inputCls, 'mt-1')} {...register('pricePerToken')} />
            {errors.pricePerToken ? <p className={errCls}>{errors.pricePerToken.message}</p> : null}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="tx-fee" className={labelCls}>
              Fee (USD)
            </label>
            <input id="tx-fee" inputMode="decimal" placeholder="0" className={cn(inputCls, 'mt-1')} {...register('fee')} />
            {errors.fee ? <p className={errCls}>{errors.fee.message}</p> : null}
          </div>
          <div>
            <label htmlFor="tx-when" className={labelCls}>
              Date &amp; Time
            </label>
            <input id="tx-when" type="datetime-local" className={cn(inputCls, 'mt-1')} {...register('executedAt')} />
            {errors.executedAt ? <p className={errCls}>{errors.executedAt.message}</p> : null}
          </div>
        </div>

        <div className="mt-3">
          <label htmlFor="tx-note" className={labelCls}>
            Note <span className="text-[var(--text-muted)]">(optional)</span>
          </label>
          <textarea
            id="tx-note"
            rows={2}
            placeholder="Thesis, context, anything worth remembering…"
            className={cn(inputCls, 'mt-1 resize-none')}
            {...register('note')}
          />
          {errors.note ? <p className={errCls}>{errors.note.message}</p> : null}
        </div>

        {/* Live total helper */}
        <div className="mt-3 flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
          <span className="text-[var(--text-secondary)]">{label}</span>
          <span className="font-semibold tabular-nums text-[var(--text)]">
            {total === null ? '—' : formatUsd(total)}
          </span>
        </div>

        {oversell ? (
          <p role="note" className="mt-2 flex items-start gap-1.5 text-xs text-amber-300">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Quantity exceeds available {formatQty(state.availableQuantity)} {asset.symbol} — the server will reject
            this SELL.
          </p>
        ) : null}

        {errors.root ? (
          <p role="alert" className="mt-2 text-xs text-[var(--negative)]">
            {errors.root.message}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createTx.isPending}
            className={cn(
              'inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50',
              txType === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500',
            )}
          >
            {createTx.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save {txType}
          </button>
        </div>
      </form>
    </div>
  )
}
