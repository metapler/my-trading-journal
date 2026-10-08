import { useQuery } from '@tanstack/react-query'
import { searchAssets } from '../api/client'
import { useDebouncedValue } from './useDebouncedValue'

/** Debounced backend search. Disabled until the debounced query is non-empty. */
export function useAssetSearch(query: string) {
  const debounced = useDebouncedValue(query.trim())
  return useQuery({
    queryKey: ['assets', 'search', debounced],
    queryFn: ({ signal }) => searchAssets(debounced, signal),
    enabled: debounced.length > 0,
    staleTime: 60_000,
    retry: 1,
  })
}
