import { Link } from 'react-router-dom'
import { Activity } from 'lucide-react'
import type { Event as SecurityEvent } from '@/types/database'
import { formatRelativeTime } from '@/lib/format-time'

const severityClass: Record<SecurityEvent['severity'], string> = {
  critical: 'bg-severity-critical text-white',
  high: 'bg-severity-high text-white',
  medium: 'bg-severity-medium text-black',
  low: 'bg-severity-low text-white',
  info: 'bg-severity-info text-white',
}

export function RecentEventsList({ events }: { events: SecurityEvent[] }) {
  return (
    <section className="border border-border-default bg-bg-secondary" aria-labelledby="recent-events-title">
      <header className="flex items-center justify-between border-b border-border-panel px-3 py-2">
        <h2 id="recent-events-title" className="text-sm font-semibold">Recent events</h2>
        <Link className="text-xs text-accent-primary hover:underline" to="/events">View all →</Link>
      </header>
      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-3 py-6 text-center"><Activity aria-hidden="true" className="size-5 text-text-tertiary" /><p className="text-sm text-text-secondary">No events in the last 24 hours.</p><Link className="text-xs text-accent-primary hover:underline" to="/events">Open event feed</Link></div>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id} className="flex min-w-0 items-center gap-2 border-b border-border-subtle px-3 py-2 last:border-b-0 hover:bg-bg-tertiary">
              <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${severityClass[event.severity]}`}>
                {event.severity}
              </span>
              <time className="w-16 shrink-0 font-mono text-[11px] text-text-tertiary" dateTime={event.event_time} title={new Date(event.event_time).toLocaleString()}>
                {formatRelativeTime(event.event_time)}
              </time>
              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{event.title}</span>
              {event.is_sample && <span className="shrink-0 font-mono text-[10px] text-text-tertiary">SAMPLE</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
