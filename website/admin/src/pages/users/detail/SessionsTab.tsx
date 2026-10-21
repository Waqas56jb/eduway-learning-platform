import { Globe, LogOut, MonitorSmartphone, Smartphone, Tablet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Badge, Button, Card, CardHeader, EmptyState, useConfirm } from '@/components/ui';
import { useCan } from '@/store/auth';
import { useStudents } from '@/store/core';
import type { DeviceSession, Student } from '@/types';
import { fmtRelative } from '@/utils/format';

const iconFor = (s: DeviceSession) =>
  s.platform === 'web' ? <Globe className="h-5 w-5" /> : /Tab/.test(s.device) ? <Tablet className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />;

export function SessionsTab({ student }: { student: Student }) {
  const { t } = useTranslation();
  const can = useCan();
  const confirm = useConfirm();
  const update = useStudents((s) => s.update);
  const canEdit = can('users', 'edit');

  const forceOne = async (s: DeviceSession) => {
    const ok = await confirm({ title: t('users.sessions.forceTitle', { device: s.device }), body: t('users.sessions.forceBody'), confirmText: t('users.sessions.forceLogout') });
    if (!ok) return;
    update(student.id, { sessions: student.sessions.filter((x) => x.id !== s.id) }, {
      action: 'student.force_logout',
      summary: `Forced logout of ${s.device} (${s.ip}) for ${student.name_en}`,
    });
    toast.success(t('users.sessions.loggedOut'));
  };

  const logoutAll = async () => {
    const ok = await confirm({ title: t('users.sessions.allTitle', { count: student.sessions.length }), body: t('users.sessions.allBody'), confirmText: t('users.sessions.logoutAll') });
    if (!ok) return;
    update(student.id, { sessions: [] }, {
      action: 'student.logout_all',
      summary: `Logged out all ${student.sessions.length} devices for ${student.name_en}`,
    });
    toast.success(t('users.sessions.allLoggedOut'));
  };

  return (
    <Card>
      <CardHeader
        title={t('users.sessions.title')}
        subtitle={t('users.sessions.subtitle')}
        icon={<MonitorSmartphone className="h-4 w-4" />}
        action={
          canEdit &&
          student.sessions.length > 0 && (
            <Button size="sm" variant="danger" icon={<LogOut className="h-4 w-4" />} onClick={logoutAll}>
              {t('users.sessions.logoutAll')}
            </Button>
          )
        }
      />
      {student.sessions.length === 0 ? (
        <EmptyState compact title={t('users.sessions.none')} hint=" " />
      ) : (
        <ul className="divide-y divide-line">
          {student.sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">{iconFor(s)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{s.device}</span>
                  <Badge tone="slate">{s.platform.toUpperCase()}</Badge>
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
                  · {s.location} · {t('users.sessions.lastSeen', { time: fmtRelative(s.lastSeen) })}
                </div>
              </div>
              {canEdit && (
                <Button size="sm" variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={() => forceOne(s)}>
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
