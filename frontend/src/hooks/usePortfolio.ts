import { useQuery } from '@tanstack/react-query'
import { getAnalytics, getPortfolioSummary, getPositions } from '../api/client'
import { PRICE_REFETCH_MS } from './usePrices'

const baseOptions = {
  refetchInterval: PRICE_REFETCH_MS,
  refetchOnWindowFocus: true,
  staleTime: 10_000,
  retry: 1,
} as const

export function usePortfolioSummary() {
  return useQuery({
    queryKey: ['portfolio', 'summary'],
    queryFn: ({ signal }) => getPortfolioSummary(signal),
    ...baseOptions,
  })
}

export function usePositions() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: ({ signal }) => getPositions(signal),
    ...baseOptions,
  })
}

export function useAnalytics() {
  return useQuery({
    queryKey: ['portfolio', 'analytics'],
    queryFn: ({ signal }) => getAnalytics(signal),
    ...baseOptions,
  })
}
