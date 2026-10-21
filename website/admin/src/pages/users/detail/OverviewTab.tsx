import { Link } from 'react-router-dom';
import { CalendarClock, Layers, UserRound, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Badge, Card, CardBody, CardHeader, EmptyState, ProgressBar, StatusBadge, useConfirm } from '@/components/ui';
import { governorates } from '@/data/geo';
import { useLocalize } from '@/hooks/useLocale';
import { useCan } from '@/store/auth';
import { useMarketers, usePackages, useSchools, useStudents, useSubjects } from '@/store/core';
import type { Student } from '@/types';
import { fmtDate, fmtDateTime, fmtRelative } from '@/utils/format';
import { daysUntil, InfoRow } from './shared';

export function OverviewTab({ student }: { student: Student }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const update = useStudents((s) => s.update);
  const pkg = usePackages((s) => s.items.find((p) => p.id === student.packageId));
  const school = useSchools((s) => s.items.find((x) => x.id === student.schoolId));
  const marketer = useMarketers((s) => s.items.find((m) => m.id === student.marketerId));
  const subjects = useSubjects((s) => s.items);
  const gov = governorates.find((g) => g.id === student.governorateId);

  const left = student.subscriptionExpiresAt ? daysUntil(student.subscriptionExpiresAt) : null;
  const totalDays = pkg?.validityType === 'days' ? pkg.validityValue : pkg?.validityType === 'months' ? pkg.validityValue * 30 : 300;

  const revoke = async (index: number) => {
    const ent = student.entitlements[index];
    const subject = subjects.find((s) => s.id === ent.subjectId);
    const ok = await confirm({
      title: t('users.overview.revokeTitle', { subject: L(subject, 'name') }),
      body: t('users.overview.revokeBody'),
      confirmText: t('users.overview.revoke'),
    });
    if (!ok) return;
    update(student.id, { entitlements: student.entitlements.filter((_, i) => i !== index) }, {
      action: 'student.revoke_access',
      summary: `Revoked manual ${subject?.name_en ?? ent.subjectId} access for ${student.name_en}`,
    });
    toast.success(t('users.overview.revoked'));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader title={t('users.overview.profile')} icon={<UserRound className="h-4 w-4" />} />
        <CardBody className="py-2">
          <dl className="divide-y divide-line">
            <InfoRow label={t('users.overview.nameEn')}>{student.name_en}</InfoRow>
            <InfoRow label={t('users.overview.nameAr')}>
              <span dir="rtl" lang="ar">
                {student.name_ar}
              </span>
            </InfoRow>
            <InfoRow label={t('common.mobile')}>
              <span dir="ltr" className="num">
                {student.mobile}
              </span>
            </InfoRow>
            <InfoRow label={t('common.email')}>{student.email ?? '—'}</InfoRow>
            <InfoRow label={t('users.overview.gender')}>{t(`users.overview.${student.gender}`)}</InfoRow>
            <InfoRow label={t('common.governorate')}>{L(gov, 'name')}</InfoRow>
            <InfoRow label={t('common.school')}>
              {school ? (
                can('schools') ? (
                  <Link to={`/schools/${school.id}`} className="text-accent hover:underline">
                    {L(school, 'name')}
                  </Link>
                ) : (
                  L(school, 'name')
                )
              ) : (
                '—'
              )}
            </InfoRow>
            <InfoRow label={t('users.cols.source')}>{t(`users.source.${student.source}`)}</InfoRow>
            <InfoRow label={t('users.overview.referralCode')}>
              <span className="num">{student.referralCode ?? '—'}</span>
            </InfoRow>
            <InfoRow label={t('users.overview.marketer')}>{marketer ? L(marketer, 'name') : '—'}</InfoRow>
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
                    <div className="text-base font-semibold text-ink">{L(pkg, 'name')}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {pkg.subjectIds.map((sid) => {
                        const s = subjects.find((x) => x.id === sid);
                        return (
                          <span key={sid} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink/80 ring-1 ring-line">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s?.color }} />
                            {L(s, 'name')}
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
              {student.entitlements.map((e, i) => {
                const s = subjects.find((x) => x.id === e.subjectId);
                const d = daysUntil(e.expiresAt);
                return (
                  <li key={`${e.subjectId}-${e.source}-${i}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white" style={{ background: s?.color }}>
                      {L(s, 'name').slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{L(s, 'name')}</div>
                      <div className="text-xs text-muted">
                        {t('users.overview.expires')}: {fmtDate(e.expiresAt)}
                      </div>
                    </div>
                    <Badge tone={e.source === 'manual' ? 'accent' : 'navy'}>{e.source === 'manual' ? t('users.overview.entManual') : t('users.overview.entPackage')}</Badge>
                    <Badge tone={d <= 0 ? 'danger' : d <= 14 ? 'warning' : 'success'}>
                      {d > 0 ? t('users.overview.daysLeft', { count: d }) : t('status.expired')}
                    </Badge>
                    {e.source === 'manual' && can('users', 'edit') && (
                      <button onClick={() => revoke(i)} className="rounded-md p-1 text-muted transition hover:bg-danger/10 hover:text-danger" aria-label={t('users.overview.revoke')} title={t('users.overview.revoke')}>
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
