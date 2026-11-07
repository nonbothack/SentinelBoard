import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSearch } from 'lucide-react'
import { CommandBar } from '@/components/CommandBar'
import { ScanUploadArea } from '@/components/scan/ScanUploadArea'
import { ScanResultsView } from '@/components/scan/ScanResultsView'
import { SplitPane } from '@/components/SplitPane'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import type { CisaKevMatch } from '@/lib/cisa-kev'
import { formatRelativeTime } from '@/lib/format-time'
import { supabase } from '@/lib/supabase'
import type { ScanFinding, ScanUpload } from '@/types/database'

export function ScanResultsPage() {
  const [selectedId, setSelectedId] = useState<string>()
  const [search, setSearch] = useState('')
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const uploads = useQuery({
    queryKey: ['scan-uploads', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from('scan_uploads').select('*').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as ScanUpload[]
    },
  })

  const selectedUpload = (uploads.data ?? []).find((upload) => upload.id === selectedId) ?? uploads.data?.[0] ?? null
  const findings = useQuery({
    queryKey: ['scan-findings', user?.id, selectedUpload?.id],
    enabled: Boolean(user && selectedUpload),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scan_findings')
        .select('*')
        .eq('scan_upload_id', selectedUpload!.id)
        .order('host', { ascending: true })
        .order('severity', { ascending: true })
      if (error) throw error
      return (data ?? []) as ScanFinding[]
    },
  })

  const cveIds = useMemo(() => [...new Set((findings.data ?? []).flatMap((finding) => finding.cve_ids ?? []))].sort(), [findings.data])
  const kevEntries = useQuery({
    queryKey: ['cisa-kev-matches', cveIds],
    enabled: Boolean(user && findings.isSuccess && cveIds.length > 0),
    queryFn: async () => {
      const { data: catalog, error: catalogError } = await supabase
        .from('cisa_kev_entries')
        .select('catalog_version,catalog_released')
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (catalogError) throw catalogError
      if (!catalog) return { entries: [] as CisaKevMatch[], catalogVersion: null as string | null, catalogReleased: null as string | null }

      const matches: CisaKevMatch[] = []
      for (let offset = 0; offset < cveIds.length; offset += 100) {
        const { data, error } = await supabase
          .from('cisa_kev_entries')
          .select('cve_id,vendor_project,product,vulnerability_name,required_action,due_date,known_ransomware_campaign_use,catalog_version')
          .in('cve_id', cveIds.slice(offset, offset + 100))
        if (error) throw error
        matches.push(...(data ?? []) as CisaKevMatch[])
      }
      return { entries: matches, catalogVersion: catalog.catalog_version, catalogReleased: catalog.catalog_released }
    },
  })
  const kevByCve = useMemo(() => new Map((kevEntries.data?.entries ?? []).map((entry) => [entry.cve_id, entry])), [kevEntries.data])

  function handleUploaded(upload: ScanUpload) {
    setSelectedId(upload.id)
    void queryClient.invalidateQueries({ queryKey: ['scan-uploads', user?.id] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard', user?.id] })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CommandBar
        ariaLabel="Search scan findings"
        onSubmit={setSearch}
        onValueChange={setSearch}
        placeholder="Search findings by host, title, or CVE..."
      />
      <SplitPane
        leftWidth={350}
        leftContent={(
          <section aria-labelledby="scan-uploads-title">
            <header className="sticky top-0 z-[1] flex items-center justify-between gap-2 border-b border-border-panel bg-bg-surface px-3 py-2">
              <h2 id="scan-uploads-title" className="text-sm font-semibold">Scan uploads</h2>
              <ScanUploadArea onUploaded={handleUploaded} />
            </header>
            {uploads.isPending ? (
              <div className="space-y-2 p-3" aria-label="Loading scan uploads">{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-16 w-full" key={index} />)}</div>
            ) : uploads.isError ? (
              <div className="m-3 border-l-4 border-severity-critical bg-bg-secondary p-3 text-sm" role="alert">
                <p>Scan uploads could not be loaded.</p>
                <button className="mt-2 text-xs text-accent-primary underline" onClick={() => void uploads.refetch()} type="button">Retry</button>
              </div>
            ) : (uploads.data ?? []).length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <FileSearch aria-hidden="true" className="size-5 text-text-tertiary" />
                <p className="text-sm text-text-secondary">No scans uploaded yet.</p>
                <p className="text-xs text-text-tertiary">Upload a Nuclei JSON or JSONL result file to view its findings.</p>
              </div>
            ) : (
              <ul>
                {uploads.data.map((upload) => (
                  <li key={upload.id}>
                    <button aria-current={upload.id === selectedUpload?.id ? 'true' : undefined} className={`flex w-full flex-col gap-1 border-b border-border-subtle px-3 py-2 text-left hover:bg-bg-tertiary ${upload.id === selectedUpload?.id ? 'bg-bg-tertiary' : ''}`} onClick={() => setSelectedId(upload.id)} type="button">
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-text-primary">{upload.filename}</span>
                        <span className="shrink-0 rounded border border-border-default px-1.5 py-0.5 font-mono text-[9px] uppercase text-text-tertiary">{upload.file_type.replaceAll('_', ' ')}</span>
                      </span>
                      <span className="flex items-center justify-between text-[10px] text-text-tertiary">
                        <span>{upload.total_findings ?? 0} findings · {upload.parse_status}</span>
                        <span className="font-mono">{formatRelativeTime(upload.created_at)}</span>
                      </span>
                      {upload.parse_error && <span className="truncate text-[10px] text-severity-critical">{upload.parse_error}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        rightContent={selectedUpload ? (
          <ScanResultsView
            error={findings.isError}
            findings={findings.data ?? []}
            loading={findings.isPending}
            kevByCve={kevByCve}
            kevError={cveIds.length > 0 && kevEntries.isError}
            kevLoading={cveIds.length > 0 && kevEntries.isPending}
            kevCatalogMissing={Boolean(kevEntries.data && !kevEntries.data.catalogVersion)}
            kevCatalogVersion={kevEntries.data?.catalogVersion ?? null}
            onRetry={() => void findings.refetch()}
            search={search}
            upload={selectedUpload}
          />
        ) : undefined}
        rightEmptyState={(
          <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 p-6 text-center">
            <FileSearch aria-hidden="true" className="size-6 text-text-tertiary" />
            <p className="text-sm text-text-secondary">Select a scan upload to inspect findings.</p>
            <p className="text-xs text-text-tertiary">Upload a supported scan file to begin.</p>
          </div>
        )}
      />
    </div>
  )
}
