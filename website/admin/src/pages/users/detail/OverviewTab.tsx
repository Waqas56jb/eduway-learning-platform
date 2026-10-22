import { Link } from 'react-router-dom';
import { CalendarClock, History, Layers, UserRound, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge, Card, CardBody, CardHeader, EmptyState, ProgressBar, Skeleton, StatusBadge, useConfirm } from '@/components/ui';
import { useLang } from '@/hooks/useLocale';
import { useCan } from '@/store/auth';
import { fmtDate, fmtDateTime, fmtRelative } from '@/utils/format';
import { useApiMutation, useApiQuery } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useLookups } from '@/api/lookups';
import { studentsApi, type AdminStudentDetail } from '@/api/students';
import type { EntitlementDto } from '@/api/types';
import { daysUntil, InfoRow } from './shared';

export function OverviewTab({ student }: { student: AdminStudentDetail }) {
  const { t } = useTranslation();
  const lang = useLang();
  const can = useCan();
  const confirm = useConfirm();
  const lookups = useLookups();
  const pkg = student.packageDetail;
  const logs = useApiQuery(qk.students.sub('entitlement-logs', student.id), () => studentsApi.entitlementLogs(student.id));

  const left = student.subscriptionExpiresAt ? daysUntil(student.subscriptionExpiresAt) : null;
  const totalDays = pkg?.validityDays ?? 300;

  const revokeMut = useApiMutation((v: { ent: EntitlementDto; reason?: string }) => studentsApi.revokeAccess(student.id, v.ent.id, v.reason), {
    invalidate: [qk.students.detail(student.id), qk.students.sub('entitlement-logs', student.id)],
    success: 'users.overview.revoked',
  });

  const revoke = async (ent: EntitlementDto) => {
    const subject = lookups.subject(ent.subjectId);
    const ok = await confirm({
      title: t('users.overview.revokeTitle', { subject: subject?.name[lang] ?? ent.subjectSlug }),
      body: t('users.overview.revokeBody'),
      confirmText: t('users.overview.revoke'),
    });
    if (!ok) return;
    revokeMut.mutate({ ent, reason: ok.reason || undefined });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader title={t('users.overview.profile')} icon={<UserRound className="h-4 w-4" />} />
        <CardBody className="py-2">
          <dl className="divide-y divide-line">
            <InfoRow label={t('users.overview.nameEn')}>{student.name.en}</InfoRow>
            <InfoRow label={t('users.overview.nameAr')}>
              <span dir="rtl" lang="ar">
                {student.name.ar}
              </span>
            </InfoRow>
            <InfoRow label={t('common.mobile')}>
              <span dir="ltr" className="num">
                {student.mobile}
              </span>
            </InfoRow>
            <InfoRow label={t('common.email')}>{student.email ?? '—'}</InfoRow>
            <InfoRow label={t('users.overview.gender')}>{student.gender ? t(`users.overview.${student.gender}`) : '—'}</InfoRow>
            <InfoRow label={t('common.governorate')}>{student.governorate?.name[lang] ?? '—'}</InfoRow>
            <InfoRow label={t('common.school')}>
              {student.school ? (
                can('schools') ? (
                  <Link to={`/schools/${student.school.id}`} className="text-accent hover:underline">
                    {student.school.name[lang]}
                  </Link>
                ) : (
                  student.school.name[lang]
                )
              ) : (
                (student.schoolName ?? '—')
              )}
            </InfoRow>
            <InfoRow label={t('users.cols.source')}>{t(`users.source.${student.source}`)}</InfoRow>
            <InfoRow label={t('users.overview.referralCode')}>
              <span className="num">{student.referralCode ?? '—'}</span>
            </InfoRow>
            <InfoRow label={t('users.overview.marketer')}>{student.marketer ? student.marketer.name[lang] : '—'}</InfoRow>
            <InfoRow label={t('users.cols.created')}>{fmtDateTime(student.createdAt)}</InfoRow>
            <InfoRow label={t('users.cols.lastActive')}>{fmtRelative(student.lastActive)}</InfoRow>
          </dl>
        </CardBody>
      </Card>

      <div className="space-y-4 lg:col-span-3">
        <Card>
          <CardHeader title={t('users.overview.subscription')} icon={<CalendarClock className="h-4 w-4" />} action={<StatusBadge status={student.subscriptionStatus} />} />
          <CardBody>
            {pkg ? (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-ink">{pkg.name[lang]}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {pkg.subjectIds.map((sid) => {
                        const s = lookups.subject(sid);
                        return (
                          <span key={sid} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink/80 ring-1 ring-line">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s?.color }} />
                            {s?.name[lang] ?? '—'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="text-end text-sm">
                    <div className="text-muted">{t('users.overview.expires')}</div>
                    <div className="font-semibold text-ink">{fmtDate(student.subscriptionExpiresAt)}</div>
                  </div>
                </div>
                {left !== null && (
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className={left > 0 ? 'text-muted' : 'font-medium text-danger'}>
                        {left > 0 ? t('users.overview.daysLeft', { count: left }) : t('users.overview.expiredAgo', { time: fmtRelative(student.subscriptionExpiresAt) })}
                      </span>
                    </div>
                    <ProgressBar value={Math.max(0, left)} max={Math.max(totalDays, left)} tone={left <= 14 ? 'warning' : 'accent'} label={t('users.overview.expires')} />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">{t('users.overview.noSubscription')}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('users.overview.entitlements')} icon={<Layers className="h-4 w-4" />} />
          {student.entitlements.length === 0 ? (
            <EmptyState compact title={t('users.overview.noEntitlements')} hint=" " />
          ) : (
            <ul className="divide-y divide-line">
              {student.entitlements.map((e) => {
                const s = lookups.subject(e.subjectId);
                const d = daysUntil(e.expiresAt);
                const sName = s?.name[lang] ?? e.subjectSlug;
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white" style={{ background: s?.color ?? '#94A3B8' }}>
                      {sName.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{sName}</div>
                      <div className="text-xs text-muted">
                        {t('users.overview.expires')}: {fmtDate(e.expiresAt)}
                        {e.source === 'manual' && e.reason && <> · {e.reason}</>}
                      </div>
                    </div>
                    <Badge tone={e.source === 'manual' ? 'accent' : 'navy'}>{e.source === 'manual' ? t('users.overview.entManual') : t('users.overview.entPackage')}</Badge>
                    <Badge tone={d <= 0 ? 'danger' : d <= 14 ? 'warning' : 'success'}>
                      {d > 0 ? t('users.overview.daysLeft', { count: d }) : t('status.expired')}
                    </Badge>
                    {e.source === 'manual' && can('users', 'edit') && (
                      <button
                        onClick={() => revoke(e)}
                        disabled={revokeMut.isPending}
                        className="rounded-md p-1 text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                        aria-label={t('users.overview.revoke')}
                        title={t('users.overview.revoke')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={t('users.overview.entitlementLog')} icon={<History className="h-4 w-4" />} />
          {logs.isLoading ? (
            <div className="space-y-2 p-5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : !logs.data?.length ? (
            <EmptyState compact title={t('users.overview.noEntitlementLog')} hint=" " />
          ) : (
            <ul className="scrollbar-thin max-h-72 divide-y divide-line overflow-y-auto">
              {logs.data.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.subject.color }} />
                  <span className="font-medium text-ink">{t(`users.overview.logAction.${l.action}`)}</span>
                  <span className="text-ink/80">{l.subject.name[lang]}</span>
                  {l.days != null && <span className="text-xs text-muted num">· {t('users.actions.durationDays', { count: l.days })}</span>}
                  <span className="text-xs text-muted">· {t(`users.overview.logSource.${l.source}`)}</span>
                  {l.reason && <span className="w-full text-xs text-muted">{l.reason}</span>}
                  <span className="ms-auto text-[11px] text-muted">
                    {l.actor ? `${l.actor.name[lang]} · ` : ''}
                    {fmtRelative(l.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
