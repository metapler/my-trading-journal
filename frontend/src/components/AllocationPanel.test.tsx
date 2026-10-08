import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { Position } from '../api/client'
import { allocationSlices } from '../lib/allocation'
import { AllocationPanel } from './AllocationPanel'

function pos(assetId: string, symbol: string, currentValue: string | null): Position {
  return {
    assetId,
    symbol,
    name: symbol,
    chain: 'solana',
    status: 'ACTIVE',
    remainingQuantity: '1',
    averageBuy: '1',
    remainingCostBasis: '1',
    realizedPnL: '0',
    currentPrice: '1',
    currentValue,
    unrealizedPnL: '0',
    unrealizedPnLPercent: '0',
    bepPrice: '1',
    recoveryToBepPercent: '0',
    priceSource: 'stub',
    priceFetchedAt: null,
    priceStale: false,
    priceCached: false,
  }
}

describe('allocationSlices', () => {
  it('weights top-5 + Others over priced value; unpriced excluded and counted', () => {
    const positions = [
      pos('a', 'A', '500'),
      pos('b', 'B', '300'),
      pos('c', 'C', '100'),
      pos('d', 'D', '50'),
      pos('e', 'E', '30'),
      pos('f', 'F', '20'),
      pos('g', 'G', null),
    ]
    const { slices, total, unpriced } = allocationSlices(positions)
    expect(total).toBe(1000)
    expect(unpriced).toBe(1)
    expect(slices).toHaveLength(6)
    expect(slices[0].symbol).toBe('A')
    expect(slices[0].weight).toBe(50)
    expect(slices[5].symbol).toBe('Others (1)')
  })

  it('uses neutral colors (never profit/loss semantics)', () => {
    const { slices } = allocationSlices([pos('a', 'A', '100')])
    expect(slices[0].color).not.toMatch(/2ee59d|ff5c7a|emerald|red/i)
  })
})

describe('AllocationPanel', () => {
  it('labels partial coverage with unpriced count', () => {
    render(
      <MemoryRouter>
        <AllocationPanel positions={[pos('a', 'A', '100'), pos('g', 'G', null)]} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/1 belum terhitung/)).toBeInTheDocument()
  })
})
