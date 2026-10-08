import { PageHeader } from '../components/ui/PageHeader'

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-w-0 space-y-5">
      <PageHeader title={title} description={description} />
      <div className="rounded-[var(--radius-panel)] border border-dashed border-[var(--border)] p-6 text-sm text-[var(--text-secondary)]">Coming soon — route exists, no broken page.</div>
    </div>
  )
}
