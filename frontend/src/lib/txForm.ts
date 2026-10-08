import { z } from 'zod'

const decimalString = (field: string, opts: { allowZero?: boolean } = {}) =>
  z
    .string()
    .trim()
    .min(1, `${field} is required.`)
    .refine(
      (v) => {
        if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) return false
        const n = Number(v)
        if (!Number.isFinite(n)) return false
        return opts.allowZero ? n >= 0 : n > 0
      },
      { message: `${field} must be ${opts.allowZero ? '>= 0' : '> 0'}.` },
    )

/** Mirrors backend createTransactionSchema. executedAt validated as future-guard on submit. */
export const txFormSchema = z.object({
  type: z.enum(['BUY', 'SELL']),
  quantity: decimalString('Quantity'),
  pricePerToken: decimalString('Price'),
  fee: decimalString('Fee', { allowZero: true }).optional().default('0'),
  executedAt: z.string().min(1, 'Date & time is required.'),
  note: z.string().trim().max(2000).optional().default(''),
})

export type TxFormValues = z.output<typeof txFormSchema>
/** Raw form input (zod v4: optional+default fields accept undefined on input). */
export type TxFormInput = z.input<typeof txFormSchema>

/** Total helper (PLAN §14): BUY = qty×price+fee, SELL = qty×price−fee. Null when inputs invalid. */
export function calcTxTotal(values: { type: 'BUY' | 'SELL'; quantity: string; pricePerToken: string; fee?: string }): {
  total: number | null
  label: string
} {
  const qty = Number(values.quantity)
  const price = Number(values.pricePerToken)
  const fee = Number(values.fee ?? '0')
  if (![qty, price, fee].every((n) => Number.isFinite(n)) || qty <= 0 || price <= 0 || fee < 0) {
    return { total: null, label: values.type === 'SELL' ? 'Estimated proceeds' : 'Total' }
  }
  const total = values.type === 'SELL' ? qty * price - fee : qty * price + fee
  return { total, label: values.type === 'SELL' ? 'Estimated proceeds' : 'Total' }
}

/** datetime-local value → ISO string. Empty → null. */
export function toIsoString(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Now as datetime-local input value (YYYY-MM-DDTHH:mm). */
export function nowLocalInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
