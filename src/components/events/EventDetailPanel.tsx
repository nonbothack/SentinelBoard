import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { TechniqueTagButton } from '@/components/events/TechniqueTagButton'
import { SeverityBadge } from '@/components/ioc/SeverityBadge'
import { useAuth } from '@/contexts/AuthContext'
import { formatRelativeTime } from '@/lib/format-time'
import { Skeleton } from '@/components/ui/skeleton'
import { getTechniqueById } from '@/lib/attack'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/types/database'

interface EventTechniqueTag {
  id: string
  technique_id: string
  confidence: string
}

export function EventDetailPanel({ event }: { event: Event }) {
  const [rawExpanded, setRawExpanded] = useState(false)
  const { user } = useAuth()
  const techniqueLinks = useQuery({
    queryKey: ['event-techniques', event.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_techniques')
        .select('id, technique_id, confidence')
        .eq('event_id', event.id)
        .neq('confidence', 'rejected')
      if (error) throw error
      return (data ?? []) as EventTechniqueTag[]
    },
  })
  const taggedTechniques = (techniqueLinks.data ?? [])
    .map((link) => ({ link, technique: getTechniqueById(link.technique_id) }))
    .filter((item): item is { link: EventTechniqueTag; technique: NonNullable<ReturnType<typeof getTechniqueById>> } => Boolean(item.technique))

  return (
    <article className="space-y-4 p-3" aria-labelledby="event-detail-title">
      <header className="space-y-2 border-b border-border-panel pb-3">
        {event.is_sample && <span className="inline-flex rounded border border-border-default px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">SAMPLE DATA · fictional telemetry</span>}
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={event.severity} />
          <span className="rounded border border-border-default px-2 py-0.5 text-xs text-text-secondary">{event.source.replaceAll('_', ' ')}</span>
          {event.category && <span className="text-xs text-text-tertiary">{event.category}</span>}
        </div>
        <h2 id="event-detail-title" className="text-base font-semibold">{event.title}</h2>
        <p className="font-mono text-xs text-text-tertiary" title={new Date(event.event_time).toLocaleString()}>{formatRelativeTime(event.event_time)}</p>
      </header>

      {event.description && <p className="whitespace-pre-wrap text-sm leading-6 text-text-secondary">{event.description}</p>}

      <dl className="grid gap-3 sm:grid-cols-2">
        {event.source_ip && <div><dt className="text-[10px] uppercase tracking-wide text-text-tertiary">Source IP</dt><dd className="mt-1 break-all font-mono text-xs">{event.source_ip}</dd></div>}
        {event.dest_ip && <div><dt className="text-[10px] uppercase tracking-wide text-text-tertiary">Destination IP</dt><dd className="mt-1 break-all font-mono text-xs">{event.dest_ip}</dd></div>}
        {event.hostname && <div><dt className="text-[10px] uppercase tracking-wide text-text-tertiary">Hostname</dt><dd className="mt-1 break-all font-mono text-xs">{event.hostname}</dd></div>}
      </dl>

      <section className="space-y-2 border-t border-border-panel pt-3" aria-labelledby="event-techniques-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="event-techniques-title" className="text-xs font-semibold uppercase tracking-wide text-text-secondary">ATT&CK techniques</h3>
          <TechniqueTagButton eventId={event.id} />
        </div>
        {techniqueLinks.isPending ? (
          <div className="space-y-2" aria-label="Loading technique tags"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-2/3" /></div>
        ) : techniqueLinks.isError ? (
          <div className="border-l-4 border-severity-critical bg-bg-secondary p-2 text-xs" role="alert"><p>Technique tags could not be loaded.</p><button className="mt-1 text-accent-primary underline" onClick={() => void techniqueLinks.refetch()} type="button">Retry</button></div>
        ) : taggedTechniques.length === 0 ? (
          <p className="text-xs text-text-tertiary">No techniques tagged.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {taggedTechniques.map(({ link, technique }) => (
              <li key={link.id}>
                <Link className="inline-flex items-center gap-1 rounded border border-border-default bg-bg-tertiary px-2 py-1 text-[10px] hover:border-border-focus" to={`/attack?technique=${encodeURIComponent(technique.id)}`}>
                  <span className="font-mono text-accent-primary">{technique.id}</span>
                  <span className="text-text-secondary">{technique.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-border-default bg-bg-secondary">
        <button aria-expanded={rawExpanded} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-secondary hover:text-text-primary" onClick={() => setRawExpanded((expanded) => !expanded)} type="button">
          {rawExpanded ? <ChevronDown aria-hidden="true" className="size-4" /> : <ChevronRight aria-hidden="true" className="size-4" />}
          Raw event data
        </button>
        {rawExpanded && <pre className="max-h-80 overflow-auto border-t border-border-subtle p-3 font-mono text-[10px] text-text-secondary">{JSON.stringify(event.raw_data, null, 2)}</pre>}
      </section>
    </article>
  )
}
