import type { ReactNode } from 'react'
import { WifiOff } from 'lucide-react'
import { cn } from '../lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-[var(--surface-hover)]', className ?? 'h-4 w-full')} />
}

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  retrying = false,
}: {
  message: string
  onRetry?: () => void
  retrying?: boolean
}) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-800/60 bg-red-950/40 p-4">
      <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-red-200">Something went wrong</p>
        <p className="mt-1 text-sm text-red-300/80">{message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-3 rounded-md border border-red-700 px-3 py-1.5 text-sm text-red-100 transition-colors hover:bg-red-900/60 disabled:opacity-50"
          >
            {retrying ? 'Retrying…' : 'Try again'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-dashed border-[var(--border)] p-8 text-center">
      <p className="text-sm font-medium text-[var(--text)]">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-md text-sm text-[var(--text-secondary)]">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}
