import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listWatchlist,
  putWatchlist,
  removeWatchlist,
  type UpsertWatchlistPayload,
} from '../api/client'
import { PRICE_REFETCH_MS } from './usePrices'

export function useWatchlist() {
  return useQuery({
    queryKey: ['watchlist'],
    queryFn: ({ signal }) => listWatchlist(signal),
    refetchInterval: PRICE_REFETCH_MS,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    retry: 1,
  })
}

export function useUpsertWatchlist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assetId, payload }: { assetId: string; payload: UpsertWatchlistPayload }) =>
      putWatchlist(assetId, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['watchlist'] })
      void qc.invalidateQueries({ queryKey: ['assets'] })
      void qc.invalidateQueries({ queryKey: ['positions'] })
    },
  })
}

export function useRemoveWatchlist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assetId: string) => removeWatchlist(assetId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['watchlist'] })
      void qc.invalidateQueries({ queryKey: ['assets'] })
      void qc.invalidateQueries({ queryKey: ['positions'] })
    },
  })
}
