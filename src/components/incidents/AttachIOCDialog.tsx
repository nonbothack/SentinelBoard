import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { recordIncidentActivity } from '@/lib/incidents'
import { supabase } from '@/lib/supabase'
import type { IOC } from '@/types/database'
import { Skeleton } from '@/components/ui/skeleton'

interface AttachIOCDialogProps {
  incidentId: string
  onAttached: (notice?: string) => void
}

export function AttachIOCDialog({ incidentId, onAttached }: AttachIOCDialogProps) {
  const [open, setOpen] = useState(false)
  const [iocId, setIocId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const options = useQuery({
    queryKey: ['incident-ioc-options', user?.id, incidentId],
    enabled: open && Boolean(user),
    queryFn: async () => {
      const [iocs, links] = await Promise.all([
        supabase.from('iocs').select('id, type, value, severity, created_at').order('created_at', { ascending: false }).limit(500),
        supabase.from('incident_iocs').select('ioc_id').eq('incident_id', incidentId),
      ])
      if (iocs.error || links.error) throw new Error('IOC options could not be loaded.')
      const attached = new Set((links.data ?? []).map((link) => link.ioc_id))
      return ((iocs.data ?? []) as IOC[]).filter((ioc) => !attached.has(ioc.id))
    },
  })

  async function attach() {
    const selected = options.data?.find((ioc) => ioc.id === iocId)
    if (!selected || !user) return
    setError('')
    setNotice('')
    setBusy(true)
    const { error } = await supabase.from('incident_iocs').upsert({ incident_id: incidentId, ioc_id: selected.id }, { onConflict: 'incident_id,ioc_id' })
    setBusy(false)
    if (error) {
      setError('IOC could not be attached to this incident. Try again.')
      return
    }
    let timelineNotice = ''
    try {
      await recordIncidentActivity({
        incidentId,
        actorId: user.id,
        action: 'ioc_attached',
        details: { ioc_id: selected.id, type: selected.type, value: selected.value },
      })
    } catch {
      timelineNotice = 'IOC attached, but its timeline entry could not be saved.'
      setNotice(timelineNotice)
    }
    await queryClient.invalidateQueries({ queryKey: ['incident-iocs', incidentId] })
    await queryClient.invalidateQueries({ queryKey: ['incident-ioc-options', user.id, incidentId] })
    onAttached(timelineNotice)
    setIocId('')
    setOpen(false)
    toast.success('IOC attached to incident.')
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setIocId('') }}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Attach IOC</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach an IOC</DialogTitle>
          <DialogDescription>Choose an IOC from your private enrichment history.</DialogDescription>
        </DialogHeader>
        {error && <p className="border-l-4 border-severity-critical bg-bg-secondary p-2 text-sm" role="alert">{error}</p>}
        {notice && <p className="border-l-4 border-severity-medium bg-bg-secondary p-2 text-sm" role="status">{notice}</p>}
        {options.isPending ? <div className="space-y-2" aria-label="Loading IOC options"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div> : options.isError ? (
          <div className="border-l-4 border-severity-critical bg-bg-secondary p-2 text-sm" role="alert"><p>IOC history could not be loaded.</p><button className="mt-1 text-accent-primary underline" onClick={() => void options.refetch()} type="button">Retry</button></div>
        ) : options.data.length === 0 ? (
          <p className="text-sm text-text-secondary">No unattached IOCs are available.</p>
        ) : (
          <label className="block space-y-1 text-xs font-medium" htmlFor="incident-ioc-picker">
            IOC
            <select className="h-9 w-full rounded-md border border-border-default bg-bg-input px-3 font-mono text-xs" id="incident-ioc-picker" onChange={(event) => setIocId(event.target.value)} value={iocId}>
              <option value="">Select an IOC…</option>
              {options.data.map((ioc) => <option key={ioc.id} value={ioc.id}>{ioc.type} · {ioc.value}</option>)}
            </select>
          </label>
        )}
        <DialogFooter><Button disabled={busy || !iocId || options.isPending || options.isError} onClick={() => void attach()} size="sm">{busy ? 'Attaching…' : 'Attach IOC'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
