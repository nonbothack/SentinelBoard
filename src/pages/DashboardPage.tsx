import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, FileSearch, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatCard } from '@/components/dashboard/StatCard'
import { RecentEventsList } from '@/components/dashboard/RecentEventsList'
import { RecentIncidentsList } from '@/components/dashboard/RecentIncidentsList'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Event as SecurityEvent, Incident } from '@/types/database'

interface DashboardData {
  counts: {
    events24h: number
    criticalEvents: number
    activeIncidents: number
    enrichedIocs: number
    scanFindings: number
  }
  recentEvents: SecurityEvent[]
  recentIncidents: Incident[]
}

function ensureSuccess(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

async function fetchDashboardData(): Promise<DashboardData> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [events24h, criticalEvents, activeIncidents, enrichedIocs, scanFindings, recentEvents, recentIncidents] = await Promise.all([
    supabase.from('events').select('id', { count: 'exact', head: true }).gte('event_time', since),
    supabase.from('events').select('id', { count: 'exact', head: true }).eq('severity', 'critical'),
    supabase.from('incidents').select('id', { count: 'exact', head: true }).in('status', ['open', 'investigating', 'contained']),
    supabase.from('iocs').select('id, ioc_enrichments!inner(id)', { count: 'exact', head: true }),
    supabase.from('scan_findings').select('id', { count: 'exact', head: true }),
    supabase.from('events').select('*').order('event_time', { ascending: false }).limit(15),
    supabase.from('incidents').select('*').order('updated_at', { ascending: false }).limit(5),
  ])

  for (const result of [events24h, criticalEvents, activeIncidents, enrichedIocs, scanFindings, recentEvents, recentIncidents]) {
    ensureSuccess(result.error)
  }

  return {
    counts: {
      events24h: events24h.count ?? 0,
      criticalEvents: criticalEvents.count ?? 0,
      activeIncidents: activeIncidents.count ?? 0,
      enrichedIocs: enrichedIocs.count ?? 0,
      scanFindings: scanFindings.count ?? 0,
    },
    recentEvents: (recentEvents.data ?? []) as SecurityEvent[],
    recentIncidents: (recentIncidents.data ?? []) as Incident[],
  }
}

export function DashboardPage() {
  const { user } = useAuth()
  const dashboard = useQuery({
    queryKey: ['dashboard', user?.id],
    queryFn: fetchDashboardData,
    enabled: Boolean(user),
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const data = dashboard.data
  const cards = [
    { label: 'Events · last 24h', value: data?.counts.events24h, icon: Activity },
    { label: 'Critical events', value: data?.counts.criticalEvents, icon: AlertTriangle },
    { label: 'Active incidents', value: data?.counts.activeIncidents, icon: ShieldAlert },
    { label: 'IOCs enriched', value: data?.counts.enrichedIocs, icon: ShieldCheck },
    { label: 'Scan findings', value: data?.counts.scanFindings, icon: FileSearch },
  ]

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3" aria-labelledby="dashboard-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-text-tertiary">Overview</p>
          <h1 id="dashboard-title" className="mt-1 text-xl font-semibold">Dashboard</h1>
        </div>
        <span className="hidden text-xs text-text-tertiary sm:inline">Counts use your authenticated workspace data.</span>
      </div>

      {dashboard.isError && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-l-4 border-severity-critical bg-bg-secondary p-3 text-sm" role="alert">
          <span>Dashboard data could not be loaded. Check your connection and try again.</span>
          <Button onClick={() => void dashboard.refetch()} size="sm" variant="outline">Retry</Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <StatCard key={card.label} icon={card.icon} label={card.label} loading={dashboard.isPending} error={dashboard.isError && !data} value={card.value ?? 0} />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[3fr_2fr]">
        {dashboard.isPending ? (
          <>
            <section className="border border-border-default bg-bg-secondary p-3" aria-label="Loading recent events">
              <Skeleton className="mb-3 h-5 w-40" />
              <div className="space-y-2">{Array.from({ length: 5 }, (_, index) => <Skeleton className="h-8 w-full" key={index} />)}</div>
            </section>
            <section className="border border-border-default bg-bg-secondary p-3" aria-label="Loading recent incidents">
              <Skeleton className="mb-3 h-5 w-40" />
              <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <Skeleton className="h-8 w-full" key={index} />)}</div>
            </section>
          </>
        ) : dashboard.isError && !data ? (
          <p className="border border-border-default bg-bg-secondary p-6 text-sm text-text-secondary xl:col-span-2">
            Recent events and incidents are unavailable until the database connection recovers.
          </p>
        ) : (
          <>
            <RecentEventsList events={data?.recentEvents ?? []} />
            <RecentIncidentsList incidents={data?.recentIncidents ?? []} />
          </>
        )}
      </div>

      {!dashboard.isPending && data && data.counts.events24h === 0 && data.counts.activeIncidents === 0 && (
        <p className="mt-3 border border-border-panel bg-bg-secondary p-3 text-xs text-text-tertiary">
          This workspace has no recent telemetry yet. <Link className="text-accent-primary hover:underline" to="/events">Open the event feed</Link> to import or load clearly labeled sample events.
        </p>
      )}
    </div>
  )
}
