import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Copy, Download, FileText } from 'lucide-react'
import { AttachEventDialog } from '@/components/incidents/AttachEventDialog'
import { AttachIOCDialog } from '@/components/incidents/AttachIOCDialog'
import { IncidentTimeline } from '@/components/incidents/IncidentTimeline'
import { StatusTransition } from '@/components/incidents/StatusTransition'
import { SeverityBadge } from '@/components/ioc/SeverityBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { formatRelativeTime } from '@/lib/format-time'
import { incidentStatusBadgeClass, recordIncidentActivity } from '@/lib/incidents'
import { downloadIncidentReport, generateIncidentReport } from '@/lib/report-generator'
import { supabase } from '@/lib/supabase'
import type { AttachedEvent, AttachedIOC, TimelineEntry } from '@/lib/incidents'
import type { Event, Incident, IncidentSeverity, IOC, IOCEnrichment } from '@/types/database'
import { useQuery, useQueryClient } from '@tanstack/react-query'

const severities: IncidentSeverity[] = ['critical', 'high', 'medium', 'low']
type IncidentIOCView = AttachedIOC & { enrichmentSummary: string[] }

function summarizeEnrichment(row: IOCEnrichment) {
  const summary = row.summary && typeof row.summary === 'object' && !Array.isArray(row.summary) ? row.summary as Record<string, unknown> : {}
  if (row.status !== 'success') return `${row.provider}: ${row.status.replaceAll('_', ' ')}`
  if (row.provider === 'virustotal') {
    const malicious = Number(summary.malicious ?? 0)
    const total = Number(summary.total_engines ?? 0)
    return total > 0 ? `VirusTotal: ${malicious}/${total} malicious` : 'VirusTotal: results available'
  }
  if (row.provider === 'abuseipdb') return `AbuseIPDB: ${Number(summary.confidence_score ?? 0)}% confidence`
  return `OTX: ${Number(summary.pulse_count ?? 0)} threat pulses`
}

interface IncidentDetailPageProps {
  incident: Incident
  onUpdated: (incident: Incident) => void
}

