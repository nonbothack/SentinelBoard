import { useMemo } from 'react'
import { SeverityChart } from '@/components/scan/SeverityChart'
import { FindingsTable } from '@/components/scan/FindingsTable'
import { SeverityBadge } from '@/components/ioc/SeverityBadge'
import { Skeleton } from '@/components/ui/skeleton'
import type { CisaKevMatch } from '@/lib/cisa-kev'
import type { ScanFinding, ScanUpload, Severity } from '@/types/database'

interface ScanResultsViewProps {
  upload: ScanUpload
  findings: ScanFinding[]
  search: string
  loading: boolean
  error: boolean
  onRetry: () => void
  kevByCve: ReadonlyMap<string, CisaKevMatch>
  kevLoading: boolean
  kevError: boolean
  kevCatalogMissing: boolean
  kevCatalogVersion: string | null
}

const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

export function ScanResultsView({ upload, findings, search, loading, error, onRetry, kevByCve, kevLoading, kevError, kevCatalogMissing, kevCatalogVersion }: ScanResultsViewProps) {
  const counts = useMemo(() => Object.fromEntries(severityOrder.map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length])) as Record<Severity, number>, [findings])
  const hasFindings = findings.length > 0

  return (
    <article className="space-y-3 p-3" aria-labelledby="scan-results-title">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-panel pb-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-wide text-text-tertiary">{upload.file_type.replaceAll('_', ' ')}</p>
          <h2 id="scan-results-title" className="mt-1 break-all text-sm font-semibold">{upload.filename}</h2>
        </div>
        <span className="text-xs text-text-secondary">{upload.total_findings ?? findings.length} findings</span>
      </header>

      {loading && upload.parse_status === 'complete' ? (
        <div className="space-y-3" aria-label="Loading finding summary"><Skeleton className="h-7 w-full" /><Skeleton className="h-20 w-full" /></div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Finding severity totals">
            {severityOrder.map((severity) => <span className="flex items-center gap-1 text-[10px] text-text-secondary" key={severity}><SeverityBadge severity={severity} /> {counts[severity]}</span>)}
          </div>
          <SeverityChart findings={findings} />
        </>
      )}

      {kevLoading && <p className="text-xs text-text-tertiary" role="status">Checking CVE identifiers against the CISA KEV catalog…</p>}
      {kevError && <p className="border-l-4 border-severity-medium bg-bg-secondary p-2 text-xs text-text-secondary" role="status">CISA KEV status is unavailable right now; scan severity has not been changed.</p>}
      {kevCatalogMissing && <p className="border-l-4 border-severity-medium bg-bg-secondary p-2 text-xs text-text-secondary" role="status">The CISA KEV catalog has not been synced yet. Catalog matching will appear after setup.</p>}
      {kevCatalogVersion && <p className="text-[10px] text-text-tertiary">CVE checks use CISA KEV catalog {kevCatalogVersion}.</p>}

      {upload.parse_status === 'error' ? (
        <div className="border-l-4 border-severity-critical bg-bg-secondary p-3 text-sm" role="alert">
          {upload.parse_error ?? 'This scan could not be processed.'}
        </div>
      ) : upload.parse_status !== 'complete' ? (
        <div className="border-l-4 border-status-pending bg-bg-secondary p-3 text-sm text-text-secondary" role="status">
          Scan processing status: {upload.parse_status}.
        </div>
      ) : loading ? (
        <div className="space-y-2" aria-label="Loading findings">{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-12 w-full" key={index} />)}</div>
      ) : error ? (
        <div className="border-l-4 border-severity-critical bg-bg-secondary p-3 text-sm" role="alert">
          <p>Scan findings could not be loaded.</p>
          <button className="mt-2 text-xs text-accent-primary underline" onClick={onRetry} type="button">Retry</button>
        </div>
      ) : !hasFindings ? (
        <div className="border border-border-panel bg-bg-secondary p-4 text-sm text-text-secondary">No findings in this scan. The file parsed successfully and contained no results.</div>
      ) : (
        <section aria-label="Scan findings by host" className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Findings by host</h3>
          <FindingsTable findings={findings} kevByCve={kevByCve} search={search} />
        </section>
      )}
    </article>
  )
}
