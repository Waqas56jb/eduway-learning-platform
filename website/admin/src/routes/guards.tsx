import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import type { ModuleKey, PermAction } from '@/types';
import { useAuth, useCan, useCurrentRole } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { ButtonLink } from '@/components/ui/Button';

/** Requires a fully authenticated (password + 2FA) session. */
export function ProtectedRoute() {
  const stage = useAuth((s) => s.stage);
  const location = useLocation();
  if (stage !== 'auth') return <Navigate to={stage === '2fa' ? '/verify-2fa' : '/login'} replace state={{ from: location.pathname }} />;
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

/** Hide UI that the current role cannot use. */
export function Can({ module, action = 'view', children, fallback = null }: { module: ModuleKey; action?: PermAction; children: ReactNode; fallback?: ReactNode }) {
  const can = useCan();
  return <>{can(module, action) ? children : fallback}</>;
}
