import { Outlet, useLocation } from 'react-router-dom'
import { CommandBar } from '@/components/CommandBar'
import { Sidebar } from '@/components/Sidebar'

const placeholders: Record<string, string> = {
  '/dashboard': 'Search IOCs, events, incidents...',
  '/ioc': 'Search IOCs...',
  '/events': 'Filter events...',
  '/attack': 'Search techniques...',
  '/scans': 'Search scan findings...',
  '/incidents': 'Search incidents...',
  '/settings': 'Search settings...',
}

export function Layout() {
  const { pathname } = useLocation()

  return (
    <div className="flex h-screen min-h-[480px] overflow-hidden bg-bg-primary text-text-primary">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {pathname !== '/ioc' && pathname !== '/events' && pathname !== '/attack' && pathname !== '/scans' && pathname !== '/incidents' && <CommandBar placeholder={placeholders[pathname] ?? 'Search SentinelBoard...'} />}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
