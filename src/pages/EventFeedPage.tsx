import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CommandBar } from '@/components/CommandBar'
import { EventDetailPanel } from '@/components/events/EventDetailPanel'
import { EventFilters } from '@/components/events/EventFilters'
import { EventList } from '@/components/events/EventList'
import { ImportEventsDialog } from '@/components/events/ImportEventsDialog'
import { SplitPane } from '@/components/SplitPane'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Event, Severity } from '@/types/database'

export function EventFeedPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [keyword, setKeyword] = useState('')
  const [selectedSeverities, setSelectedSeverities] = useState<Severity[]>([])
  const [category, setCategory] = useState('')
  const [source, setSource] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [realtime, setRealtime] = useState<'connecting' | 'live' | 'disconnected'>('connecting')
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const events = useQuery({
    queryKey: ['events', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('event_time', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as Event[]
    },
  })

  const selectedEventId = searchParams.get('event')
  const selectedEvent = events.data?.find((event) => event.id === selectedEventId) ?? null

  useEffect(() => {
    if (!user?.id) return
    let wasConnected = false
    let hadConnectionFailure = false
    const channel = supabase
      .channel(`events-feed-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'events',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const inserted = payload.new as Event
        queryClient.setQueryData<Event[]>(['events', user.id], (previous = []) => {
          if (previous.some((event) => event.id === inserted.id)) return previous
          return [inserted, ...previous].sort((left, right) => Date.parse(right.event_time) - Date.parse(left.event_time)).slice(0, 500)
        })
        void queryClient.invalidateQueries({ queryKey: ['dashboard', user.id] })
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          const reconnected = hadConnectionFailure
          wasConnected = true
          hadConnectionFailure = false
          setRealtime('live')
          // Reconcile after every successful subscription: Realtime does not replay
          // events received while this tab was offline or the socket was reconnecting.
          void queryClient.invalidateQueries({ queryKey: ['events', user.id] })
          void queryClient.invalidateQueries({ queryKey: ['dashboard', user.id] })
          if (reconnected) toast.info('Live connection restored. Refreshing recent events…')
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (wasConnected) hadConnectionFailure = true
          setRealtime('disconnected')
          if (wasConnected) toast.info('Reconnecting to the live event feed…')
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient, user?.id])

  useEffect(() => {
    if (!user?.id) return
    const recover = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void queryClient.invalidateQueries({ queryKey: ['events', user.id] })
        void queryClient.invalidateQueries({ queryKey: ['dashboard', user.id] })
      }
    }
    window.addEventListener('online', recover)
    window.addEventListener('focus', recover)
    document.addEventListener('visibilitychange', recover)
    return () => {
      window.removeEventListener('online', recover)
      window.removeEventListener('focus', recover)
      document.removeEventListener('visibilitychange', recover)
    }
  }, [queryClient, user?.id])

  const visibleEvents = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    const lowerBound = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY
    const upperBound = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY
    return (events.data ?? []).filter((event) => {
      if (selectedSeverities.length > 0 && !selectedSeverities.includes(event.severity)) return false
      if (category && event.category !== category) return false
      if (source && event.source !== source) return false
      const eventTime = Date.parse(event.event_time)
      if (eventTime < lowerBound || eventTime > upperBound) return false
      if (query && ![event.title, event.description, event.source, event.category, event.hostname, event.source_ip, event.dest_ip].some((field) => field?.toLowerCase().includes(query))) return false
      return true
    })
  }, [category, events.data, fromDate, keyword, selectedSeverities, source, toDate])

  function refreshEvents() {
    void queryClient.invalidateQueries({ queryKey: ['events', user?.id] })
    toast.success('Event list refreshed.')
  }

  function selectEvent(event: Event) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('event', event.id)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CommandBar
        ariaLabel="Filter events by keyword"
        onSubmit={(value) => setKeyword(value)}
        onValueChange={setKeyword}
        placeholder="Filter events by keyword..."
      />
      <EventFilters
        category={category}
        fromDate={fromDate}
        onCategoryChange={setCategory}
        onFromDateChange={setFromDate}
        onSourceChange={setSource}
        onToDateChange={setToDate}
        onToggleSeverity={(severity) => setSelectedSeverities((current) => current.includes(severity)
          ? current.filter((item) => item !== severity)
          : [...current, severity])}
        selectedSeverities={selectedSeverities}
        source={source}
        toDate={toDate}
      />
      <SplitPane
        leftWidth={400}
        leftContent={(
          <EventList
            error={events.isError}
            events={visibleEvents}
            emptyMessage={(events.data?.length ?? 0) > 0 ? 'No events match these filters.' : 'No security events yet.'}
            headerAction={(
              <>
                <span className="inline-flex items-center gap-1 text-[10px] text-text-secondary" aria-live="polite">
                  <span aria-hidden="true" className={`size-1.5 rounded-full ${realtime === 'live' ? 'bg-status-success' : realtime === 'connecting' ? 'bg-status-pending' : 'bg-severity-critical'}`} />
                  {realtime === 'live' ? 'Live' : realtime === 'connecting' ? 'Connecting' : 'Disconnected'}
                </span>
                <ImportEventsDialog onImported={refreshEvents} />
              </>
            )}
            loading={events.isPending}
            onRetry={() => void events.refetch()}
            onSelect={selectEvent}
            selectedId={selectedEvent?.id}
          />
        )}
        rightContent={selectedEvent ? <EventDetailPanel event={selectedEvent} /> : undefined}
        rightEmptyState={(
          <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm text-text-secondary">Select an event to inspect its details.</p>
            <p className="text-xs text-text-tertiary">Use Import to load the sample dataset or bring in your own JSON events.</p>
          </div>
        )}
      />
    </div>
  )
}
