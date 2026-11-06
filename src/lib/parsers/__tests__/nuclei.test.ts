import { describe, expect, it } from 'vitest'
import { parseNucleiJSON } from '@/lib/parsers/nuclei'

const validFinding = {
  host: 'example.test',
  'matched-at': 'https://example.test/login',
  info: { name: 'Example exposure', severity: 'high', classification: { 'cve-id': 'CVE-2025-12345' } },
}

describe('parseNucleiJSON', () => {
  it('parses valid JSONL records', () => {
    const result = parseNucleiJSON(`${JSON.stringify(validFinding)}\n`)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({ host: 'example.test', title: 'Example exposure', severity: 'high', cve_ids: ['CVE-2025-12345'] })
  })

  it('returns an empty result for an empty file', () => {
    expect(parseNucleiJSON('  \n')).toMatchObject({ findings: [], invalidCount: 0, totalCount: 0 })
  })

  it('counts malformed JSONL lines while keeping valid findings', () => {
    const result = parseNucleiJSON(`${JSON.stringify(validFinding)}\n{not-json}\n`)
    expect(result.findings).toHaveLength(1)
    expect(result.invalidCount).toBe(1)
    expect(result.totalCount).toBe(2)
  })

  it('skips records missing the required host or title fields', () => {
    const result = parseNucleiJSON(JSON.stringify([{ host: 'example.test' }, { info: { name: 'Missing host' } }]))
    expect(result.findings).toHaveLength(0)
    expect(result.invalidCount).toBe(2)
  })

  it('returns both normalized findings and invalid counts for mixed input', () => {
    const result = parseNucleiJSON(JSON.stringify([validFinding, { host: 'example.test' }, null]))
    expect(result.findings).toHaveLength(1)
    expect(result.invalidCount).toBe(2)
    expect(result.totalCount).toBe(3)
  })
})
