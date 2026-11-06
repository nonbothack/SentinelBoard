import { Activity } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelativeTime } from '@/lib/format-time'
import type { IncidentActivity } from '@/types/database'

const actionDescriptions: Record<string, (details: Record<string, unknown>) => string> = {
  incident_created: (details) => `Created incident “${String(details.title ?? 'incident')}”`,
  incident_updated: (details) => `Updated incident details${Array.isArray(details.changed_fields) ? ` (${details.changed_fields.join(', ')})` : ''}`,
  status_changed: (details) => `Changed status from ${String(details.from ?? 'unknown')} to ${String(details.to ?? 'unknown')}`,
  ioc_attached: (details) => `Attached IOC ${String(details.value ?? '')}`,
  event_attached: (details) => `Attached event “${String(details.title ?? 'event')}”`,
}

interface IncidentTimelineProps {
  entries: IncidentActivity[]
  loading: boolean
  error: boolean
  onRetry: () => void
}

export function IncidentTimeline({ entries, loading, error, onRetry }: IncidentTimelineProps) {
  if (loading) return <div className="space-y-3 p-4" aria-label="Loading incident timeline">{Array.from({ length: 3 }, (_, index) => <Skeleton className="h-14 w-full" key={index} />)}</div>
  if (error) return <div className="m-4 border-l-4 border-severity-critical bg-bg-secondary p-3 text-sm" role="alert"><p>Activity history could not be loaded.</p><button className="mt-2 text-xs text-accent-primary underline" onClick={onRetry} type="button">Retry</button></div>
  if (entries.length === 0) return <div className="flex flex-col items-center gap-2 p-8 text-center"><Activity aria-hidden="true" className="size-5 text-text-tertiary" /><p className="text-sm text-text-secondary">No activity recorded yet.</p></div>

  return (
    <ol className="space-y-0 p-4" aria-label="Incident activity timeline">
      {entries.map((entry) => {
        const details = entry.details && typeof entry.details === 'object' && !Array.isArray(entry.details) ? entry.details as Record<string, unknown> : {}
        const describe = actionDescriptions[entry.action]
        return (
          <li className="relative border-l border-border-default pb-5 pl-4 last:border-transparent last:pb-0" key={entry.id}>
            <span aria-hidden="true" className="absolute -left-1 top-1 size-2 rounded-full bg-accent-primary" />
            <p className="text-sm text-text-primary">{describe ? describe(details) : `Recorded activity: ${entry.action.replaceAll('_', ' ')}`}</p>
            <time className="mt-1 block font-mono text-[10px] text-text-tertiary" dateTime={entry.created_at} title={new Date(entry.created_at).toLocaleString()}>{formatRelativeTime(entry.created_at)}</time>
          </li>
        )
      })}
    </ol>
  )
}
