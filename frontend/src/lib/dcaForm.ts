import { z } from 'zod'

const decimalString = (field: string, opts: { allowZero?: boolean; optional?: boolean } = {}) => {
  const base = z
    .string()
    .trim()
    .refine(
      (v) => {
        // Empty means "not provided": valid for optional fields AND for fee
        // (normalized to '0' in the payload). Required capital rejects ''.
        if (v === '') return (opts.optional ?? false) || opts.allowZero === true
        if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) return false
        const n = Number(v)
        if (!Number.isFinite(n)) return false
        return opts.allowZero ? n >= 0 : n > 0
      },
      { message: `${field} must be ${opts.allowZero ? '>= 0' : '> 0'}.` },
    )
  if (opts.optional) return base.optional().default('')
  // allowZero fields (fee): empty passes refine, then transforms to '0'
  // so output is always a usable decimal string.
  // Required fields (capital): empty fails refine with the must-be->-0 message.
  if (opts.allowZero) return base.transform((v) => (v.trim() === '' ? '0' : v))
  return base.min(1, `${field} is required.`)
}

/**
 * DCA simulator form. buyPrice is optional — empty means "use latest market
 * price" (PLAN §16). additionalCapital > 0, fee >= 0.
 */
export const dcaFormSchema = z.object({
  assetId: z.string().min(1, 'Choose an asset.'),
  additionalCapital: decimalString('Additional capital'),
  buyPrice: decimalString('Buy price', { optional: true }),
  fee: decimalString('Fee', { allowZero: true }).optional().default('0'),
})

export type DcaFormValues = z.output<typeof dcaFormSchema>
export type DcaFormInput = z.input<typeof dcaFormSchema>

/** Payload for POST /api/dca/simulate — omits empty buyPrice so the backend defaults to market. */
export function toSimulatePayload(values: DcaFormValues): {
  assetId: string
  additionalCapital: string
  buyPrice?: string
  fee: string
} {
  const buyPrice = values.buyPrice?.trim()
  return {
    assetId: values.assetId,
    additionalCapital: values.additionalCapital.trim(),
    ...(buyPrice ? { buyPrice } : {}),
    fee: values.fee.trim() || '0',
  }
}
