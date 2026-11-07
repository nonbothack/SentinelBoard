import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Toaster } from '@/components/ui/sonner'
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const IOCEnrichmentPage = lazy(() => import('@/pages/IOCEnrichmentPage').then((module) => ({ default: module.IOCEnrichmentPage })))
const EventFeedPage = lazy(() => import('@/pages/EventFeedPage').then((module) => ({ default: module.EventFeedPage })))
const AttackMapPage = lazy(() => import('@/pages/AttackMapPage').then((module) => ({ default: module.AttackMapPage })))
const ScanResultsPage = lazy(() => import('@/pages/ScanResultsPage').then((module) => ({ default: module.ScanResultsPage })))
const IncidentsPage = lazy(() => import('@/pages/IncidentsPage').then((module) => ({ default: module.IncidentsPage })))
const LoginPage = lazy(() => import('@/pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const SignupPage = lazy(() => import('@/pages/SignupPage').then((module) => ({ default: module.SignupPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))

function PageLoading() {
  return (
    <div className="space-y-3 p-4" aria-label="Loading page" role="status">
      <div className="h-5 w-40 animate-pulse rounded bg-bg-tertiary" />
      <div className="h-11 w-full animate-pulse rounded bg-bg-tertiary" />
      <div className="h-56 w-full animate-pulse rounded bg-bg-tertiary" />
      <span className="sr-only">Loading page</span>
    </div>
  )
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoading />}>{children}</Suspense>
}

function AuthOnlyRoute() {
  const { user, loading } = useAuth()

  if (loading) return <RouteLoading />
  if (user) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
      <div aria-label="Loading session" className="w-full max-w-sm space-y-3" role="status">
        <div className="h-8 animate-pulse rounded-md bg-bg-tertiary" />
        <div className="h-4 w-2/3 animate-pulse rounded-md bg-bg-tertiary" />
        <span className="sr-only">Loading session</span>
      </div>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthOnlyRoute />}>
        <Route path="/login" element={<LazyPage><LoginPage /></LazyPage>} />
        <Route path="/signup" element={<LazyPage><SignupPage /></LazyPage>} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<LazyPage><DashboardPage /></LazyPage>} />
          <Route path="ioc" element={<LazyPage><IOCEnrichmentPage /></LazyPage>} />
          <Route path="events" element={<LazyPage><EventFeedPage /></LazyPage>} />
          <Route path="attack" element={<LazyPage><AttackMapPage /></LazyPage>} />
          <Route path="scans" element={<LazyPage><ScanResultsPage /></LazyPage>} />
          <Route path="incidents" element={<LazyPage><IncidentsPage /></LazyPage>} />
          <Route path="settings" element={<LazyPage><SettingsPage /></LazyPage>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
