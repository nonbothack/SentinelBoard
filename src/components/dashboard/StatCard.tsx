import type { LucideIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface StatCardProps {
  label: string
  value?: number
  icon: LucideIcon
  loading?: boolean
  error?: boolean
}

export function StatCard({ label, value = 0, icon: Icon, loading = false, error = false }: StatCardProps) {
  return (
    <section className="flex min-h-[92px] min-w-0 items-center justify-between gap-3 border border-border-default bg-bg-secondary p-3" aria-label={label}>
      <div className="min-w-0">
        <p className="truncate text-xs text-text-secondary">{label}</p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-16" />
        ) : error ? (
          <p className="mt-1 font-mono text-2xl font-semibold text-text-tertiary" aria-label="Unavailable">—</p>
        ) : (
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-text-primary">{value.toLocaleString()}</p>
        )}
      </div>
      <Icon aria-hidden="true" className="size-5 shrink-0 text-text-tertiary" />
    </section>
  )
}
