import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ApiError,
  createAsset,
  createTransaction,
  type CreateAssetPayload,
  type CreateTransactionPayload,
} from '../api/client'

/** Invalidation set per PLAN §14: asset, transactions, position, portfolio. */
export function useCreateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateAssetPayload) => createAsset(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assets'] })
      void qc.invalidateQueries({ queryKey: ['positions'] })
      void qc.invalidateQueries({ queryKey: ['portfolio'] })
      void qc.invalidateQueries({ queryKey: ['prices'] })
    },
  })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assetId, payload }: { assetId: string; payload: CreateTransactionPayload }) =>
      createTransaction(assetId, payload),
    onSuccess: (_tx, { assetId }) => {
      void qc.invalidateQueries({ queryKey: ['assets'] })
      void qc.invalidateQueries({ queryKey: ['transactions', assetId] })
      void qc.invalidateQueries({ queryKey: ['positions'] })
      void qc.invalidateQueries({ queryKey: ['position', assetId] })
      void qc.invalidateQueries({ queryKey: ['portfolio'] })
      void qc.invalidateQueries({ queryKey: ['prices'] })
    },
  })
}

/** Human message from ApiError (prefers backend message + code). */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.code ? `${err.message} (${err.code})` : err.message
  if (err instanceof Error) return err.message
  return fallback
}
