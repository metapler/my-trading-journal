/**
 * Shared form classes (REDESIGN §6/§14). Single source for inputs, labels,
 * and inline errors so every flow matches the token system. 44px min-height
 * on inputs for touch targets; visible focus via global :focus-visible plus
 * a border cue. No behavior change — class strings only.
 */
export const inputCls =
  'min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] tabular-nums placeholder:text-[var(--text-muted)] hover:border-[var(--text-muted)] focus:border-[var(--focus)] focus:outline-none'

export const labelCls = 'block text-xs text-[var(--text-secondary)]'

export const errCls = 'mt-1 text-xs text-[var(--negative)]'
