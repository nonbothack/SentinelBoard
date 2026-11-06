import { useMemo } from 'react'
import { SeverityBadge } from '@/components/ioc/SeverityBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ScanFinding } from '@/types/database'

export function FindingsTable({ findings, search = '' }: { findings: ScanFinding[]; search?: string }) {
  const groups = useMemo(() => {
    const filtered = findings.filter((finding) => {
      const query = search.trim().toLowerCase()
      if (!query) return true
      return [finding.host, finding.title, finding.description, finding.matched_at, ...(finding.cve_ids ?? [])]
        .some((value) => value?.toLowerCase().includes(query))
    })
    const byHost = new Map<string, ScanFinding[]>()
    for (const finding of filtered) {
      const hostFindings = byHost.get(finding.host) ?? []
      hostFindings.push(finding)
      byHost.set(finding.host, hostFindings)
    }
    return [...byHost.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [findings, search])

  if (groups.length === 0) {
    return <p className="border border-border-panel bg-bg-secondary p-4 text-sm text-text-secondary">No findings match this search.</p>
  }

  return (
    <div className="space-y-2">
      {groups.map(([host, hostFindings]) => (
        <details className="border border-border-default bg-bg-secondary" key={host}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 hover:bg-bg-tertiary">
            <span className="break-all font-mono text-xs text-text-primary">{host}</span>
            <span className="shrink-0 font-mono text-[10px] text-text-tertiary">{hostFindings.length} {hostFindings.length === 1 ? 'finding' : 'findings'}</span>
          </summary>
          <div className="overflow-x-auto border-t border-border-subtle">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20 px-3 py-1.5">Port</TableHead>
                  <TableHead className="w-28 px-3 py-1.5">Severity</TableHead>
                  <TableHead className="px-3 py-1.5">Finding</TableHead>
                  <TableHead className="min-w-40 px-3 py-1.5">CVE IDs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hostFindings.map((finding) => (
                  <TableRow key={finding.id}>
                    <TableCell className="px-3 py-1.5 font-mono text-xs">{finding.port ?? '—'}</TableCell>
                    <TableCell className="px-3 py-1.5"><SeverityBadge severity={finding.severity} /></TableCell>
                    <TableCell className="min-w-64 px-3 py-1.5">
                      <p className="text-xs font-medium text-text-primary">{finding.title}</p>
                      {finding.description && <p className="mt-1 line-clamp-3 text-[10px] leading-4 text-text-secondary">{finding.description}</p>}
                      {finding.matched_at && <p className="mt-1 break-all font-mono text-[10px] text-text-tertiary">Matched at: {finding.matched_at}</p>}
                      {(finding.reference_urls ?? []).length > 0 && <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">{(finding.reference_urls ?? []).map((reference) => <a className="text-[10px] text-accent-primary hover:underline" href={reference} key={reference} rel="noreferrer" target="_blank">Reference</a>)}</div>}
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      {(finding.cve_ids ?? []).length === 0 ? <span className="text-xs text-text-tertiary">—</span> : (
                        <ul className="space-y-1">
                          {(finding.cve_ids ?? []).map((cve) => (
                            <li key={cve}><a className="font-mono text-[10px] text-accent-primary hover:underline" href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve)}`} rel="noreferrer" target="_blank">{cve}</a></li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      ))}
    </div>
  )
}
