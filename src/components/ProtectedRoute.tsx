import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
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

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}
