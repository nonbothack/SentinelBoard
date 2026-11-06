import { describe, expect, it } from 'vitest'
import { normalizeEvent } from '@/lib/parsers/events'

const now = new Date('2026-01-10T12:00:00.000Z')

describe('normalizeEvent', () => {
  it('normalizes a complete event without warnings', () => {
    const result = normalizeEvent({
      source: 'firewall', severity: 'high', category: 'network', title: 'Blocked connection',
      description: 'Outbound connection was blocked.', source_ip: '8.8.8.8', dest_ip: '203.0.113.4',
      hostname: 'edge-01', event_time: '2026-01-10T11:00:00.000Z', raw_data: { action: 'deny' },
    }, now)
    expect(result.event).toMatchObject({ source: 'firewall', severity: 'high', category: 'network', title: 'Blocked connection', source_ip: '8.8.8.8', dest_ip: '203.0.113.4', hostname: 'edge-01', raw_data: { action: 'deny' } })
    expect(result.warnings).toHaveLength(0)
  })

  it('defaults missing optional fields to safe values', () => {
    const result = normalizeEvent({ title: 'Minimal event' }, now)
    expect(result.event).toMatchObject({ source: 'manual', severity: 'info', category: null, description: null, source_ip: null, dest_ip: null, event_time: now.toISOString() })
  })

  it('replaces an invalid timestamp with the provided import time', () => {
    const result = normalizeEvent({ title: 'Bad time', event_time: 'not-a-timestamp' }, now)
    expect(result.event?.event_time).toBe(now.toISOString())
    expect(result.warnings).toContain('Invalid event timestamp was replaced with the import time.')
  })

  it('defaults a missing severity to info and reports the normalization', () => {
    const result = normalizeEvent({ title: 'No severity' }, now)
    expect(result.event?.severity).toBe('info')
    expect(result.warnings).toContain('Missing or unknown severity defaulted to info.')
  })
})
