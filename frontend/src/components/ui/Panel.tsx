import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface Props {
  title?: string
  meta?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  glint?: boolean
  label?: string
}

/**
 * Shared panel primitive (REDESIGN §6/§14).
 * Solid surface, 1px border, restrained gold glint on hero only.
 */
export function Panel({ title, meta, actions, children, className, glint = false, label }: Props) {
  return (
    <section aria-label={label ?? title} className={cn('panel', glint && 'panel-glint', 'p-4 sm:p-5', className)}>
      {title ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="panel-title">{title}</h2>
            {meta ? <p className="mt-1 text-xs text-[var(--text-muted)]">{meta}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
