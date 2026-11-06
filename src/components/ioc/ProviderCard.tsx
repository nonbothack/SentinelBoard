import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from 'lucide-react'
import type { IOCEnrichment } from '@/types/database'

const providerNames: Record<IOCEnrichment['provider'], string> = {
  virustotal: 'VirusTotal',
  abuseipdb: 'AbuseIPDB',
  otx: 'AlienVault OTX',
}

function findings(enrichment: IOCEnrichment) {
  const summary = enrichment.summary && typeof enrichment.summary === 'object' && !Array.isArray(enrichment.summary)
    ? enrichment.summary as Record<string, unknown>
    : {}

  if (enrichment.provider === 'virustotal') {
    return [
      ['Detection ratio', summary.detection_ratio],
      ['Malicious', summary.malicious],
      ['Suspicious', summary.suspicious],
      ['Harmless', summary.harmless],
      ['Undetected', summary.undetected],
      ['Reputation', summary.reputation],
    ] as Array<[string, unknown]>
  }
  if (enrichment.provider === 'abuseipdb') {
    return [
      ['Confidence score', summary.confidence_score],
      ['Total reports', summary.total_reports],
      ['Country', summary.country_code],
      ['Tor exit node', summary.is_tor === true ? 'Yes' : summary.is_tor === false ? 'No' : undefined],
      ['Public IP', summary.is_public === true ? 'Yes' : summary.is_public === false ? 'No' : undefined],
      ['Usage type', summary.usage_type],
    ] as Array<[string, unknown]>
  }
  return [
    ['Threat pulses', summary.pulse_count],
    ['Reputation', summary.reputation],
    ['Country', summary.country],
    ['Tags', Array.isArray(summary.tags) ? summary.tags.join(', ') : summary.tags],
  ] as Array<[string, unknown]>
}

function StatusIcon({ status }: { status: IOCEnrichment['status'] }) {
  if (status === 'success') return <CheckCircle2 aria-hidden="true" className="size-4 text-status-success" />
  if (status === 'pending') return <CircleDashed aria-hidden="true" className="size-4 animate-pulse text-status-pending" />
  if (status === 'rate_limited') return <AlertTriangle aria-hidden="true" className="size-4 text-severity-medium" />
  return <XCircle aria-hidden="true" className="size-4 text-severity-critical" />
}

export function ProviderCard({ enrichment }: { enrichment: IOCEnrichment }) {
  const fields = findings(enrichment).filter(([, value]) => value !== undefined && value !== null && value !== '')
  const message = enrichment.status === 'rate_limited'
    ? enrichment.error_message ?? 'Rate limited — try again in 60 seconds.'
    : enrichment.status === 'not_found'
      ? enrichment.error_message ?? 'No public data found for this IOC.'
      : enrichment.status === 'error'
        ? enrichment.error_message ?? 'Provider request failed.'
        : enrichment.status === 'pending'
          ? enrichment.error_message ?? 'Analysis is still processing. Try again shortly.'
          : ''

  return (
    <section className="rounded-md border border-border-default bg-bg-secondary" aria-label={`${providerNames[enrichment.provider]} result`}>
      <header className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="flex items-center gap-2">
          <StatusIcon status={enrichment.status} />
          <h3 className="text-sm font-semibold">{providerNames[enrichment.provider]}</h3>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-secondary">{enrichment.status.replace('_', ' ')}</span>
      </header>
      <div className="space-y-3 p-3">
        {message && (
          <p className={`border-l-4 p-2 text-xs ${enrichment.status === 'rate_limited' ? 'border-severity-medium' : 'border-severity-critical'}`} role="status">
            {message}
          </p>
        )}
        {fields.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {fields.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">{label}</dt>
                <dd className="break-words font-mono text-xs text-text-primary">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
        {enrichment.raw_response !== null && (
          <details className="border-t border-border-subtle pt-2">
            <summary className="cursor-pointer text-xs text-text-secondary hover:text-text-primary">Raw provider response</summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-bg-primary p-2 font-mono text-[10px] text-text-secondary">{JSON.stringify(enrichment.raw_response, null, 2)}</pre>
          </details>
        )}
      </div>
    </section>
  )
}
