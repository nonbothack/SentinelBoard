import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { CommandBar } from '@/components/CommandBar'
import { TacticGroup, type ObservedTechnique } from '@/components/attack/TacticGroup'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { getAllTechniques } from '@/lib/attack'
import { supabase } from '@/lib/supabase'
import type { EventTechnique } from '@/types/database'

interface EventReference {
  id: string
  title: string
  event_time: string
}

interface ObservationLink extends EventTechnique {
  events: EventReference | null
}

export function AttackMapPage() {
  const [query, setQuery] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('technique') ?? undefined
  const { user } = useAuth()
  const links = useQuery({
    queryKey: ['attack-observations', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const observations: ObservationLink[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from('event_techniques')
          .select('id, event_id, technique_id, confidence, events!inner(id, title, event_time)')
          .neq('confidence', 'rejected')
          .order('id', { ascending: true })
          .range(offset, offset + 999)
        if (error) throw error
        const page = (data ?? []) as unknown as ObservationLink[]
        observations.push(...page)
        if (page.length < 1000) break
      }
      return observations
    },
  })

  const groups = useMemo(() => {
    const search = query.trim().toLowerCase()
    const observations = new Map<string, EventReference[]>()
    for (const link of links.data ?? []) {
      const event = link.events
      if (!event) continue
      const associated = observations.get(link.technique_id) ?? []
      associated.push(event)
      observations.set(link.technique_id, associated)
    }
    const observed: ObservedTechnique[] = getAllTechniques()
      .map((technique) => ({ technique, events: observations.get(technique.id) ?? [], count: (observations.get(technique.id) ?? []).length }))
      .filter((item) => item.count > 0 && (!search
        || item.technique.id.toLowerCase().includes(search)
        || item.technique.name.toLowerCase().includes(search)
        || item.technique.tactic.toLowerCase().includes(search)))
    const grouped = new Map<string, ObservedTechnique[]>()
    for (const item of observed) {
      const tactic = item.technique.tactic
      const group = grouped.get(tactic) ?? []
      group.push(item)
      grouped.set(tactic, group)
    }
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [links.data, query])

  const hasObserved = (links.data ?? []).some((link) => link.confidence !== 'rejected')
  const hasError = links.isError
  const loading = links.isPending

  function selectTechnique(techniqueId: string) {
    const nextParams = new URLSearchParams(searchParams)
    if (selectedId === techniqueId) nextParams.delete('technique')
    else nextParams.set('technique', techniqueId)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CommandBar
        ariaLabel="Search ATT&CK techniques by ID or name"
        onSubmit={setQuery}
        onValueChange={setQuery}
        placeholder="Search observed techniques by ID or name..."
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-[2] flex items-center justify-between border-b border-border-panel bg-bg-primary px-3 py-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-text-tertiary">Enterprise ATT&CK</p>
            <h1 className="text-sm font-semibold">Observed techniques</h1>
          </div>
          <Link className="text-xs text-accent-primary hover:underline" to="/events">Open event feed</Link>
        </header>

        {loading ? (
          <div className="space-y-3 p-3" aria-label="Loading observed techniques">
            {Array.from({ length: 5 }, (_, index) => <Skeleton className="h-20 w-full" key={index} />)}
          </div>
        ) : hasError ? (
          <div className="m-3 border-l-4 border-severity-critical bg-bg-secondary p-3 text-sm" role="alert">
            <p>ATT&CK observations could not be loaded.</p>
            <button className="mt-2 text-xs text-accent-primary underline" onClick={() => void links.refetch()} type="button">Retry</button>
          </div>
        ) : !hasObserved ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-2 p-6 text-center">
            <ShieldCheck aria-hidden="true" className="size-6 text-text-tertiary" />
            <p className="text-sm text-text-secondary">No techniques observed yet.</p>
            <p className="text-xs text-text-tertiary">Tag events with ATT&CK techniques from the Event Feed.</p>
            <Link className="mt-1 text-xs text-accent-primary hover:underline" to="/events">Go to Event Feed</Link>
          </div>
        ) : groups.length === 0 ? (
          <p className="p-6 text-center text-sm text-text-secondary">No observed techniques match this search.</p>
        ) : (
          <div>
            {groups.map(([tactic, techniques]) => (
              <TacticGroup key={tactic} onSelect={(technique) => selectTechnique(technique.id)} selectedId={selectedId} tactic={tactic} techniques={techniques} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
