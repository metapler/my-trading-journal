import { useQuery } from '@tanstack/react-query'
import { getPortfolioHistory, type HistoryRange } from '../api/client'

export const HISTORY_RANGES: HistoryRange[] = ['24h', '7d', '30d', '90d', 'all']

/** Snapshot cadence is 5 min — history refetches on that rhythm, not per poll. */
export const HISTORY_REFETCH_MS = 5 * 60_000

/**
 * Observed portfolio history (REDESIGN §9.3/§14). Query key includes range so
 * a late response for a previous range never replaces the active view.
 */
export function usePortfolioHistory(range: HistoryRange) {
  return useQuery({
    queryKey: ['portfolio', 'history', range],
    queryFn: ({ signal }) => getPortfolioHistory(range, signal),
    refetchInterval: HISTORY_REFETCH_MS,
    refetchOnWindowFocus: true,
    staleTime: 4 * 60_000,
    retry: 1,
  })
}
