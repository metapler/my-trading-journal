import type { Transaction } from '../api/client'
import { formatDateTime, formatQty, formatUsd } from '../lib/format'
import { cn } from '../lib/cn'

/**
 * Shared ledger table (PLAN §15 + §14): Date / Type / Price / Quantity /
 * Fee / Value. Value = total cost for BUY (gross + fee), net proceeds for
 * SELL (gross − fee). Type badge carries direction — value stays unsigned.
 */
export function TransactionsTable({ transactions }: { transactions: Transaction[] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-control)] border border-[var(--border)]" role="region" aria-label="Transactions table" tabIndex={0}>
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)]">
            <th scope="col" className="px-3 py-2 font-medium">Date</th>
            <th scope="col" className="px-3 py-2 font-medium">Type</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Price</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Quantity</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Fee</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => {
            const qty = Number(t.quantity)
            const price = Number(t.pricePerToken)
            const fee = Number(t.fee)
            const gross = qty * price
            const value = t.type === 'SELL' ? gross - fee : gross + fee
            return (
              <tr key={t.id} className="border-b border-[var(--border)] tabular-nums last:border-0">
                <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                  {formatDateTime(t.executedAt)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                      t.type === 'BUY'
                        ? 'border-emerald-800 bg-emerald-950 text-emerald-300'
                        : 'border-red-800 bg-red-950 text-red-300',
                    )}
                  >
                    {t.type}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-[var(--text)]">{formatUsd(t.pricePerToken)}</td>
                <td className="px-3 py-2 text-right text-[var(--text)]">{formatQty(t.quantity)}</td>
                <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{formatUsd(t.fee)}</td>
                <td
                  className="px-3 py-2 text-right text-[var(--text)]"
                  title={t.type === 'SELL' ? 'Net proceeds (gross − fee)' : 'Total cost (gross + fee)'}
                >
                  {formatUsd(value)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
