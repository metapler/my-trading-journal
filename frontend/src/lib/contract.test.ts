import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText, shortenContract } from './contract'

describe('shortenContract', () => {
  it('shortens EVM addresses with 0x-aware prefix', () => {
    expect(shortenContract('0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82')).toBe('0x3119…cf82')
  })

  it('shortens base58 addresses', () => {
    expect(shortenContract('So11111111111111111111111111111111111111112')).toBe('So11…1112')
  })

  it('leaves short values and nulls alone', () => {
    expect(shortenContract('SOL')).toBe('SOL')
    expect(shortenContract(null)).toBe('—')
    expect(shortenContract(undefined)).toBe('—')
  })
})

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await copyText('0xabc')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('0xabc')
  })

  it('returns false when no clipboard and no execCommand fallback', async () => {
    vi.stubGlobal('navigator', {})
    expect(await copyText('0xabc')).toBe(false)
  })
})
