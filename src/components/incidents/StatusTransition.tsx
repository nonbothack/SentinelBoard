import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { allowedStatusTransitions, isValidStatusTransition, recordIncidentActivity, type IncidentStatus } from '@/lib/incidents'
import { supabase } from '@/lib/supabase'
import type { Incident } from '@/types/database'

interface StatusTransitionProps {
  incident: Incident
  onTransition: (incident: Incident) => void
}

const actionLabels: Record<IncidentStatus, string> = {
  open: 'Reopen',
  investigating: 'Begin investigation',
  contained: 'Mark contained',
  resolved: 'Mark resolved',
  closed: 'Close incident',
}

export function StatusTransition({ incident, onTransition }: StatusTransitionProps) {
  const [busyStatus, setBusyStatus] = useState<IncidentStatus | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const nextStatuses = allowedStatusTransitions(incident.status)

  async function changeStatus(nextStatus: IncidentStatus) {
    if (!user || !isValidStatusTransition(incident.status, nextStatus)) {
      setError(`Cannot transition from '${incident.status}' to '${nextStatus}'.`)
      return
    }
    setError('')
    setNotice('')
    setBusyStatus(nextStatus)
    const { data, error } = await supabase
      .from('incidents')
      .update({ status: nextStatus })
      .eq('id', incident.id)
      .select('*')
      .single()
    setBusyStatus(null)
    if (error || !data) {
      setError('Incident status could not be updated. Try again.')
      return
    }
    const updated = data as Incident
    try {
      await recordIncidentActivity({
        incidentId: incident.id,
        actorId: user.id,
        action: 'status_changed',
        details: { from: incident.status, to: nextStatus },
      })
    } catch {
      setNotice('Status updated, but its timeline entry could not be saved.')
    }
    void queryClient.invalidateQueries({ queryKey: ['incident-timeline', incident.id] })
    onTransition(updated)
    toast.success(`Incident moved to ${nextStatus}.`)
  }

  return (
    <div className="space-y-2" aria-label="Valid incident status transitions">
      {error && <p className="border-l-4 border-severity-critical bg-bg-secondary p-2 text-xs" role="alert">{error}</p>}
      {notice && <p className="border-l-4 border-severity-medium bg-bg-secondary p-2 text-xs" role="status">{notice}</p>}
      <div className="flex flex-wrap gap-2">
      {nextStatuses.map((status) => (
        <Button disabled={busyStatus !== null} key={status} onClick={() => void changeStatus(status)} size="sm" variant="outline">
          {busyStatus === status ? 'Updating…' : actionLabels[status]}
        </Button>
      ))}
      </div>
    </div>
  )
}
