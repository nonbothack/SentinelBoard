import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ProviderCard } from '@/components/ioc/ProviderCard'
import { SeverityBadge } from '@/components/ioc/SeverityBadge'
import { formatRelativeTime } from '@/lib/format-time'
import { supabase } from '@/lib/supabase'
import type { IOC, IOCEnrichment, IOCType } from '@/types/database'
import { calculateSeverity } from '@/lib/severity'

interface EnrichmentResultsProps {
  ioc: IOC
  cached?: boolean
  cachedHoursAgo?: number
  allProvidersFailed?: boolean
  refreshing?: boolean
  onRefresh: (ioc: IOC) => void
  onAddToIncident?: (ioc: IOC) => void
}

function providersFor(type: IOCType): IOCEnrichment['provider'][] {
  if (type === 'ip') return ['virustotal', 'abuseipdb', 'otx']
  if (type === 'url') return ['virustotal']
  return ['virustotal', 'otx']
}

export function EnrichmentResults({ ioc, cached = false, cachedHoursAgo = 0, allProvidersFailed = false, refreshing = false, onRefresh, onAddToIncident }: EnrichmentResultsProps) {
  const enrichments = useQuery({
    queryKey: ['ioc-enrichments', ioc.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ioc_enrichments')
        .select('*')
        .eq('ioc_id', ioc.id)
        .order('queried_at', { ascending: false })
        .limit(3)
      if (error) throw error
      const latestByProvider = new Map<string, IOCEnrichment>()
      for (const row of data ?? []) if (!latestByProvider.has(row.provider)) latestByProvider.set(row.provider, row as IOCEnrichment)
      return [...latestByProvider.values()].sort((left, right) => left.provider.localeCompare(right.provider))
    },
  })

  const expected = providersFor(ioc.type)
  const rows = enrichments.data ?? []
  const selected = expected.map((provider) => rows.find((row) => row.provider === provider)).filter((row): row is IOCEnrichment => Boolean(row))
  const failed = allProvidersFailed || (selected.length > 0 && selected.every((row) => row.status === 'error' || row.status === 'rate_limited'))
  const lastQueried = selected.reduce((latest, row) => Math.max(latest, new Date(row.queried_at).getTime()), 0)

  return (
    <section className="space-y-3" aria-labelledby="enrichment-results-title">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-panel pb-3">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-wide text-text-tertiary">{ioc.type.replace('hash_', '')}</p>
          <h2 id="enrichment-results-title" className="mt-1 break-all font-mono text-sm font-semibold text-text-primary">{ioc.value}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-secondary">Suggested</span>
          <SeverityBadge severity={calculateSeverity(selected)} />
          {onAddToIncident && <Button onClick={() => onAddToIncident(ioc)} size="sm" variant="outline">Add to incident</Button>}
          <Button disabled={refreshing} onClick={() => onRefresh(ioc)} size="sm" variant="outline">
            <RefreshCw aria-hidden="true" className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Re-enrich
          </Button>
        </div>
      </header>

      {cached && (
        <p className="flex items-center gap-2 text-xs text-text-secondary" role="status">
          <ShieldCheck aria-hidden="true" className="size-4 text-status-success" />
          Cached results from {cachedHoursAgo === 0 ? 'less than an hour ago' : `${cachedHoursAgo} ${cachedHoursAgo === 1 ? 'hour' : 'hours'} ago`}.
        </p>
      )}
      {!cached && lastQueried > 0 && <p className="text-xs text-text-tertiary">Last queried {formatRelativeTime(new Date(lastQueried).toISOString())}.</p>}

      {failed && (
        <p className="border-l-4 border-severity-critical bg-bg-secondary p-3 text-sm" role="alert">
          <AlertTriangle aria-hidden="true" className="mr-2 inline size-4" />
          All threat intelligence providers are currently unavailable. The IOC is saved; retry enrichment later.
        </p>
      )}

      {enrichments.isPending ? (
        <div className="space-y-3" aria-label="Loading enrichment results">
          {expected.map((provider) => <Skeleton className="h-32 w-full" key={provider} />)}
        </div>
      ) : enrichments.isError ? (
        <div className="border-l-4 border-severity-critical bg-bg-secondary p-3 text-sm" role="alert">
          <p>Enrichment results could not be loaded.</p>
          <Button className="mt-2" onClick={() => void enrichments.refetch()} size="sm" variant="outline">Retry</Button>
        </div>
      ) : selected.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-text-secondary">
          <ShieldCheck aria-hidden="true" className="size-5 text-text-tertiary" />
          <p>No provider results are available yet.</p>
        </div>
      ) : (
        <div className="space-y-3">{selected.map((row) => <ProviderCard enrichment={row} key={row.id} />)}</div>
      )}
    </section>
  )
}
