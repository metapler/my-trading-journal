import { useQuery } from '@tanstack/react-query'
import { getAsset, getAssets, getAssetTransactions, getPosition } from '../api/client'

export function useAssets() {
  return useQuery({
    queryKey: ['assets'],
    queryFn: ({ signal }) => getAssets(signal),
    staleTime: 30_000,
    retry: 1,
  })
}

export function useAsset(assetId: string | null) {
  return useQuery({
    queryKey: ['assets', assetId],
    queryFn: ({ signal }) => getAsset(assetId as string, signal),
    enabled: assetId !== null && assetId.length > 0,
    staleTime: 30_000,
    retry: 1,
  })
}

export function useAssetPosition(assetId: string | null) {
  return useQuery({
    queryKey: ['position', assetId],
    queryFn: ({ signal }) => getPosition(assetId as string, signal),
    enabled: assetId !== null && assetId.length > 0,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    retry: 1,
  })
}

export function useAssetTransactions(assetId: string | null) {
  return useQuery({
    queryKey: ['transactions', assetId],
    queryFn: ({ signal }) => getAssetTransactions(assetId as string, signal),
    enabled: assetId !== null && assetId.length > 0,
    staleTime: 10_000,
    retry: 1,
  })
}
