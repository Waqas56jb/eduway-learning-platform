import { Globe, LogOut, MonitorSmartphone, Smartphone, Tablet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, CardHeader, EmptyState, Skeleton, useConfirm } from '@/components/ui';
import { useLang } from '@/hooks/useLocale';
import { useCan } from '@/store/auth';
import { fmtRelative } from '@/utils/format';
import { errorMessage } from '@/api/client';
import { useApiMutation, useApiQuery } from '@/api/hooks';
import { qk } from '@/api/keys';
import { studentsApi, type AdminStudentDetail } from '@/api/students';
import type { SessionDto } from '@/api/types';

const PLATFORM_LABEL: Record<string, string> = { web: 'WEB', ios: 'iOS', android: 'ANDROID', admin: 'ADMIN' };

const iconFor = (s: SessionDto) =>
  s.platform === 'web' ? <Globe className="h-5 w-5" /> : /Tab|iPad/.test(s.device) ? <Tablet className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />;

export function SessionsTab({ student }: { student: AdminStudentDetail }) {
  const { t } = useTranslation();
  const lang = useLang();
  const can = useCan();
  const confirm = useConfirm();
  const canEdit = can('users', 'edit');
  const key = qk.students.sub('sessions', student.id);
  const q = useApiQuery(key, () => studentsApi.sessions(student.id));
  const sessions = q.data ?? [];
  const invalidate = [key, qk.students.detail(student.id)];

  const one = useApiMutation((s: SessionDto) => studentsApi.revokeSession(student.id, s.id), { invalidate, success: 'users.sessions.loggedOut' });
  const all = useApiMutation((reason: string) => studentsApi.revokeAllSessions(student.id, reason || undefined), { invalidate, success: 'users.sessions.allLoggedOut' });

  const forceOne = async (s: SessionDto) => {
    const ok = await confirm({ title: t('users.sessions.forceTitle', { device: s.device }), body: t('users.sessions.forceBody'), confirmText: t('users.sessions.forceLogout') });
    if (!ok) return;
    one.mutate(s);
  };

  const logoutAll = async () => {
    const ok = await confirm({ title: t('users.sessions.allTitle', { count: sessions.length }), body: t('users.sessions.allBody'), confirmText: t('users.sessions.logoutAll') });
    if (!ok) return;
    all.mutate(ok.reason);
  };

  return (
    <Card>
      <CardHeader
        title={t('users.sessions.title')}
        subtitle={t('users.sessions.subtitle')}
        icon={<MonitorSmartphone className="h-4 w-4" />}
        action={
          canEdit &&
          sessions.length > 0 && (
            <Button size="sm" variant="danger" loading={all.isPending} icon={<LogOut className="h-4 w-4" />} onClick={logoutAll}>
              {t('users.sessions.logoutAll')}
            </Button>
          )
        }
      />
      {q.isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <EmptyState compact title={t('api.loadFailed')} hint={errorMessage(q.error)} action={<Button size="sm" variant="secondary" onClick={() => q.refetch()}>{t('api.retry')}</Button>} />
      ) : sessions.length === 0 ? (
        <EmptyState compact title={t('users.sessions.none')} hint=" " />
      ) : (
        <ul className="divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">{iconFor(s)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{s.device}</span>
                  <Badge tone="slate">{PLATFORM_LABEL[s.platform] ?? s.platform.toUpperCase()}</Badge>
                  {s.browser && <span className="text-xs text-muted">{s.browser}</span>}
                  {s.current && (
                    <Badge tone="success" dot>
                      {t('users.sessions.current')}
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  <span dir="ltr" className="num">
                    {s.ip}
                  </span>{' '}
                  · {s.location?.[lang] ?? '—'} · {t('users.sessions.lastSeen', { time: fmtRelative(s.lastActive) })}
                </div>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={one.isPending && one.variables?.id === s.id}
                  icon={<LogOut className="h-4 w-4" />}
                  onClick={() => forceOne(s)}
                >
                  {t('users.sessions.forceLogout')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
