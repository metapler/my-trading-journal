import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getJournal, listJournals, putJournal, type UpsertJournalPayload } from '../api/client'

export function useJournal(assetId: string | null) {
  return useQuery({
    queryKey: ['journal', assetId],
    queryFn: ({ signal }) => getJournal(assetId as string, signal),
    enabled: assetId !== null && assetId.length > 0,
    staleTime: 30_000,
    retry: 1,
  })
}

export function useJournals() {
  return useQuery({
    queryKey: ['journals'],
    queryFn: ({ signal }) => listJournals(signal),
    staleTime: 30_000,
    retry: 1,
  })
}

export function useUpsertJournal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assetId, payload }: { assetId: string; payload: UpsertJournalPayload }) =>
      putJournal(assetId, payload),
    onSuccess: (_journal, { assetId }) => {
      void qc.invalidateQueries({ queryKey: ['journal', assetId] })
      void qc.invalidateQueries({ queryKey: ['journals'] })
    },
  })
}
