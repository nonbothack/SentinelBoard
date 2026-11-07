import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { recordIncidentActivity } from '@/lib/incidents'
import { incidentPlaybooks, type PlaybookId } from '@/lib/incident-playbooks'
import { supabase } from '@/lib/supabase'
import type { Incident, IncidentSeverity } from '@/types/database'

const severities: IncidentSeverity[] = ['critical', 'high', 'medium', 'low']

interface CreateIncidentDialogProps {
  onCreated: (incident: Incident, notice?: string) => void
}

export function CreateIncidentDialog({ onCreated }: CreateIncidentDialogProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<IncidentSeverity>('medium')
  const [playbookId, setPlaybookId] = useState<PlaybookId | ''>('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { user } = useAuth()

  async function createIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedTitle = title.trim()
    if (!normalizedTitle) {
      setError('Enter an incident title.')
      return
    }
    if (normalizedTitle.length > 200) {
      setError('Incident titles must be 200 characters or fewer.')
      return
    }
    if (!user) {
      setError('Sign in before creating an incident.')
      return
    }

    setBusy(true)
    setError('')
    const { data, error: insertError } = await supabase.from('incidents').insert({
      user_id: user.id,
      title: normalizedTitle,
      description: description.trim() || null,
      severity,
      status: 'open',
    }).select('*').single()
    setBusy(false)
    if (insertError || !data) {
      setError('Incident could not be created. Check the connection and try again.')
      return
    }
    const incident = data as Incident
    let notice = ''
    try {
      await recordIncidentActivity({
        incidentId: incident.id,
        actorId: user.id,
        action: 'incident_created',
        details: { title: incident.title, severity: incident.severity },
      })
    } catch {
      notice = 'Incident created, but its timeline entry could not be saved.'
    }
    if (playbookId) {
      try {
        await recordIncidentActivity({ incidentId: incident.id, actorId: user.id, action: 'playbook_selected', details: { playbook_id: playbookId } })
      } catch {
        notice = 'Incident created, but its selected response playbook could not be saved.'
      }
    }
    onCreated(incident, notice)
    setTitle('')
    setDescription('')
    setSeverity('medium')
    setPlaybookId('')
    setOpen(false)
    toast.success('Incident created.')
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); setError('') }}>
      <DialogTrigger asChild><Button size="sm">+ New incident</Button></DialogTrigger>
      <DialogContent>
        <form className="space-y-4" onSubmit={(event) => void createIncident(event)}>
          <DialogHeader>
            <DialogTitle>Create incident</DialogTitle>
            <DialogDescription>Create a case for investigating a security event or IOC. New incidents start as open.</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-xs font-medium" htmlFor="incident-title">
            Title
            <input autoComplete="off" className="h-9 w-full rounded-md border border-border-default bg-bg-input px-3 text-sm" id="incident-title" maxLength={200} onChange={(event) => setTitle(event.target.value)} required value={title} />
          </label>
          <label className="block space-y-1 text-xs font-medium" htmlFor="incident-description">
            Description
            <textarea className="min-h-24 w-full rounded-md border border-border-default bg-bg-input p-3 text-sm" id="incident-description" onChange={(event) => setDescription(event.target.value)} value={description} />
          </label>
          <label className="block space-y-1 text-xs font-medium" htmlFor="incident-severity">
            Severity
            <select className="h-9 w-full rounded-md border border-border-default bg-bg-input px-3 text-sm" id="incident-severity" onChange={(event) => setSeverity(event.target.value as IncidentSeverity)} value={severity}>
              {severities.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-xs font-medium" htmlFor="incident-playbook">
            Response playbook (optional)
            <select className="h-9 w-full rounded-md border border-border-default bg-bg-input px-3 text-sm" id="incident-playbook" onChange={(event) => setPlaybookId(event.target.value as PlaybookId | '')} value={playbookId}>
              <option value="">Choose later</option>
              {incidentPlaybooks.map((playbook) => <option key={playbook.id} value={playbook.id}>{playbook.title}</option>)}
            </select>
          </label>
          {error && <p className="border-l-4 border-severity-critical bg-bg-secondary p-2 text-sm" role="alert">{error}</p>}
          <DialogFooter><Button disabled={busy} size="sm" type="submit">{busy ? 'Creating…' : 'Create incident'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
