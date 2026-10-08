import type { ReactNode } from 'react'

interface Props {
  title: string
  description?: string
  actions?: ReactNode
}

/**
 * Consistent page heading (REDESIGN §5/§14).
 * Title 22–28px semibold; description optional short; actions on the right.
 * Topbar owns the global title on desktop; this is the in-content heading
 * used by pages until the topbar title takes over fully.
 */
export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">{title}</h1>
        {description ? <p className="mt-1 max-w-prose text-sm text-[var(--text-secondary)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
