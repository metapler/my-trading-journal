import { describe, expect, it } from 'vitest'
import { calcTxTotal, nowLocalInput, toIsoString, txFormSchema } from './txForm'

describe('calcTxTotal', () => {
  it('BUY total = qty × price + fee', () => {
    expect(calcTxTotal({ type: 'BUY', quantity: '100', pricePerToken: '1', fee: '0.5' })).toEqual({
      total: 100.5,
      label: 'Total',
    })
  })

  it('SELL proceeds = qty × price − fee', () => {
    expect(calcTxTotal({ type: 'SELL', quantity: '50', pricePerToken: '2', fee: '5' })).toEqual({
      total: 95,
      label: 'Estimated proceeds',
    })
  })

  it('returns null total for invalid inputs', () => {
    expect(calcTxTotal({ type: 'BUY', quantity: 'abc', pricePerToken: '1' }).total).toBeNull()
    expect(calcTxTotal({ type: 'BUY', quantity: '0', pricePerToken: '1' }).total).toBeNull()
    expect(calcTxTotal({ type: 'BUY', quantity: '1', pricePerToken: '-1' }).total).toBeNull()
    expect(calcTxTotal({ type: 'BUY', quantity: '1', pricePerToken: '1', fee: '-1' }).total).toBeNull()
  })
})

describe('toIsoString', () => {
  it('converts datetime-local to ISO', () => {
    const iso = toIsoString('2026-01-10T10:00')
    expect(iso).toMatch(/2026-01-10T/)
    expect(new Date(iso as string).getTime()).not.toBeNaN()
  })

  it('returns null for empty/invalid', () => {
    expect(toIsoString('')).toBeNull()
    expect(toIsoString('not-a-date')).toBeNull()
  })
})

describe('nowLocalInput', () => {
  it('produces a valid datetime-local string', () => {
    expect(nowLocalInput()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })
})

describe('txFormSchema', () => {
  it('accepts a valid BUY form', () => {
    const r = txFormSchema.safeParse({
      type: 'BUY',
      quantity: '100',
      pricePerToken: '1.5',
      fee: '0.5',
      executedAt: '2026-01-10T10:00',
      note: 'first buy',
    })
    expect(r.success).toBe(true)
  })

  it('rejects zero quantity, negative price, negative fee', () => {
    const base = { type: 'BUY', quantity: '1', pricePerToken: '1', fee: '0', executedAt: '2026-01-10T10:00', note: '' }
    expect(txFormSchema.safeParse({ ...base, quantity: '0' }).success).toBe(false)
    expect(txFormSchema.safeParse({ ...base, pricePerToken: '-1' }).success).toBe(false)
    expect(txFormSchema.safeParse({ ...base, fee: '-1' }).success).toBe(false)
  })

  it('rejects non-numeric and empty fields', () => {
    const base = { type: 'BUY', quantity: '1', pricePerToken: '1', fee: '0', executedAt: '2026-01-10T10:00', note: '' }
    expect(txFormSchema.safeParse({ ...base, quantity: '' }).success).toBe(false)
    expect(txFormSchema.safeParse({ ...base, quantity: 'abc' }).success).toBe(false)
    expect(txFormSchema.safeParse({ ...base, executedAt: '' }).success).toBe(false)
  })

  it('rejects invalid type and overlong note', () => {
    const r = txFormSchema.safeParse({
      type: 'DCA',
      quantity: '1',
      pricePerToken: '1',
      fee: '0',
      executedAt: '2026-01-10T10:00',
      note: 'x'.repeat(2001),
    })
    expect(r.success).toBe(false)
  })
})
