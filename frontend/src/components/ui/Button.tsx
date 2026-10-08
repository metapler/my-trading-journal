import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  // Warm off-white primary (§6). Gold reserved for selected states/accents.
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  ghost: 'btn text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
  danger: 'btn bg-red-600 text-white hover:bg-red-500',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

/**
 * Shared button primitive (REDESIGN §6/§14).
 * 44px min-height for touch targets; visible focus via global :focus-visible.
 */
export function Button({ variant = 'secondary', className, type = 'button', ...rest }: Props) {
  return <button type={type} className={cn(variants[variant], className)} {...rest} />
}
