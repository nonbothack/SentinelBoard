import { describe, expect, it } from 'vitest'
import { parseCisaKevCatalog } from '@/lib/cisa-kev'

const entry = {
  cveID: 'CVE-2025-12345',
  vendorProject: 'Example Vendor',
  product: 'Example Product',
  vulnerabilityName: 'Remote code execution',
  dateAdded: '2025-04-10',
  shortDescription: 'A remotely exploitable vulnerability.',
  requiredAction: 'Apply vendor mitigations.',
  dueDate: '2025-05-01',
  knownRansomwareCampaignUse: 'Unknown',
  notes: '',
  cwes: ['CWE-79'],
}

function catalog(overrides: Record<string, unknown> = {}) {
  return {
    catalogVersion: '2026.11.07',
    dateReleased: '2026-11-07',
    count: 1,
    vulnerabilities: [entry],
    ...overrides,
  }
}

describe('parseCisaKevCatalog', () => {
  it('normalizes official KEV records into database rows', () => {
    expect(parseCisaKevCatalog(catalog())).toMatchObject({
      catalogVersion: '2026.11.07',
      dateReleased: '2026-11-07',
      count: 1,
      vulnerabilities: [{
        cve_id: 'CVE-2025-12345',
        vendor_project: 'Example Vendor',
        known_ransomware_campaign_use: 'Unknown',
        catalog_version: '2026.11.07',
        catalog_released: '2026-11-07',
        notes: null,
      }],
    })
  })

  it('rejects a catalog whose declared count differs from its records', () => {
    expect(() => parseCisaKevCatalog(catalog({ count: 2 }))).toThrow(/count does not match/)
  })

  it('rejects duplicate CVE records', () => {
    expect(() => parseCisaKevCatalog(catalog({ count: 2, vulnerabilities: [entry, entry] }))).toThrow(/duplicate CVE IDs/)
  })

  it('rejects malformed CVE identifiers and invalid dates', () => {
    expect(() => parseCisaKevCatalog(catalog({ vulnerabilities: [{ ...entry, cveID: 'not-a-cve' }] }))).toThrow(/invalid cveID/)
    expect(() => parseCisaKevCatalog(catalog({ dateReleased: '2026-02-31' }))).toThrow(/invalid dateReleased/)
  })

  it('rejects an empty catalog rather than clearing the stored feed', () => {
    expect(() => parseCisaKevCatalog(catalog({ count: 0, vulnerabilities: [] }))).toThrow(/invalid count/)
  })
})
