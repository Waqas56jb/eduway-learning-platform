import { RotateCw, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button, LogoMark } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { safeReturnPath } from '@/lib/plans';

function SessionLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream" role="status" aria-live="polite">
      <LogoMark className="h-12 w-12 animate-pulse" />
    </div>
  );
}

/** /auth/me failed for a non-auth reason (offline, 5xx): offer a retry instead of dropping the session. */
function SessionError() {
  const { t } = useTranslation();
  const { retry, logout } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-6 text-center" role="alert">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <WifiOff className="h-7 w-7" aria-hidden />
      </span>
      <h1 className="text-2xl font-bold text-primary">{t('system.session.errorTitle')}</h1>
      <p className="max-w-md text-muted">{t('system.session.errorBody')}</p>
      <div className="flex gap-3">
        <Button variant="gold" onClick={retry} leftIcon={<RotateCw className="h-4 w-4" aria-hidden />}>
          {t('errors.retry')}
        </Button>
        <Button variant="ghost" onClick={() => void logout()}>
          {t('student.nav.logout')}
        </Button>
      </div>
    </div>
  );
}

/** Redirects unauthenticated visitors to /login, remembering where they were going. */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <SessionLoading />;
  if (status === 'error') return <SessionError />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** Sends already-signed-in users away from auth pages. */
export function GuestOnlyRoute() {
  const { status } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  if (status === 'loading') return <SessionLoading />;
  if (status === 'authenticated') return <Navigate to={safeReturnPath(from) ?? '/student/dashboard'} replace />;
  return <Outlet />;
}
