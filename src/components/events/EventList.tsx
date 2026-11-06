import type { ReactNode } from 'react'
import { Clock3, Search } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelativeTime } from '@/lib/format-time'
import type { Event, Severity } from '@/types/database'

const severityColors: Record<Severity, string> = {
  critical: 'bg-severity-critical',
  high: 'bg-severity-high',
  medium: 'bg-severity-medium',
  low: 'bg-severity-low',
  info: 'bg-severity-info',
}

interface EventListProps {
  events: Event[]
  selectedId?: string
  loading: boolean
  error: boolean
  onSelect: (event: Event) => void
  onRetry: () => void
  headerAction?: ReactNode
  emptyMessage?: string
}

export function EventList({ events, selectedId, loading, error, onSelect, onRetry, headerAction, emptyMessage = 'No security events yet.' }: EventListProps) {
  return (
    <section aria-labelledby="event-list-title">
      <header className="sticky top-0 z-[1] flex items-center justify-between border-b border-border-panel bg-bg-surface px-3 py-2">
        <h2 id="event-list-title" className="text-sm font-semibold">Security events</h2>
        <div className="flex items-center gap-2">{headerAction}<span className="font-mono text-xs text-text-tertiary">{events.length}</span></div>
      </header>
      {loading ? (
        <div className="space-y-2 p-3" aria-label="Loading security events">
          {Array.from({ length: 7 }, (_, index) => <Skeleton className="h-16 w-full" key={index} />)}
        </div>
      ) : error ? (
        <div className="m-3 border-l-4 border-severity-critical bg-bg-secondary p-3 text-sm" role="alert">
          <p>Events could not be loaded.</p>
          <button className="mt-2 text-xs text-accent-primary underline" onClick={onRetry} type="button">Retry</button>
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center">
          <Search aria-hidden="true" className="size-5 text-text-tertiary" />
          <p className="text-sm text-text-secondary">{emptyMessage}</p>
          <p className="text-xs text-text-tertiary">Import a JSON event file or load the labeled sample dataset.</p>
        </div>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id}>
              <button
                aria-current={event.id === selectedId ? 'true' : undefined}
                className={`flex w-full items-start gap-3 border-b border-border-subtle px-3 py-2 text-left hover:bg-bg-tertiary ${event.id === selectedId ? 'bg-bg-tertiary' : ''}`}
                onClick={() => onSelect(event)}
                type="button"
              >
                <span aria-label={event.severity} className={`mt-0.5 h-10 w-1 shrink-0 rounded-sm ${severityColors[event.severity]}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium text-text-primary">{event.title}</span>
                    {event.is_sample && <span className="shrink-0 rounded border border-border-default px-1 py-0.5 text-[9px] uppercase tracking-wide text-text-tertiary">Sample data</span>}
                    {Date.parse(event.event_time) > Date.parse(event.created_at) && <Clock3 aria-label="Future event timestamp" className="size-3 shrink-0 text-severity-medium" />}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-[10px] text-text-tertiary">
                    <span className="font-mono">{formatRelativeTime(event.event_time)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{event.source.replaceAll('_', ' ')}</span>
                    {event.category && <><span aria-hidden="true">·</span><span>{event.category}</span></>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
