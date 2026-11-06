import { useQuery } from '@tanstack/react-query'
import { ArrowUp, Search } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { SeverityBadge } from '@/components/ioc/SeverityBadge'
import { useAuth } from '@/contexts/AuthContext'
import { formatRelativeTime } from '@/lib/format-time'
import { supabase } from '@/lib/supabase'
import type { IOC, IOCType } from '@/types/database'

interface IOCHistoryTableProps {
  selectedId?: string
  onSelect: (ioc: IOC) => void
  onStartIOC: () => void
}

const typeLabel: Record<IOCType, string> = {
  ip: 'IP',
  domain: 'Domain',
  url: 'URL',
  hash_md5: 'MD5',
  hash_sha256: 'SHA256',
}

export function IOCHistoryTable({ selectedId, onSelect, onStartIOC }: IOCHistoryTableProps) {
  const { user } = useAuth()
  const history = useQuery({
    queryKey: ['ioc-history', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('iocs')
        .select('*, ioc_enrichments!inner(id)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as IOC[]
    },
  })

  return (
    <section aria-labelledby="ioc-history-title">
      <header className="sticky top-0 z-[1] flex items-center justify-between border-b border-border-panel bg-bg-surface px-3 py-2">
        <h2 id="ioc-history-title" className="text-sm font-semibold">IOC history</h2>
        <span className="font-mono text-xs text-text-tertiary">{history.data?.length ?? 0}</span>
      </header>

      {history.isPending ? (
        <div className="space-y-2 p-3" aria-label="Loading IOC history">
          {Array.from({ length: 5 }, (_, index) => <Skeleton className="h-14 w-full" key={index} />)}
        </div>
      ) : history.isError ? (
        <div className="m-3 border-l-4 border-severity-critical bg-bg-secondary p-3 text-sm" role="alert">
          <p>IOC history could not be loaded.</p>
          <button className="mt-2 text-xs text-accent-primary underline" onClick={() => void history.refetch()} type="button">Retry</button>
        </div>
      ) : history.data.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center">
          <Search aria-hidden="true" className="size-5 text-text-tertiary" />
          <p className="text-sm text-text-secondary">No enriched IOCs yet.</p>
          <p className="text-xs text-text-tertiary">Submit an IP, domain, URL, or file hash above.</p>
          <Button className="mt-1" onClick={onStartIOC} size="sm" variant="outline"><ArrowUp aria-hidden="true" className="size-3.5" />Enter an IOC</Button>
        </div>
      ) : (
        <ul>
          {history.data.map((ioc) => (
            <li key={ioc.id}>
              <button
                aria-current={ioc.id === selectedId ? 'true' : undefined}
                className={`flex w-full min-w-0 flex-col gap-1 border-b border-border-subtle px-3 py-2 text-left transition-colors hover:bg-bg-tertiary ${ioc.id === selectedId ? 'bg-bg-tertiary' : ''}`}
                onClick={() => onSelect(ioc)}
                type="button"
              >
                <span className="flex w-full min-w-0 items-center gap-2">
                  <span className="rounded border border-border-default px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">{typeLabel[ioc.type]}</span>
                  {ioc.severity ? <SeverityBadge severity={ioc.severity} /> : <span className="text-[10px] text-text-tertiary">Review pending</span>}
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-text-tertiary">{formatRelativeTime(ioc.created_at)}</span>
                </span>
                <span className="block w-full truncate font-mono text-xs text-text-primary">{ioc.value}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
