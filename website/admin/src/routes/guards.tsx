import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import type { ModuleKey, PermAction } from '@/types';
import { useAuth, useCan, useCurrentRole } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { Button, ButtonLink } from '@/components/ui/Button';
import { adminMeApi, authApi } from '@/api/auth';
import { qk } from '@/api/keys';
import { errorMessage, isApiError } from '@/api/client';
import { Logo } from '@/components/layout/Logo';

/** Loads GET /auth/me for the stored session (permissions, role, preferences). */
function useBootstrapMe() {
  const stage = useAuth((s) => s.stage);
  const setMe = useAuth((s) => s.setMe);
  const logout = useAuth((s) => s.logout);
  const q = useQuery({ queryKey: qk.me, queryFn: authApi.me, enabled: stage === 'auth', staleTime: 60_000, meta: { silentError: true } });
  useEffect(() => {
    if (q.data) setMe(q.data);
  }, [q.data, setMe]);
  // Persist the language choice server-side (ADM-ME-04).
  const { i18n } = useTranslation();
  useEffect(() => {
    if (stage !== 'auth') return;
    const on = (lng: string) => {
      adminMeApi.preferences({ language: lng === 'ar' ? 'ar' : 'en' }).catch(() => undefined);
    };
    i18n.on('languageChanged', on);
    return () => i18n.off('languageChanged', on);
  }, [stage, i18n]);
  useEffect(() => {
    if (q.error && isApiError(q.error) && (q.error.status === 401 || q.error.status === 403)) logout({ silent: true });
  }, [q.error, logout]);
  return q;
}

function BootScreen({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-screen place-items-center bg-app px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="text-primary">
          <Logo />
        </div>
        {error ? (
          <>
            <p className="max-w-sm text-sm text-muted">{errorMessage(error)}</p>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t('api.retry')}
            </Button>
          </>
        ) : (
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-label={t('common.loading')} />
        )}
      </div>
    </div>
  );
}

/** Requires a fully authenticated (password + optional MFA) session with `/auth/me` loaded. */
export function ProtectedRoute() {
  const stage = useAuth((s) => s.stage);
  const me = useAuth((s) => s.me);
  const location = useLocation();
  const q = useBootstrapMe();
  if (stage !== 'auth')
    return <Navigate to={stage === '2fa' || stage === 'enroll' ? '/verify-2fa' : '/login'} replace state={{ from: location.pathname }} />;
  if (!me) return <BootScreen error={q.error} onRetry={() => q.refetch()} />;
  return <Outlet />;
}

/** Only for signed-out users (login screens). */
export function GuestRoute() {
  const stage = useAuth((s) => s.stage);
  if (stage === 'auth') return <Navigate to="/" replace />;
  return <Outlet />;
}

export function Forbidden() {
  const { t } = useTranslation();
  const role = useCurrentRole();
  const L = useLocalize();
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Helmet>
        <title>{t('errors.forbidden')}</title>
      </Helmet>
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-danger/10 text-danger">
          <ShieldOff className="h-8 w-8" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-bold text-primary">{t('errors.forbidden')}</h1>
        <p className="mt-2 text-sm text-muted">{t('errors.forbiddenSub', { role: role ? L(role, 'name') : '—' })}</p>
        <ButtonLink to="/" className="mt-6">
          {t('errors.goHome')}
        </ButtonLink>
      </div>
    </div>
  );
}

/** Role-based route guard. */
export function RequirePermission({ module, action = 'view', children }: { module: ModuleKey; action?: PermAction; children: ReactNode }) {
  const can = useCan();
  return can(module, action) ? <>{children}</> : <Forbidden />;
}

/** Hide UI that the current role cannot use. (Also see `<Can perm="module.action">` in src/api/permissions.ts.) */
export function Can({ module, action = 'view', children, fallback = null }: { module: ModuleKey; action?: PermAction; children: ReactNode; fallback?: ReactNode }) {
  const can = useCan();
  return <>{can(module, action) ? children : fallback}</>;
}
