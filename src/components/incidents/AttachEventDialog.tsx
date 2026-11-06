import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { recordIncidentActivity } from '@/lib/incidents'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/types/database'
import { Skeleton } from '@/components/ui/skeleton'

interface AttachEventDialogProps {
  incidentId: string
  onAttached: (notice?: string) => void
}

export function AttachEventDialog({ incidentId, onAttached }: AttachEventDialogProps) {
  const [open, setOpen] = useState(false)
  const [eventId, setEventId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const options = useQuery({
    queryKey: ['incident-event-options', user?.id, incidentId],
    enabled: open && Boolean(user),
    queryFn: async () => {
      const [events, links] = await Promise.all([
        supabase.from('events').select('id, source, severity, category, title, event_time, is_sample, user_id, created_at, updated_at').order('event_time', { ascending: false }).limit(500),
        supabase.from('incident_events').select('event_id').eq('incident_id', incidentId),
      ])
      if (events.error || links.error) throw new Error('Event options could not be loaded.')
      const attached = new Set((links.data ?? []).map((link) => link.event_id))
      return ((events.data ?? []) as Event[]).filter((event) => !attached.has(event.id))
    },
  })

  async function attach() {
    const selected = options.data?.find((event) => event.id === eventId)
    if (!selected || !user) return
    setError('')
    setNotice('')
    setBusy(true)
    const { error } = await supabase.from('incident_events').upsert({ incident_id: incidentId, event_id: selected.id }, { onConflict: 'incident_id,event_id' })
    setBusy(false)
    if (error) {
      setError('Event could not be attached to this incident. Try again.')
      return
    }
    let timelineNotice = ''
    try {
      await recordIncidentActivity({
        incidentId,
        actorId: user.id,
        action: 'event_attached',
        details: { event_id: selected.id, title: selected.title },
      })
    } catch {
      timelineNotice = 'Event attached, but its timeline entry could not be saved.'
      setNotice(timelineNotice)
    }
    await queryClient.invalidateQueries({ queryKey: ['incident-events', incidentId] })
    await queryClient.invalidateQueries({ queryKey: ['incident-event-options', user.id, incidentId] })
    onAttached(timelineNotice)
    setEventId('')
    setOpen(false)
    toast.success('Event attached to incident.')
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setEventId('') }}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Attach event</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach an event</DialogTitle>
          <DialogDescription>Choose a security event from your private event feed.</DialogDescription>
        </DialogHeader>
        {error && <p className="border-l-4 border-severity-critical bg-bg-secondary p-2 text-sm" role="alert">{error}</p>}
        {notice && <p className="border-l-4 border-severity-medium bg-bg-secondary p-2 text-sm" role="status">{notice}</p>}
        {options.isPending ? <div className="space-y-2" aria-label="Loading event options"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div> : options.isError ? (
          <div className="border-l-4 border-severity-critical bg-bg-secondary p-2 text-sm" role="alert"><p>Event feed could not be loaded.</p><button className="mt-1 text-accent-primary underline" onClick={() => void options.refetch()} type="button">Retry</button></div>
        ) : options.data.length === 0 ? (
          <p className="text-sm text-text-secondary">No unattached events are available.</p>
        ) : (
          <label className="block space-y-1 text-xs font-medium" htmlFor="incident-event-picker">
            Event
            <select className="h-9 w-full rounded-md border border-border-default bg-bg-input px-3 text-xs" id="incident-event-picker" onChange={(event) => setEventId(event.target.value)} value={eventId}>
              <option value="">Select an event…</option>
              {options.data.map((event) => <option key={event.id} value={event.id}>{event.severity.toUpperCase()} · {event.title}</option>)}
            </select>
          </label>
        )}
        <DialogFooter><Button disabled={busy || !eventId || options.isPending || options.isError} onClick={() => void attach()} size="sm">{busy ? 'Attaching…' : 'Attach event'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
