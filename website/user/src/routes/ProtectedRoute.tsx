import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

/** Redirects unauthenticated visitors to /login, remembering where they were going. */
export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Sends already-signed-in users away from auth pages. */
export function GuestOnlyRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  if (isAuthenticated) return <Navigate to={from?.startsWith('/student') ? from : '/student/dashboard'} replace />;
  return <Outlet />;
}
