export interface CisaKevEntry {
  cve_id: string
  vendor_project: string
  product: string
  vulnerability_name: string
  date_added: string
  short_description: string
  required_action: string
  due_date: string
  known_ransomware_campaign_use: 'Known' | 'Unknown'
  notes: string | null
  cwes: string[]
  catalog_version: string
  catalog_released: string
  synced_at?: string
}

export interface CisaKevCatalog {
  catalogVersion: string
  dateReleased: string
  count: number
  vulnerabilities: CisaKevEntry[]
}

export type CisaKevMatch = Pick<CisaKevEntry,
  'cve_id' | 'vendor_project' | 'product' | 'vulnerability_name' | 'required_action' |
  'due_date' | 'known_ransomware_campaign_use' | 'catalog_version'
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`CISA KEV record is missing ${field}.`)
  }
  return value.trim()
}

function validDate(value: unknown, field: string) {
  const date = requiredText(value, field)
  const parsed = new Date(`${date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`CISA KEV record has an invalid ${field}.`)
  }
  return date
}

function validCatalogReleaseDate(value: unknown) {
  const releasedAt = requiredText(value, 'dateReleased')
  if (/^\d{4}-\d{2}-\d{2}$/.test(releasedAt)) return validDate(releasedAt, 'dateReleased')

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(releasedAt)) {
    throw new Error('CISA KEV record has an invalid dateReleased.')
  }

  const parsed = new Date(releasedAt)
  if (!Number.isFinite(parsed.getTime())) throw new Error('CISA KEV record has an invalid dateReleased.')
  return validDate(parsed.toISOString().slice(0, 10), 'dateReleased')
}

function parseEntry(value: unknown, catalogVersion: string, catalogReleased: string): CisaKevEntry {
  if (!isRecord(value)) throw new Error('CISA KEV vulnerability entries must be objects.')
  const cveId = requiredText(value.cveID, 'cveID').toUpperCase()
  if (!/^CVE-\d{4}-\d{4,}$/.test(cveId)) throw new Error('CISA KEV record has an invalid cveID.')

  const ransomwareUse = requiredText(value.knownRansomwareCampaignUse, 'knownRansomwareCampaignUse')
  if (ransomwareUse !== 'Known' && ransomwareUse !== 'Unknown') {
    throw new Error(`CISA KEV record ${cveId} has an unsupported ransomware-use value.`)
  }

  const cwes = value.cwes
  if (!Array.isArray(cwes) || !cwes.every((cwe) => typeof cwe === 'string')) {
    throw new Error(`CISA KEV record ${cveId} has an invalid cwes list.`)
  }

  const notes = value.notes
  if (notes !== null && notes !== undefined && typeof notes !== 'string') {
    throw new Error(`CISA KEV record ${cveId} has invalid notes.`)
  }

  return {
    cve_id: cveId,
    vendor_project: requiredText(value.vendorProject, 'vendorProject'),
    product: requiredText(value.product, 'product'),
    vulnerability_name: requiredText(value.vulnerabilityName, 'vulnerabilityName'),
    date_added: validDate(value.dateAdded, 'dateAdded'),
    short_description: requiredText(value.shortDescription, 'shortDescription'),
    required_action: requiredText(value.requiredAction, 'requiredAction'),
    due_date: validDate(value.dueDate, 'dueDate'),
    known_ransomware_campaign_use: ransomwareUse,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    cwes: cwes.map((cwe) => cwe.trim()).filter(Boolean),
    catalog_version: catalogVersion,
    catalog_released: catalogReleased,
  }
}

export function parseCisaKevCatalog(value: unknown): CisaKevCatalog {
  if (!isRecord(value)) throw new Error('CISA KEV catalog must be a JSON object.')
  const catalogVersion = requiredText(value.catalogVersion, 'catalogVersion')
  const dateReleased = validCatalogReleaseDate(value.dateReleased)
  const count = value.count
  const rawEntries = value.vulnerabilities
  if (!Number.isSafeInteger(count) || Number(count) < 1) throw new Error('CISA KEV catalog has an invalid count.')
  if (!Array.isArray(rawEntries) || rawEntries.length !== count) {
    throw new Error('CISA KEV catalog count does not match its vulnerability entries.')
  }

  const vulnerabilities = rawEntries.map((entry) => parseEntry(entry, catalogVersion, dateReleased))
  const uniqueIds = new Set(vulnerabilities.map((entry) => entry.cve_id))
  if (uniqueIds.size !== vulnerabilities.length) throw new Error('CISA KEV catalog contains duplicate CVE IDs.')

  return { catalogVersion, dateReleased, count: Number(count), vulnerabilities }
}
