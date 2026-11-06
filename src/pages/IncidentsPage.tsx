import { useMemo, useState } from 'react'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CommandBar } from '@/components/CommandBar'
import { CreateIncidentDialog } from '@/components/incidents/CreateIncidentDialog'
import { IncidentDetailPage } from '@/pages/IncidentDetailPage'
import { SplitPane } from '@/components/SplitPane'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { formatRelativeTime } from '@/lib/format-time'
import { supabase } from '@/lib/supabase'
import type { Incident } from '@/types/database'
import { incidentStatusBadgeClass, type IncidentStatus } from '@/lib/incidents'

const statusFilters: Array<'all' | IncidentStatus> = ['all', 'open', 'investigating', 'contained', 'resolved', 'closed']
type IncidentCounts = Record<string, { iocs: number; events: number }>

export function IncidentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<'all' | IncidentStatus>('all')
  const [keyword, setKeyword] = useState('')
  const [notice, setNotice] = useState('')
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const incidents = useQuery({
    queryKey: ['incidents', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from('incidents').select('*').order('updated_at', { ascending: false }).limit(500)
      if (error) throw error
      return (data ?? []) as Incident[]
    },
  })
  const counts = useQuery({
    queryKey: ['incident-counts', user?.id, incidents.data?.map((item) => item.id).join(',')],
    enabled: Boolean(user && incidents.data?.length),
    queryFn: async () => {
      const ids = (incidents.data ?? []).map((item) => item.id)
      const [iocs, events] = await Promise.all([
        supabase.from('incident_iocs').select('incident_id').in('incident_id', ids),
        supabase.from('incident_events').select('incident_id').in('incident_id', ids),
      ])
      if (iocs.error || events.error) throw new Error('Incident association counts could not be loaded.')
      const result: IncidentCounts = Object.fromEntries(ids.map((id) => [id, { iocs: 0, events: 0 }]))
      for (const row of iocs.data ?? []) result[row.incident_id].iocs += 1
      for (const row of events.data ?? []) result[row.incident_id].events += 1
      return result
    },
  })

  const selectedId = searchParams.get('incident')
  const selectedIncident = incidents.data?.find((item) => item.id === selectedId) ?? null
  const visibleIncidents = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return (incidents.data ?? []).filter((incident) => (statusFilter === 'all' || incident.status === statusFilter)
      && (!query || `${incident.title} ${incident.description ?? ''} ${incident.status} ${incident.severity}`.toLowerCase().includes(query)))
  }, [incidents.data, keyword, statusFilter])

  function updateIncident(updated: Incident) {
    queryClient.setQueryData<Incident[]>(['incidents', user?.id], (previous = []) => previous.map((item) => item.id === updated.id ? updated : item).sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at)))
    void queryClient.invalidateQueries({ queryKey: ['dashboard', user?.id] })
  }

  function selectIncident(incident: Incident) {
    const params = new URLSearchParams(searchParams)
    params.set('incident', incident.id)
    setSearchParams(params, { replace: true })
  }

  function onCreated(incident: Incident, activityNotice?: string) {
    queryClient.setQueryData<Incident[]>(['incidents', user?.id], (previous = []) => [incident, ...previous])
    setNotice(activityNotice ?? '')
    const params = new URLSearchParams(searchParams)
    params.set('incident', incident.id)
    setSearchParams(params, { replace: true })
    void queryClient.invalidateQueries({ queryKey: ['incident-counts', user?.id] })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CommandBar ariaLabel="Search incidents" onSubmit={setKeyword} onValueChange={setKeyword} placeholder="Search incidents..." />
      <nav aria-label="Filter incidents by status" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border-panel bg-bg-surface px-3 py-2">
        {statusFilters.map((status) => <button aria-pressed={statusFilter === status} className={`rounded px-2.5 py-1 text-xs capitalize ${statusFilter === status ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary'}`} key={status} onClick={() => setStatusFilter(status)} type="button">{status}</button>)}
      </nav>
      {notice && <p className="border-b border-border-panel border-l-4 border-severity-medium bg-bg-secondary px-3 py-2 text-xs" role="status">{notice}</p>}
      <SplitPane
        leftWidth={350}
        leftContent={(
          <section aria-labelledby="incidents-heading">
            <header className="sticky top-0 z-[1] flex items-center justify-between gap-2 border-b border-border-panel bg-bg-surface px-3 py-2">
              <h1 className="text-sm font-semibold" id="incidents-heading">Incidents</h1>
              <CreateIncidentDialog onCreated={onCreated} />
            </header>
            {incidents.isPending ? <div className="space-y-2 p-3" aria-label="Loading incidents">{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-16 w-full" key={index} />)}</div> : incidents.isError ? (
              <div className="m-3 border-l-4 border-severity-critical bg-bg-secondary p-3 text-sm" role="alert"><p>Incidents could not be loaded.</p><button className="mt-2 text-xs text-accent-primary underline" onClick={() => void incidents.refetch()} type="button">Retry</button></div>
            ) : visibleIncidents.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center"><ShieldAlert aria-hidden="true" className="size-5 text-text-tertiary" /><p className="text-sm text-text-secondary">{incidents.data?.length ? 'No incidents match these filters.' : 'No incidents yet.'}</p><p className="text-xs text-text-tertiary">Create an incident to track an investigation and attach related evidence.</p></div>
            ) : (
              <ul>{visibleIncidents.map((incident) => {
                const severityClass: Record<string, string> = { critical: 'border-l-severity-critical', high: 'border-l-severity-high', medium: 'border-l-severity-medium', low: 'border-l-severity-low' }
                const itemCounts = counts.data?.[incident.id] ?? { iocs: 0, events: 0 }
                return <li className="border-b border-border-subtle" key={incident.id}><button aria-current={selectedIncident?.id === incident.id ? 'true' : undefined} className={`w-full border-l-2 px-3 py-3 text-left hover:bg-bg-tertiary ${severityClass[incident.severity] ?? 'border-l-border-default'} ${selectedIncident?.id === incident.id ? 'bg-bg-tertiary' : ''}`} onClick={() => selectIncident(incident)} type="button"><span className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-xs font-medium text-text-primary">{incident.title}</span><Badge variant="outline" className={`shrink-0 capitalize ${incidentStatusBadgeClass[incident.status]}`}>{incident.status}</Badge></span><span className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[10px] text-text-tertiary"><span className="capitalize">{incident.severity}</span><span className="font-mono">{formatRelativeTime(incident.created_at)}</span></span><span className="mt-1 flex gap-3 text-[10px] text-text-secondary"><span>{counts.isPending ? <Skeleton className="inline-block h-3 w-10 align-middle" /> : itemCounts.iocs} IOCs</span><span>{counts.isPending ? <Skeleton className="inline-block h-3 w-10 align-middle" /> : itemCounts.events} events</span></span></button></li>
              })}</ul>
            )}
            {counts.isError && <p className="m-3 flex items-center gap-1 text-[10px] text-severity-high"><AlertTriangle aria-hidden="true" className="size-3" /> Association counts unavailable.</p>}
          </section>
        )}
        rightContent={selectedIncident ? <IncidentDetailPage incident={selectedIncident} key={selectedIncident.id} onUpdated={updateIncident} /> : undefined}
        rightEmptyState={<div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 p-6 text-center"><ShieldAlert aria-hidden="true" className="size-6 text-text-tertiary" /><p className="text-sm text-text-secondary">Select an incident to inspect its investigation.</p><p className="text-xs text-text-tertiary">Create an incident or choose one from the list.</p></div>}
      />
    </div>
  )
}
