import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, Save } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import type { Journal } from '../api/client'
import { apiErrorMessage } from '../hooks/useMutations'
import { useUpsertJournal } from '../hooks/useJournal'
import { useToast } from '../hooks/useToast'
import { formatDateTime } from '../lib/format'
import { errCls, inputCls, labelCls } from '../lib/formClasses'
import { formatTags, journalFormSchema, parseTags, type JournalFormInput, type JournalFormValues } from '../lib/journalForm'
import { cn } from '../lib/cn'

function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string
  error?: string
  children: React.ReactElement<{ id?: string; className?: string }>
  hint?: string
}) {
  const controlId = children.props.id
  return (
    <div>
      <label htmlFor={controlId} className={labelCls}>
        {label} {hint ? <span className="text-[var(--text-muted)]">({hint})</span> : null}
      </label>
      {children}
      {error ? <p className={errCls}>{error}</p> : null}
    </div>
  )
}

/**
 * Per-asset journal editor (PLAN §17). Null journal → blank form; PUT upsert
 * persists. Pre-trade (thesis/strategy/...) stays structured for later
 * strategy analytics; post-trade review captures exit + lessons.
 */
export function JournalEditor({
  assetId,
  symbol,
  journal,
  isLoading,
}: {
  assetId: string
  symbol: string
  journal: Journal | null | undefined
  isLoading: boolean
}) {
  const { notify } = useToast()
  const upsert = useUpsertJournal()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<JournalFormInput, unknown, JournalFormValues>({
    resolver: zodResolver(journalFormSchema),
    defaultValues: {
      thesis: '',
      entryReason: '',
      invalidation: '',
      target: '',
      riskLevel: '',
      strategy: '',
      tagsInput: '',
      postTradeReview: '',
      exitReason: '',
    },
  })

  // Hydrate once the journal loads (null → blank form).
  useEffect(() => {
    if (journal !== undefined) {
      reset({
        thesis: journal?.thesis ?? '',
        entryReason: journal?.entryReason ?? '',
        invalidation: journal?.invalidation ?? '',
        target: journal?.target ?? '',
        riskLevel: journal?.riskLevel ?? '',
        strategy: journal?.strategy ?? '',
        tagsInput: formatTags(journal?.tags),
        postTradeReview: journal?.postTradeReview ?? '',
        exitReason: journal?.exitReason ?? '',
      })
      upsert.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journal?.id, assetId])

  if (isLoading) return <p className="text-sm text-[var(--text-secondary)]">Loading journal…</p>

  async function onSubmit(values: JournalFormValues) {
    try {
      const tags = parseTags(values.tagsInput ?? '')
      // Send only dirty-independent full payload — backend PUT merges partial,
      // but explicit full state keeps reload semantics obvious.
      await upsert.mutateAsync({
        assetId,
        payload: {
          thesis: values.thesis,
          entryReason: values.entryReason,
          invalidation: values.invalidation,
          target: values.target,
          riskLevel: values.riskLevel,
          strategy: values.strategy,
          tags,
          postTradeReview: values.postTradeReview,
          exitReason: values.exitReason,
        },
      })
      notify('success', `Journal for ${symbol} saved — reloads persisted.`)
      reset(
        { ...values, tagsInput: tags.join(', ') },
        { keepDirty: false },
      )
    } catch (e) {
      notify('error', `Save failed: ${apiErrorMessage(e, 'Could not save journal.')}`)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <fieldset className="space-y-3">
        <legend className="panel-title">Pre-trade</legend>
        <Field label="Trade thesis" error={errors.thesis?.message}>
          <textarea id="journal-thesis" rows={3} placeholder="Why does this trade exist?" className={cn(inputCls, 'mt-1 resize-y')} {...register('thesis')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Entry reason" error={errors.entryReason?.message}>
            <textarea id="journal-entry" rows={2} placeholder="Trigger, setup, timing…" className={cn(inputCls, 'mt-1 resize-y')} {...register('entryReason')} />
          </Field>
          <Field label="Invalidation" error={errors.invalidation?.message}>
            <textarea id="journal-invalidation" rows={2} placeholder="What proves this wrong?" className={cn(inputCls, 'mt-1 resize-y')} {...register('invalidation')} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Target" error={errors.target?.message}>
            <input id="journal-target" placeholder="e.g. $200" className={cn(inputCls, 'mt-1')} {...register('target')} />
          </Field>
          <Field label="Risk level" error={errors.riskLevel?.message}>
            <input id="journal-risk" placeholder="e.g. low / 1R" className={cn(inputCls, 'mt-1')} {...register('riskLevel')} />
          </Field>
          <Field label="Strategy" error={errors.strategy?.message}>
            <input id="journal-strategy" placeholder="e.g. DCA, breakout" className={cn(inputCls, 'mt-1')} {...register('strategy')} />
          </Field>
        </div>
        <Field label="Tags" hint="comma-separated, max 20" error={errors.tagsInput?.message}>
          <input id="journal-tags" placeholder="L1, core, high-conviction" className={cn(inputCls, 'mt-1')} {...register('tagsInput')} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="panel-title">Post-trade</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Exit reason" error={errors.exitReason?.message}>
            <textarea id="journal-exit" rows={2} placeholder="Why did you exit?" className={cn(inputCls, 'mt-1 resize-y')} {...register('exitReason')} />
          </Field>
          <Field label="Post-trade review" error={errors.postTradeReview?.message}>
            <textarea
              id="journal-review"
              rows={2}
              placeholder="Went well? Went wrong? Change next time?"
              className={cn(inputCls, 'mt-1 resize-y')}
              {...register('postTradeReview')}
            />
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={upsert.isPending || (!isDirty && journal !== null)}
          className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {upsert.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {upsert.isPending ? 'Saving…' : journal ? 'Save journal' : 'Create journal'}
        </button>
        {journal ? (
          <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums">Last saved {formatDateTime(journal.updatedAt)}</span>
        ) : null}
      </div>
    </form>
  )
}
