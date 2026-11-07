import { describe, expect, it } from 'vitest'
import { parseEventIngestPayload } from '../../../supabase/functions/_shared/ingest-events'

describe('parseEventIngestPayload', () => {
  it('normalizes app and Suricata JSON fields while retaining raw source data', () => {
    const parsed = parseEventIngestPayload(JSON.stringify([
      { title: 'SSH login failure', severity: 'high', src_ip: '203.0.113.8', dest_ip: '192.0.2.10', external_id: 'evt-1', user_id: 'spoof', source: 'manual', is_sample: true },
      { timestamp: '2026-01-01T12:00:00Z', event_type: 'alert', alert: { signature: 'ET POLICY test', severity: 1, category: 'Attempted Information Leak' }, src_ip: '198.51.100.4', dest_ip: '192.0.2.3' },
    ]))

    expect(parsed.events).toHaveLength(2)
    expect(parsed.events[0]).toMatchObject({ external_id: 'evt-1', severity: 'high', category: 'authentication', source_ip: '203.0.113.8', dest_ip: '192.0.2.10' })
    expect(parsed.events[1]).toMatchObject({ title: 'ET POLICY test', severity: 'high', source_ip: '198.51.100.4', dest_ip: '192.0.2.3' })
    expect(parsed.events[0].raw_data).toMatchObject({ user_id: 'spoof', source: 'manual', is_sample: true })
  })

  it('normalizes common Wazuh fields and rejects invalid addresses', () => {
    const parsed = parseEventIngestPayload(JSON.stringify({ timestamp: '2026-01-02T03:04:05Z', rule: { level: 10, description: 'Multiple authentication failures' }, agent: { name: 'web-01' }, data: { srcip: '999.4.3.2', dstip: '2001:db8::1' }, id: 'wazuh-2' }))
    expect(parsed.events[0]).toMatchObject({ external_id: 'wazuh-2', severity: 'critical', category: 'authentication', source_ip: null, dest_ip: '2001:db8::1', hostname: 'web-01' })
  })

  it('parses CEF records and RFC 5424 syslog', () => {
    const cef = parseEventIngestPayload('CEF:0|Acme|Sensor|1|sig-1|Malware \\| activity|9|src=198.51.100.7 dst=203.0.113.9 externalId=cef-1')
    expect(cef.format).toBe('cef')
    expect(cef.events[0]).toMatchObject({ title: 'Malware | activity', severity: 'critical', external_id: 'cef-1', source_ip: '198.51.100.7', dest_ip: '203.0.113.9' })

    const syslog = parseEventIngestPayload('<34>1 2026-01-01T00:00:00Z host-a sshd 123 ID47 - Failed password')
    expect(syslog.format).toBe('syslog')
    expect(syslog.events[0]).toMatchObject({ title: 'sshd · ID47', severity: 'critical', hostname: 'host-a', description: 'Failed password', category: 'authentication' })
  })

  it('counts invalid records and skips empty titles', () => {
    const parsed = parseEventIngestPayload(JSON.stringify([{ title: 'Valid event' }, { severity: 'high' }, null]))
    expect(parsed.events).toHaveLength(1)
    expect(parsed.invalidCount).toBe(2)
  })
})
