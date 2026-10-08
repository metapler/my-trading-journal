import { describe, expect, it } from 'vitest'
import {
  formatDateTime,
  formatPercent,
  formatQty,
  formatRecovery,
  formatSignedPercent,
  formatSignedUsd,
  formatUsd,
  formatUsdCompact,
  pnlTone,
} from './format'

describe('formatUsd', () => {
  it('formats large values with 2 decimals', () => {
    expect(formatUsd('12482.42')).toBe('$12,482.42')
    expect(formatUsd(152.4)).toBe('$152.40')
  })

  it('uses adaptive precision for dust (never forced 2 decimals)', () => {
    expect(formatUsd('0.00001254')).toBe('$0.00001254')
    // sub-0.0001 bucket uses fixed 8 decimals for column alignment
    expect(formatUsd('0.000012')).toBe('$0.00001200')
    expect(formatUsd('0.014')).toBe('$0.0140')
    expect(formatUsd('0.60')).toBe('$0.6000')
  })

  it('renders null/invalid as neutral dash', () => {
    expect(formatUsd(null)).toBe('—')
    expect(formatUsd(undefined)).toBe('—')
    expect(formatUsd('abc')).toBe('—')
  })
})

describe('formatUsdCompact', () => {
  it('compacts millions and thousands', () => {
    expect(formatUsdCompact('1280000')).toBe('$1.28M')
    expect(formatUsdCompact('142520')).toBe('$142.52K')
    expect(formatUsdCompact('999')).toBe('$999.00')
  })
})

describe('signed + tone (never color-only)', () => {
  it('prefixes + / − explicitly', () => {
    expect(formatSignedUsd('842.12')).toBe('+$842.12')
    expect(formatSignedUsd('-22.5')).toBe('−$22.50')
    expect(formatSignedUsd('0')).toBe('$0.00')
    expect(formatSignedUsd(null)).toBe('—')
    expect(formatSignedPercent('7.234')).toBe('+7.23%')
    expect(formatSignedPercent('-20')).toBe('−20.00%')
    expect(formatSignedPercent(null)).toBe('—')
  })

  it('maps tone profit/loss/neutral', () => {
    expect(pnlTone('12.5')).toBe('profit')
    expect(pnlTone('-0.01')).toBe('loss')
    expect(pnlTone('0')).toBe('neutral')
    expect(pnlTone(null)).toBe('neutral')
  })

  it('recovery shows +N% or dash at/above BEP', () => {
    expect(formatRecovery('25')).toBe('+25.00%')
    expect(formatRecovery('0')).toBe('—')
    expect(formatRecovery(null)).toBe('—')
  })

  it('quantities keep adaptive decimals', () => {
    expect(formatQty('50000000')).toBe('50,000,000')
    expect(formatQty('1.5')).toBe('1.5')
    expect(formatQty(null)).toBe('—')
  })
})

describe('formatPercent (unsigned rates)', () => {
  it('formats without sign, null-safe', () => {
    expect(formatPercent('50')).toBe('50.00%')
    expect(formatPercent(7.234)).toBe('7.23%')
    expect(formatPercent('0')).toBe('0.00%')
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent('abc')).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('formats valid dates, dashes invalid', () => {
    expect(formatDateTime('2026-01-10T10:00:00.000Z')).not.toBe('—')
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime(undefined)).toBe('—')
    expect(formatDateTime('not-a-date')).toBe('—')
  })
})
