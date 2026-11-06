import { describe, expect, it } from 'vitest'
import { generateIncidentReport } from '@/lib/report-generator'
import type { AttachedEvent, AttachedIOC } from '@/lib/incidents'
import type { Incident, IncidentActivity } from '@/types/database'

const incident: Incident = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  title: 'Suspicious login',
  description: 'Several attempts from an unfamiliar address.',
  severity: 'high',
  status: 'investigating',
  created_at: '2026-01-01T10:00:00.000Z',
  updated_at: '2026-01-01T11:00:00.000Z',
}
const ioc: AttachedIOC & { enrichmentSummary: string[] } = {
  incident_id: incident.id,
  ioc_id: '33333333-3333-4333-8333-333333333333',
  added_at: '2026-01-01T10:30:00.000Z',
  iocs: { id: '33333333-3333-4333-8333-333333333333', type: 'ip', value: '203.0.113.9', severity: 'medium' },
  enrichmentSummary: ['VirusTotal: 2/70 malicious', 'OTX: 3 threat pulses'],
}
const event: AttachedEvent = {
  incident_id: incident.id,
  event_id: '44444444-4444-4444-8444-444444444444',
  added_at: '2026-01-01T10:40:00.000Z',
  events: { id: '44444444-4444-4444-8444-444444444444', title: 'Repeated sign-in failure', severity: 'high', event_time: '2026-01-01T09:59:00.000Z', source: 'windows_event' },
}
const activity: IncidentActivity = {
  id: '55555555-5555-4555-8555-555555555555',
  incident_id: incident.id,
  actor_id: '22222222-2222-4222-8222-222222222222',
  action: 'status_changed',
  details: { from: 'open', to: 'investigating' },
  created_at: '2026-01-01T10:20:00.000Z',
}

describe('generateIncidentReport', () => {
  it('includes incident, IOC, enrichment, event, and timeline details', () => {
    const report = generateIncidentReport({ incident, iocs: [ioc], events: [event], timeline: [activity], generatedAt: new Date('2026-01-02T00:00:00.000Z') })
    expect(report).toContain('# Incident Report: Suspicious login')
    expect(report).toContain('203.0.113.9')
    expect(report).toContain('VirusTotal: 2/70 malicious')
    expect(report).toContain('Repeated sign-in failure')
    expect(report).toContain('Changed status from open to investigating')
    expect(report).toContain('2026-01-02T00:00:00.000Z')
  })

  it('renders a clear fallback when no IOCs are associated', () => {
    expect(generateIncidentReport({ incident, iocs: [], events: [event], timeline: [] })).toContain('| — | No IOCs attached | — | — |')
  })

  it('renders a clear fallback when no events are associated', () => {
    expect(generateIncidentReport({ incident, iocs: [ioc], events: [], timeline: [] })).toContain('| — | — | No events attached | — |')
  })

  it('handles minimal incident data and escapes table delimiters in user content', () => {
    const minimal = { ...incident, description: null, title: 'Case | One' }
    const report = generateIncidentReport({ incident: minimal, iocs: [], events: [], timeline: [] })
    expect(report).toContain('# Incident Report: Case \\| One')
    expect(report).toContain('No description provided.')
    expect(report).toContain('- No activity recorded.')
  })
})
