import { describe, expect, it } from 'vitest'
import { formatTags, journalFormSchema, parseTags } from './journalForm'

describe('parseTags', () => {
  it('splits, trims, dedupes case-insensitively, caps at 20', () => {
    expect(parseTags('L1, core, L1,  CORE ')).toEqual(['L1', 'core'])
    expect(parseTags('')).toEqual([])
    expect(parseTags(' , , ')).toEqual([])
    const many = Array.from({ length: 25 }, (_, i) => `t${i}`).join(',')
    expect(parseTags(many)).toHaveLength(20)
  })
})

describe('formatTags', () => {
  it('joins with commas, handles nulls', () => {
    expect(formatTags(['a', 'b'])).toBe('a, b')
    expect(formatTags(null)).toBe('')
    expect(formatTags(undefined)).toBe('')
  })
})

describe('journalFormSchema', () => {
  it('accepts empty form (all fields optional)', () => {
    const r = journalFormSchema.safeParse({})
    expect(r.success).toBe(true)
  })

  it('normalizes empty/whitespace strings to null', () => {
    const r = journalFormSchema.safeParse({ thesis: '', strategy: '  ' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.thesis).toBeNull()
      expect(r.data.strategy).toBeNull()
    }
  })

  it('rejects overlong fields', () => {
    expect(journalFormSchema.safeParse({ thesis: 'x'.repeat(5001) }).success).toBe(false)
    expect(journalFormSchema.safeParse({ riskLevel: 'x'.repeat(51) }).success).toBe(false)
    expect(journalFormSchema.safeParse({ tagsInput: 'x'.repeat(501) }).success).toBe(false)
  })
})
