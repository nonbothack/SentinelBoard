import { supabase } from '@/lib/supabase'
import type { Event, Incident, IncidentActivity, IncidentEvent, IncidentIOC, IOC } from '@/types/database'

export type IncidentStatus = Incident['status']
export type IncidentActivityAction = 'incident_created' | 'incident_updated' | 'status_changed' | 'ioc_attached' | 'event_attached'
export const incidentStatusBadgeClass: Record<IncidentStatus, string> = {
  open: 'border-severity-high text-severity-high',
  investigating: 'border-status-pending text-status-pending',
  contained: 'border-severity-low text-severity-low',
  resolved: 'border-status-success text-status-success',
  closed: 'border-border-default text-text-tertiary',
}

const transitions: Record<IncidentStatus, IncidentStatus[]> = {
  open: ['investigating'],
  investigating: ['contained', 'resolved'],
  contained: ['resolved'],
  resolved: ['closed'],
  closed: [],
}

export function allowedStatusTransitions(status: IncidentStatus): IncidentStatus[] {
  const allowed = transitions[status]
  return status === 'open' ? allowed : [...allowed, 'open']
}

export function isValidStatusTransition(from: IncidentStatus, to: IncidentStatus) {
  return allowedStatusTransitions(from).includes(to)
}

export async function recordIncidentActivity(input: {
  incidentId: string
  actorId: string
  action: IncidentActivityAction
  details?: Record<string, string | number | boolean | null | string[]>
}) {
  const { error } = await supabase.from('incident_activity').insert({
    incident_id: input.incidentId,
    actor_id: input.actorId,
    action: input.action,
    details: input.details ?? {},
  })
  if (error) throw error
}

export type AttachedIOC = IncidentIOC & { iocs: Pick<IOC, 'id' | 'type' | 'value' | 'severity'> | null }
export type AttachedEvent = IncidentEvent & { events: Pick<Event, 'id' | 'title' | 'severity' | 'event_time' | 'source'> | null }
export type TimelineEntry = IncidentActivity
