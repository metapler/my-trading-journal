import { describe, expect, it } from 'vitest'
import { dcaFormSchema, toSimulatePayload } from './dcaForm'

describe('dcaFormSchema', () => {
  it('accepts capital + optional price/fee', () => {
    const r = dcaFormSchema.safeParse({ assetId: 'a1', additionalCapital: '200', buyPrice: '0.5', fee: '1' })
    expect(r.success).toBe(true)
  })

  it('accepts empty buyPrice (means use market) and empty fee defaults to 0', () => {
    const r = dcaFormSchema.safeParse({ assetId: 'a1', additionalCapital: '200', buyPrice: '', fee: '' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.fee).toBe('0')
  })

  it('rejects missing asset, zero/negative capital, negative fee', () => {
    expect(dcaFormSchema.safeParse({ assetId: '', additionalCapital: '200' }).success).toBe(false)
    expect(dcaFormSchema.safeParse({ assetId: 'a1', additionalCapital: '0' }).success).toBe(false)
    expect(dcaFormSchema.safeParse({ assetId: 'a1', additionalCapital: '-5' }).success).toBe(false)
    expect(dcaFormSchema.safeParse({ assetId: 'a1', additionalCapital: '200', fee: '-1' }).success).toBe(false)
    expect(dcaFormSchema.safeParse({ assetId: 'a1', additionalCapital: 'abc' }).success).toBe(false)
  })
})

describe('toSimulatePayload', () => {
  it('omits empty buyPrice so backend defaults to market', () => {
    expect(toSimulatePayload({ assetId: 'a1', additionalCapital: '200', buyPrice: '', fee: '0' })).toEqual({
      assetId: 'a1',
      additionalCapital: '200',
      fee: '0',
    })
    expect(
      toSimulatePayload({ assetId: 'a1', additionalCapital: '200', buyPrice: '0.5', fee: '' }),
    ).toEqual({ assetId: 'a1', additionalCapital: '200', buyPrice: '0.5', fee: '0' })
  })
})
