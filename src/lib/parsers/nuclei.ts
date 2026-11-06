import type { Json, Severity } from '@/types/database'

export interface ParsedFinding {
  host: string
  port: number | null
  severity: Severity
  title: string
  description: string | null
  cve_ids: string[]
  reference_urls: string[]
  matched_at: string | null
  raw_finding: Json
}

const allowedSeverities: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function safeWebURL(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function severityFrom(value: unknown): Severity {
  const normalized = text(value).toLowerCase() as Severity
  return allowedSeverities.includes(normalized) ? normalized : 'info'
}

function portFrom(value: unknown, host: string): number | null {
  const numeric = Number(value)
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 65535) return numeric
  try {
    const parsed = new URL(host.includes('://') ? host : `https://${host}`)
    const hostPort = Number(parsed.port)
    return Number.isInteger(hostPort) && hostPort >= 1 && hostPort <= 65535 ? hostPort : null
  } catch {
    return null
  }
}

function normalizeFinding(raw: unknown): ParsedFinding | null {
  const item = asRecord(raw)
  if (!item) return null
  const info = asRecord(item.info) ?? {}
  const classification = asRecord(info.classification) ?? {}
  const host = text(item.host) || text(item.ip)
  const title = text(info.name) || text(item['template-id']) || text(item.templateID)
  if (!host || !title) return null

  const cveSource = classification['cve-id'] ?? classification.cve_id ?? item['cve-id']
  const cveValues = Array.isArray(cveSource) ? cveSource : typeof cveSource === 'string' ? [cveSource] : []
  const cveIds = [...new Set(cveValues.flatMap((value) => typeof value === 'string' ? value.match(/\bCVE-\d{4}-\d{4,}\b/gi) ?? [] : []).map((cve) => cve.toUpperCase()))]

  const references = Array.isArray(info.reference) ? info.reference : typeof info.reference === 'string' ? [info.reference] : []
  const referenceUrls = [...new Set(references.map(safeWebURL).filter((url): url is string => Boolean(url)))]
  const rawJson = JSON.parse(JSON.stringify(raw)) as Json

  return {
    host,
    port: portFrom(item.port, host),
    severity: severityFrom(info.severity),
    title: title.slice(0, 300),
    description: text(info.description) || null,
    cve_ids: cveIds,
    reference_urls: referenceUrls,
    matched_at: text(item['matched-at'] ?? item.matched_at) || null,
    raw_finding: rawJson,
  }
}

export function parseNucleiJSON(content: string) {
  const trimmed = content.replace(/^\uFEFF/, '').trim()
  if (!trimmed) return { findings: [] as ParsedFinding[], invalidCount: 0, totalCount: 0 }

  const candidates: unknown[] = []
  let invalidCount = 0
  let totalCount = 0
  if (trimmed.startsWith('[')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error('Unable to parse file. Ensure it contains valid Nuclei JSON or JSONL.')
    }
    if (!Array.isArray(parsed)) throw new Error('Nuclei JSON must contain an object or array of findings.')
    candidates.push(...parsed)
    totalCount = parsed.length
  } else {
    for (const line of trimmed.split(/\r?\n/)) {
      const candidate = line.trim()
      if (!candidate) continue
      totalCount += 1
      try {
        candidates.push(JSON.parse(candidate))
      } catch {
        invalidCount += 1
      }
    }
  }

  const findings: ParsedFinding[] = []
  for (const candidate of candidates) {
    const normalized = normalizeFinding(candidate)
    if (normalized) findings.push(normalized)
    else invalidCount += 1
  }
  return { findings, invalidCount, totalCount }
}
