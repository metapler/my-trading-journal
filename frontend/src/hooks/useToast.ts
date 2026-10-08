import { createContext, useCallback, useContext, useMemo, useState } from 'react'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastContextValue {
  notify: (kind: ToastKind, message: string) => void
}

export const ToastContext = createContext<ToastContextValue>({ notify: () => undefined })

let nextId = 1

export function useToastStore(): { items: ToastItem[]; notify: ToastContextValue['notify'] } {
  const [items, setItems] = useState<ToastItem[]>([])

  const notify = useCallback<ToastContextValue['notify']>((kind, message) => {
    const id = nextId++
    setItems((prev) => [...prev.slice(-3), { id, kind, message }])
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  }, [])

  return { items, notify }
}

export function useToastNotifyValue(notify: ToastContextValue['notify']): ToastContextValue {
  return useMemo(() => ({ notify }), [notify])
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext)
}
