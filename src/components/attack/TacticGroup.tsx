import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatTacticName } from '@/lib/attack'
import type { BundledAttackTechnique } from '@/lib/attack'

export interface ObservedTechnique {
  technique: BundledAttackTechnique
  count: number
  events: Array<{ id: string; title: string; event_time: string }>
}

interface TacticGroupProps {
  tactic: string
  techniques: ObservedTechnique[]
  selectedId?: string
  onSelect: (technique: BundledAttackTechnique) => void
}

export function TacticGroup({ tactic, techniques, selectedId, onSelect }: TacticGroupProps) {
  const totalObservations = techniques.reduce((count, item) => count + item.count, 0)
  return (
    <details className="border-b border-border-panel" open>
      <summary className="sticky top-0 z-[1] flex cursor-pointer list-none items-center justify-between border-b border-border-subtle bg-bg-secondary px-3 py-2 text-sm font-semibold">
        <span className="flex items-center gap-2"><ChevronDown aria-hidden="true" className="size-4" />{formatTacticName(tactic)}</span>
        <span className="font-mono text-[10px] text-text-tertiary">{techniques.length} techniques · {totalObservations} events</span>
      </summary>
      <ul>
        {techniques.map(({ technique, count, events }) => {
          const selected = selectedId === technique.id
          return (
            <li className="border-b border-border-subtle" key={technique.id}>
              <button aria-expanded={selected} className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-bg-tertiary ${selected ? 'bg-bg-tertiary' : ''}`} onClick={() => onSelect(technique)} type="button">
                {selected ? <ChevronDown aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" /> : <ChevronRight aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" />}
                <span className="shrink-0 font-mono text-[10px] text-accent-primary">{technique.id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-text-primary">{technique.name}</span>
                  <span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-text-tertiary">{technique.description}</span>
                </span>
                <span className="shrink-0 rounded border border-border-default px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">{count}</span>
              </button>
              {selected && (
                <div className="space-y-3 border-t border-border-panel bg-bg-primary p-3 pl-9">
                  <p className="whitespace-pre-wrap text-xs leading-5 text-text-secondary">{technique.description || 'No description available.'}</p>
                  <a className="inline-flex items-center gap-1 text-xs text-accent-primary hover:underline" href={technique.url} rel="noreferrer" target="_blank">
                    Official MITRE page <ExternalLink aria-hidden="true" className="size-3" />
                  </a>
                  <div>
                    <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">Tagged events ({events.length})</h4>
                    {events.length === 0 ? <p className="text-xs text-text-tertiary">No events are associated with this technique.</p> : (
                      <ul className="space-y-1">
                        {events.map((event) => (
                          <li key={event.id}>
                            <Link className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-bg-tertiary" to={`/events?event=${encodeURIComponent(event.id)}`}>
                              <span className="truncate text-text-primary">{event.title}</span>
                              <time className="shrink-0 font-mono text-[10px] text-text-tertiary" dateTime={event.event_time}>{new Date(event.event_time).toLocaleDateString()}</time>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
