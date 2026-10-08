import { useQuery } from '@tanstack/react-query'
import { getAssetPrice, getBatchPrices, type PriceResponse } from '../api/client'

/**
 * Phase 8 — polling infra. "Realtime" = periodic polling, never WebSocket.
 * PLAN §12: refetch 15–30s, refetchOnWindowFocus, manual refresh, and an
 * explicit stale indicator. Never renders "live".
 */

export const PRICE_REFETCH_MS = 20_000

export function useBatchPrices(assetIds: string[]) {
  const sorted = [...assetIds].sort()
  return useQuery({
    queryKey: ['prices', 'batch', sorted.join(',')],
    queryFn: ({ signal }) => getBatchPrices(sorted, signal),
    refetchInterval: PRICE_REFETCH_MS,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    enabled: sorted.length > 0,
    retry: 1,
  })
}

export function useAssetPrice(assetId: string | null) {
  return useQuery({
    queryKey: ['prices', 'asset', assetId],
    queryFn: ({ signal }) => getAssetPrice(assetId as string, signal),
    refetchInterval: PRICE_REFETCH_MS,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    enabled: assetId !== null && assetId.length > 0,
    retry: 1,
  })
}

export function formatUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return d.toLocaleTimeString()
}

export function priceStatusLabel(price: PriceResponse | null | undefined): 'fresh' | 'cached' | 'stale' | 'unavailable' {
  if (!price) return 'unavailable'
  if (price.stale) return 'stale'
  if (price.cached) return 'cached'
  return 'fresh'
}