export function IncidentDetailPage({ incident, onUpdated }: IncidentDetailPageProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(incident.title)
  const [description, setDescription] = useState(incident.description ?? '')
  const [severity, setSeverity] = useState<IncidentSeverity>(incident.severity)
  const [saving, setSaving] = useState(false)
  const [report, setReport] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionNotice, setActionNotice] = useState('')

  const associations = useQuery({
    queryKey: ['incident-associations', incident.id],
    queryFn: async () => {
      const [iocLinks, eventLinks] = await Promise.all([
        supabase.from('incident_iocs').select('incident_id,ioc_id,added_at').eq('incident_id', incident.id).order('added_at', { ascending: false }),
        supabase.from('incident_events').select('incident_id,event_id,added_at').eq('incident_id', incident.id).order('added_at', { ascending: false }),
      ])
      if (iocLinks.error || eventLinks.error) throw new Error('Incident associations could not be loaded.')
      const iocRows = iocLinks.data ?? []
      const eventRows = eventLinks.data ?? []
      const iocIds = [...new Set(iocRows.map((row) => row.ioc_id))]
      const [iocs, events] = await Promise.all([
        iocIds.length ? supabase.from('iocs').select('*').in('id', iocIds) : Promise.resolve({ data: [], error: null }),
        eventRows.length ? supabase.from('events').select('*').in('id', eventRows.map((row) => row.event_id)) : Promise.resolve({ data: [], error: null }),
      ])
      if (iocs.error || events.error) throw new Error('Incident associations could not be loaded.')
      const enrichments = iocIds.length
        ? await supabase.from('ioc_enrichments').select('*').in('ioc_id', iocIds).order('queried_at', { ascending: false })
        : { data: [], error: null }
      if (enrichments.error) throw new Error('IOC enrichment summaries could not be loaded.')
      const summariesByIOC = new Map<string, string[]>()
      const seenProviders = new Set<string>()
      for (const rawRow of enrichments.data ?? []) {
        const row = rawRow as IOCEnrichment
        const key = `${row.ioc_id}:${row.provider}`
        if (seenProviders.has(key)) continue
        seenProviders.add(key)
        summariesByIOC.set(row.ioc_id, [...(summariesByIOC.get(row.ioc_id) ?? []), summarizeEnrichment(row)])
      }
      const iocById = new Map(((iocs.data ?? []) as IOC[]).map((ioc) => [ioc.id, ioc]))
      const eventById = new Map(((events.data ?? []) as Event[]).map((event) => [event.id, event]))
      return {
        iocs: iocRows.map((row) => ({ ...row, iocs: iocById.get(row.ioc_id) ? { id: row.ioc_id, type: iocById.get(row.ioc_id)!.type, value: iocById.get(row.ioc_id)!.value, severity: iocById.get(row.ioc_id)!.severity } : null, enrichmentSummary: summariesByIOC.get(row.ioc_id) ?? [] })) as IncidentIOCView[],
        events: eventRows.map((row) => ({ ...row, events: eventById.get(row.event_id) ? { id: row.event_id, title: eventById.get(row.event_id)!.title, severity: eventById.get(row.event_id)!.severity, event_time: eventById.get(row.event_id)!.event_time, source: eventById.get(row.event_id)!.source } : null })) as AttachedEvent[],
      }
    },
  })

  const timeline = useQuery({
    queryKey: ['incident-timeline', incident.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('incident_activity').select('*').eq('incident_id', incident.id).order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as TimelineEntry[]
    },
  })

  function refreshActivity() {
    void queryClient.invalidateQueries({ queryKey: ['incident-timeline', incident.id] })
  }

  function createReport() {
    if (associations.isPending || associations.isError || timeline.isPending || timeline.isError) {
      setActionError('Wait until incident evidence and activity finish loading before generating a report.')
      return
    }
    setActionError('')
    const markdown = generateIncidentReport({ incident, iocs: associations.data.iocs, events: associations.data.events, timeline: timeline.data ?? [] })
    setReport(markdown)
    downloadIncidentReport(markdown, incident.id)
    toast.success('Markdown incident report downloaded.')
  }

  async function copyReport() {
    if (!report) return
    try {
      await navigator.clipboard.writeText(report)
      toast.success('Report Markdown copied to clipboard.')
    } catch {
      setActionError('Clipboard access is unavailable in this browser.')
    }
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const normalizedTitle = title.trim()
    if (!normalizedTitle) {
      setActionError('Incident title cannot be empty.')
      return
    }
    const normalizedDescription = description.trim() || null
    const changedFields = [
      ...(normalizedTitle !== incident.title ? ['title'] : []),
      ...(normalizedDescription !== incident.description ? ['description'] : []),
      ...(severity !== incident.severity ? ['severity'] : []),
    ]
    if (!changedFields.length) return

    setActionError('')
    setActionNotice('')
    setSaving(true)
    const { data, error } = await supabase.from('incidents').update({ title: normalizedTitle, description: normalizedDescription, severity }).eq('id', incident.id).select('*').single()
    setSaving(false)
    if (error || !data) {
      setActionError('Incident details could not be saved. Try again.')
      return
    }
    const updated = data as Incident
    try {
      await recordIncidentActivity({ incidentId: incident.id, actorId: user.id, action: 'incident_updated', details: { changed_fields: changedFields } })
      refreshActivity()
    } catch {
      setActionNotice('Details saved, but the timeline entry could not be saved.')
    }
    onUpdated(updated)
    toast.success('Incident details saved.')
  }

  return (
    <article className="space-y-4 p-4" aria-labelledby="incident-detail-title">
      <header className="space-y-3 border-b border-border-panel pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={incident.severity} />
          <Badge variant="outline" className={`capitalize ${incidentStatusBadgeClass[incident.status]}`}>{incident.status}</Badge>
        </div>
        <h2 className="text-lg font-semibold" id="incident-detail-title">{incident.title}</h2>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-text-tertiary">
          <div><dt className="inline">Created </dt><dd className="inline font-mono" title={new Date(incident.created_at).toLocaleString()}>{formatRelativeTime(incident.created_at)}</dd></div>
          <div><dt className="inline">Updated </dt><dd className="inline font-mono" title={new Date(incident.updated_at).toLocaleString()}>{formatRelativeTime(incident.updated_at)}</dd></div>
        </dl>
        <StatusTransition incident={incident} onTransition={onUpdated} />
      </header>
      {actionError && <p className="border-l-4 border-severity-critical bg-bg-secondary p-3 text-sm" role="alert">{actionError}</p>}
      {actionNotice && <p className="border-l-4 border-severity-medium bg-bg-secondary p-3 text-sm" role="status">{actionNotice}</p>}

      <form className="space-y-3 rounded-md border border-border-panel bg-bg-surface p-3" onSubmit={(event) => void saveDetails(event)}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
          <label className="block space-y-1 text-xs font-medium" htmlFor="incident-edit-title">Title
            <input className="h-9 w-full rounded-md border border-border-default bg-bg-input px-3 text-sm" id="incident-edit-title" maxLength={200} onChange={(event) => setTitle(event.target.value)} value={title} />
          </label>
          <label className="block space-y-1 text-xs font-medium" htmlFor="incident-edit-severity">Severity
            <select className="h-9 w-full rounded-md border border-border-default bg-bg-input px-3 text-sm capitalize" id="incident-edit-severity" onChange={(event) => setSeverity(event.target.value as IncidentSeverity)} value={severity}>{severities.map((value) => <option className="capitalize" key={value} value={value}>{value}</option>)}</select>
          </label>
        </div>
        <label className="block space-y-1 text-xs font-medium" htmlFor="incident-edit-description">Description
          <textarea className="min-h-20 w-full rounded-md border border-border-default bg-bg-input p-3 text-sm" id="incident-edit-description" onChange={(event) => setDescription(event.target.value)} value={description} />
        </label>
        <Button disabled={saving} size="sm" type="submit">{saving ? 'Saving…' : 'Save details'}</Button>
      </form>

      <Tabs className="min-w-0" defaultValue="iocs">
        <TabsList className="grid h-auto w-full grid-cols-4 bg-bg-tertiary">
          <TabsTrigger value="iocs">IOCs</TabsTrigger><TabsTrigger value="events">Events</TabsTrigger><TabsTrigger value="timeline">Timeline</TabsTrigger><TabsTrigger value="report">Report</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-3" value="iocs">
          <section aria-labelledby="incident-iocs-title">
            <header className="mb-2 flex items-center justify-between gap-2"><h3 className="text-xs font-semibold" id="incident-iocs-title">Associated IOCs</h3><AttachIOCDialog incidentId={incident.id} onAttached={(notice) => { setActionNotice(notice ?? ''); void queryClient.invalidateQueries({ queryKey: ['incident-associations', incident.id] }); void queryClient.invalidateQueries({ queryKey: ['incident-counts'] }); refreshActivity() }} /></header>
            {associations.isPending ? <div className="space-y-2"><div className="h-12 animate-pulse rounded bg-bg-tertiary" /><div className="h-12 animate-pulse rounded bg-bg-tertiary" /></div> : associations.isError ? <div className="border-l-4 border-severity-critical bg-bg-secondary p-3 text-sm" role="alert"><p>IOC associations could not be loaded.</p><button className="mt-1 text-xs text-accent-primary underline" onClick={() => void associations.refetch()} type="button">Retry</button></div> : associations.data.iocs.length === 0 ? <p className="py-6 text-center text-sm text-text-tertiary">No IOCs attached to this incident.</p> : (
              <ul className="divide-y divide-border-subtle rounded-md border border-border-panel">{associations.data.iocs.map((link) => <li className="flex flex-wrap items-center justify-between gap-2 p-3" key={link.ioc_id}><span className="min-w-0"><span className="mr-2 rounded border border-border-default px-1.5 py-0.5 text-[9px] uppercase text-text-tertiary">{link.iocs?.type ?? 'IOC'}</span><span className="break-all font-mono text-xs">{link.iocs?.value ?? 'Unavailable IOC'}</span>{link.enrichmentSummary.length > 0 ? <span className="mt-1 block text-[10px] text-text-secondary">{link.enrichmentSummary.join(' · ')}</span> : <span className="mt-1 block text-[10px] text-text-tertiary">No enrichment summary available.</span>}</span><span className="text-xs text-text-secondary">{link.iocs?.severity ? <SeverityBadge severity={link.iocs.severity} /> : 'Not enriched'}</span></li>)}</ul>
            )}
          </section>
        </TabsContent>
        <TabsContent className="mt-3" value="events">
          <section aria-labelledby="incident-events-title">
            <header className="mb-2 flex items-center justify-between gap-2"><h3 className="text-xs font-semibold" id="incident-events-title">Associated events</h3><AttachEventDialog incidentId={incident.id} onAttached={(notice) => { setActionNotice(notice ?? ''); void queryClient.invalidateQueries({ queryKey: ['incident-associations', incident.id] }); void queryClient.invalidateQueries({ queryKey: ['incident-counts'] }); refreshActivity() }} /></header>
            {associations.isPending ? <div className="space-y-2"><div className="h-12 animate-pulse rounded bg-bg-tertiary" /><div className="h-12 animate-pulse rounded bg-bg-tertiary" /></div> : associations.isError ? <div className="border-l-4 border-severity-critical bg-bg-secondary p-3 text-sm" role="alert"><p>Event associations could not be loaded.</p><button className="mt-1 text-xs text-accent-primary underline" onClick={() => void associations.refetch()} type="button">Retry</button></div> : associations.data.events.length === 0 ? <p className="py-6 text-center text-sm text-text-tertiary">No events attached to this incident.</p> : (
              <ul className="divide-y divide-border-subtle rounded-md border border-border-panel">{associations.data.events.map((link) => <li className="flex flex-wrap items-center justify-between gap-2 p-3" key={link.event_id}><span className="min-w-0"><span className="mr-2 rounded border border-border-default px-1.5 py-0.5 text-[9px] uppercase text-text-tertiary">{link.events?.source?.replaceAll('_', ' ') ?? 'Event'}</span><span className="text-xs">{link.events?.title ?? 'Unavailable event'}</span></span><span className="flex items-center gap-2"><span className="text-[10px] text-text-tertiary">{link.events?.event_time ? formatRelativeTime(link.events.event_time) : ''}</span>{link.events?.severity && <SeverityBadge severity={link.events.severity} />}</span></li>)}</ul>
            )}
          </section>
        </TabsContent>
        <TabsContent className="mt-3" value="timeline"><IncidentTimeline entries={timeline.data ?? []} error={timeline.isError} loading={timeline.isPending} onRetry={() => void timeline.refetch()} /></TabsContent>
        <TabsContent className="mt-3 space-y-3" value="report">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-panel bg-bg-surface p-3">
            <div className="flex items-center gap-2"><FileText aria-hidden="true" className="size-4 text-text-tertiary" /><div><p className="text-xs font-medium text-text-primary">Markdown incident report</p><p className="text-[10px] text-text-tertiary">Includes incident details, linked evidence, enrichment summaries, and timeline.</p></div></div>
            <div className="flex gap-2"><Button disabled={associations.isPending || associations.isError || timeline.isPending || timeline.isError} onClick={createReport} size="sm"><Download aria-hidden="true" className="size-3.5" />Generate & download</Button>{report && <Button onClick={() => downloadIncidentReport(report, incident.id)} size="sm" variant="outline"><Download aria-hidden="true" className="size-3.5" />Download again</Button>}{report && <Button onClick={() => void copyReport()} size="sm" variant="outline"><Copy aria-hidden="true" className="size-3.5" />Copy</Button>}</div>
          </div>
          {report ? <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-panel bg-bg-secondary p-4 font-mono text-[11px] leading-5 text-text-secondary" aria-label="Generated Markdown report preview">{report}</pre> : <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-default p-5 text-center"><FileText aria-hidden="true" className="size-5 text-text-tertiary" /><p className="text-sm text-text-secondary">Generate a report to preview its Markdown and download it as a .md file.</p></div>}
        </TabsContent>
      </Tabs>
    </article>
  )
}
