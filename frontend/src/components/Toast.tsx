import { CircleAlert, CircleCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { ToastContext, useToastNotifyValue, useToastStore } from '../hooks/useToast'
import { cn } from '../lib/cn'

export function ToastProvider({ children }: { children: ReactNode }) {
  const { items, notify } = useToastStore()
  const value = useToastNotifyValue(notify)

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-lg border p-3 text-sm shadow-lg',
              t.kind === 'success' && 'border-emerald-800 bg-emerald-950 text-emerald-100',
              t.kind === 'error' && 'border-red-800 bg-red-950 text-red-100',
              t.kind === 'info' && 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)]',
            )}
          >
            {t.kind === 'error' ? (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
