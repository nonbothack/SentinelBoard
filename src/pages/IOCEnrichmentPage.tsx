import { useState } from 'react'
import { ArrowUp, Clipboard } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { IOCForm } from '@/components/ioc/IOCForm'
import type { EnrichmentResponse } from '@/components/ioc/IOCForm'
import { EnrichmentResults } from '@/components/ioc/EnrichmentResults'
import { IOCHistoryTable } from '@/components/ioc/IOCHistoryTable'
import { SplitPane } from '@/components/SplitPane'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { IOC } from '@/types/database'

export function IOCEnrichmentPage() {
  const [selectedIOC, setSelectedIOC] = useState<IOC | null>(null)
  const [resultMeta, setResultMeta] = useState<Pick<EnrichmentResponse, 'cached' | 'cachedHoursAgo' | 'allProvidersFailed'> | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [actionError, setActionError] = useState('')
  const queryClient = useQueryClient()
  const { user } = useAuth()

  function handleEnriched(result: EnrichmentResponse) {
    setSelectedIOC(result.ioc)
    setResultMeta(result)
    setActionError('')
    void queryClient.invalidateQueries({ queryKey: ['ioc-history', user?.id] })
    void queryClient.invalidateQueries({ queryKey: ['ioc-enrichments', result.ioc.id] })
    if (!result.allProvidersFailed) toast.success(result.cached ? 'Cached enrichment results loaded.' : 'IOC enrichment complete.')
  }

  async function refreshIOC(ioc: IOC) {
    setRefreshing(true)
    try {
      const { data, error } = await supabase.functions.invoke('enrich-ioc', {
        body: { type: ioc.type, value: ioc.value, force: true },
      })
      if (error || !data || typeof data !== 'object' || !('ioc' in data)) {
        setActionError('Re-enrichment failed. Check the connection and try again.')
        return
      }
      handleEnriched(data as EnrichmentResponse)
    } catch {
      setActionError('Re-enrichment failed. Check the connection and try again.')
    } finally {
      setRefreshing(false)
    }
  }

  async function copyIOC() {
    if (!selectedIOC) return
    try {
      await navigator.clipboard.writeText(selectedIOC.value)
      setActionError('')
      toast.success('IOC copied to clipboard.')
    } catch {
      setActionError('Could not copy the IOC. Check clipboard permissions.')
    }
  }

  function focusIOCInput() {
    document.querySelector<HTMLInputElement>('input[aria-label="Indicator of compromise value"]')?.focus()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <IOCForm onEnriched={handleEnriched} />
      <SplitPane
        leftWidth={350}
        leftContent={<IOCHistoryTable onSelect={(ioc) => { setSelectedIOC(ioc); setResultMeta(null) }} onStartIOC={focusIOCInput} selectedId={selectedIOC?.id} />}
        rightContent={selectedIOC ? (
          <article className="min-h-full space-y-4 p-3" aria-labelledby="enrichment-results-title">
            {actionError && <p className="border-l-4 border-severity-critical bg-bg-secondary p-3 text-sm" role="alert">{actionError}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-text-secondary">Submitted {new Date(selectedIOC.created_at).toLocaleString()}</p>
              <button className="inline-flex items-center gap-2 rounded-md border border-border-default px-3 py-2 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary" onClick={() => void copyIOC()} type="button">
                <Clipboard aria-hidden="true" className="size-4" />
                Copy IOC
              </button>
            </div>
            {selectedIOC.severity && <p className="text-xs text-text-secondary">Analyst-assessed severity: {selectedIOC.severity}</p>}
            <EnrichmentResults
              allProvidersFailed={resultMeta?.allProvidersFailed}
              cached={resultMeta?.cached}
              cachedHoursAgo={resultMeta?.cachedHoursAgo}
              ioc={selectedIOC}
              onRefresh={refreshIOC}
              refreshing={refreshing}
            />
          </article>
        ) : undefined}
        rightEmptyState={(
          <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 p-6 text-center">
            <Clipboard aria-hidden="true" className="size-6 text-text-tertiary" />
            <p className="text-sm text-text-secondary">Select an IOC to view its enrichment details.</p>
            <Button onClick={focusIOCInput} size="sm" variant="outline"><ArrowUp aria-hidden="true" className="size-3.5" />Enter an IOC</Button>
          </div>
        )}
      />
    </div>
  )
}
