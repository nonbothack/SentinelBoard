import { describe, expect, it } from 'vitest'
import { calculateSeverity, type SeverityEnrichment } from '@/lib/severity'

const result = (provider: string, summary: Record<string, unknown>, status = 'success'): SeverityEnrichment => ({ provider, status, summary })

describe('calculateSeverity', () => {
  it('returns info when all available providers report clean results', () => {
    expect(calculateSeverity([
      result('virustotal', { malicious: 0, total_engines: 70 }),
      result('abuseipdb', { confidence_score: 0 }),
      result('otx', { pulse_count: 0 }),
    ])).toBe('info')
  })

  it('returns critical when a malicious detection ratio exceeds twenty percent', () => {
    expect(calculateSeverity([result('virustotal', { malicious: 3, total_engines: 10 })])).toBe('critical')
  })

  it('combines mixed results using the highest deterministic threshold', () => {
    expect(calculateSeverity([
      result('virustotal', { malicious: 2, total_engines: 20 }),
      result('abuseipdb', { confidence_score: 40 }),
      result('otx', { pulse_count: 12 }),
    ])).toBe('high')
  })

  it('returns info when every provider errored or when no data is available', () => {
    expect(calculateSeverity([
      result('virustotal', {}, 'error'),
      result('abuseipdb', {}, 'rate_limited'),
      result('otx', {}, 'not_found'),
    ])).toBe('info')
    expect(calculateSeverity([])).toBe('info')
  })

  it('calculates a VT-only result', () => {
    expect(calculateSeverity([result('virustotal', { malicious: 2, total_engines: 20 })])).toBe('high')
  })

  it('calculates an AbuseIPDB-only result', () => {
    expect(calculateSeverity([result('abuseipdb', { confidence_score: 90 })])).toBe('high')
  })
})
