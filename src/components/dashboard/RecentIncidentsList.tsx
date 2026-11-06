import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import type { Incident } from '@/types/database'
import { formatRelativeTime } from '@/lib/format-time'

const severityClass: Record<Incident['severity'], string> = {
  critical: 'text-severity-critical',
  high: 'text-severity-high',
  medium: 'text-severity-medium',
  low: 'text-severity-low',
}

const statusClass: Record<Incident['status'], string> = {
  open: 'border-severity-high text-severity-high',
  investigating: 'border-severity-medium text-severity-medium',
  contained: 'border-severity-low text-severity-low',
  resolved: 'border-status-success text-status-success',
  closed: 'border-border-default text-text-tertiary',
}

export function RecentIncidentsList({ incidents }: { incidents: Incident[] }) {
  return (
    <section className="border border-border-default bg-bg-secondary" aria-labelledby="recent-incidents-title">
      <header className="flex items-center justify-between border-b border-border-panel px-3 py-2">
        <h2 id="recent-incidents-title" className="text-sm font-semibold">Recent incidents</h2>
        <Link className="text-xs text-accent-primary hover:underline" to="/incidents">View all →</Link>
      </header>
      {incidents.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-3 py-6 text-center"><ShieldAlert aria-hidden="true" className="size-5 text-text-tertiary" /><p className="text-sm text-text-secondary">No incidents yet.</p><Link className="text-xs text-accent-primary hover:underline" to="/incidents">Create an incident</Link></div>
      ) : (
        <ul>
          {incidents.map((incident) => (
            <li key={incident.id} className="flex min-w-0 items-center gap-2 border-b border-border-subtle px-3 py-2 last:border-b-0 hover:bg-bg-tertiary">
              <span aria-label={`${incident.severity} severity`} className={`size-2 shrink-0 rounded-full ${severityClass[incident.severity].replace('text-', 'bg-')}`} />
              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{incident.title}</span>
              <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] capitalize ${statusClass[incident.status]}`}>{incident.status}</span>
              <time className="hidden shrink-0 font-mono text-[10px] text-text-tertiary md:block" dateTime={incident.updated_at} title={new Date(incident.updated_at).toLocaleString()}>
                {formatRelativeTime(incident.updated_at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
