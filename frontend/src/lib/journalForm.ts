import { z } from 'zod'

const textField = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Max ${max} characters.`)
    .transform((s) => (s === '' ? null : s))
    .nullable()
    .optional()

/** Mirrors backend upsertJournalSchema. Empty strings become null (cleared fields). */
export const journalFormSchema = z.object({
  thesis: textField(5000),
  entryReason: textField(5000),
  invalidation: textField(5000),
  target: textField(500),
  riskLevel: textField(50),
  strategy: textField(100),
  tagsInput: z.string().trim().max(500, 'Max 500 characters.').optional().default(''),
  postTradeReview: textField(5000),
  exitReason: textField(5000),
})

export type JournalFormValues = z.output<typeof journalFormSchema>
export type JournalFormInput = z.input<typeof journalFormSchema>

/** "a, b, c" ↔ ["a","b","c"] (trimmed, case-insensitive dedup, max 20). */
export function parseTags(input: string): string[] {
  const keys = new Set<string>()
  const out: string[] = []
  for (const raw of input.split(',')) {
    const t = raw.trim()
    const k = t.toLowerCase()
    if (t && !keys.has(k)) {
      keys.add(k)
      out.push(t)
    }
  }
  return out.slice(0, 20)
}

/** Tags array → comma input value. */
export function formatTags(tags: string[] | null | undefined): string {
  return (tags ?? []).join(', ')
}
