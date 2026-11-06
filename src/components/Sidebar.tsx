import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  FileSearch,
  LayoutDashboard,
  LogOut,
  Radio,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Target,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const primaryLinks = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/ioc', label: 'IOC Enrichment', icon: Search },
  { to: '/events', label: 'Event Feed', icon: Radio },
  { to: '/attack', label: 'ATT&CK Map', icon: Target },
  { to: '/scans', label: 'Scan Results', icon: FileSearch },
  { to: '/incidents', label: 'Incidents', icon: ShieldAlert },
]

function navItemClass(active: boolean) {
  return [
    'group flex h-10 items-center gap-3 overflow-hidden border-l-2 px-2 text-sm transition-colors',
    active
      ? 'border-l-[var(--accent-primary)] bg-bg-tertiary text-text-primary'
      : 'border-l-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
  ].join(' ')
}

export function Sidebar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  async function handleSignOut() {
    const { error: signOutError } = await signOut()
    if (signOutError) {
      setError('Sign out failed. Please try again.')
      return
    }
    navigate('/login', { replace: true })
  }

  return (
    <aside className="group/sidebar z-10 flex h-screen w-14 shrink-0 flex-col overflow-hidden border-r border-border-panel bg-bg-surface transition-[width] duration-150 hover:w-[200px] focus-within:w-[200px]">
      <div className="flex h-14 shrink-0 items-center gap-3 overflow-hidden px-4 text-text-primary" title="SentinelBoard">
        <ShieldCheck aria-hidden="true" className="size-5 shrink-0 text-accent-primary" />
        <span className="whitespace-nowrap text-sm font-semibold opacity-0 transition-opacity group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">SentinelBoard</span>
      </div>

      <nav aria-label="Primary navigation" className="flex flex-1 flex-col gap-1 px-2 py-2">
        {primaryLinks.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => navItemClass(isActive)} title={label}>
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            <span className="whitespace-nowrap opacity-0 transition-opacity group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">{label}</span>
          </NavLink>
        ))}
        <div className="my-2 h-px bg-border-panel" />
        <NavLink to="/settings" className={({ isActive }) => navItemClass(isActive)} title="Settings">
          <Settings aria-hidden="true" className="size-5 shrink-0" />
          <span className="whitespace-nowrap opacity-0 transition-opacity group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">Settings</span>
        </NavLink>
      </nav>

      <div className="border-t border-border-panel px-2 py-2">
        {error && <p className="px-2 pb-2 text-xs text-severity-critical" role="alert">{error}</p>}
        <button
          className="flex h-10 w-full items-center gap-3 overflow-hidden border-l-2 border-transparent px-2 text-left text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-50"
          onClick={() => void handleSignOut()}
          title={`Sign out${user?.email ? ` (${user.email})` : ''}`}
          type="button"
        >
          <LogOut aria-hidden="true" className="size-5 shrink-0" />
          <span className="whitespace-nowrap opacity-0 transition-opacity group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
