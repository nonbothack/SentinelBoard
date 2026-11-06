export type CalculatedSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface SeverityEnrichment {
  provider: string
  status?: string
  summary: unknown
}

function numeric(summary: Record<string, unknown> | null, key: string) {
  const value = Number(summary?.[key] ?? 0)
  return Number.isFinite(value) ? value : 0
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function calculateSeverity(enrichments: readonly SeverityEnrichment[]): CalculatedSeverity {
  const summaries = new Map(enrichments
    .filter((enrichment) => !enrichment.status || enrichment.status === 'success')
    .map((enrichment) => [enrichment.provider, record(enrichment.summary)]))
  const malicious = numeric(summaries.get('virustotal') ?? null, 'malicious')
  const totalEngines = numeric(summaries.get('virustotal') ?? null, 'total_engines')
  const detectionRatio = totalEngines > 0 ? malicious / totalEngines : 0
  const confidence = numeric(summaries.get('abuseipdb') ?? null, 'confidence_score')
  const pulseCount = numeric(summaries.get('otx') ?? null, 'pulse_count')

  if (malicious > 0 && detectionRatio > 0.2) return 'critical'
  if (malicious > 0 || confidence > 75) return 'high'
  if (detectionRatio > 0.05 || confidence > 25 || pulseCount > 10) return 'medium'
  if (detectionRatio > 0 || pulseCount > 0) return 'low'
  return 'info'
}
