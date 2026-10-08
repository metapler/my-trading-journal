import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/** Gate: initializing → spinner; anonymous → /login (remembers origin); authed → content. */
export function RequireAuth() {
  const { user, initializing } = useAuth()
  const location = useLocation()
  if (initializing) {
    return (
      <div className="flex min-h-[50svh] items-center justify-center" role="status" aria-label="Loading">
        <p className="text-sm text-[var(--text-secondary)]">Checking session…</p>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}
