import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  CheckCheck,
  CircleDollarSign,
  MessageSquareText,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useUi } from '@/store/ui';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useAiUsage, useSetFlagStatus } from '@/api/aiTutor';
import { flatRef } from '@/api/adapters';
import type { Platform } from '@/api/types';
import { fmtDate, fmtMoney, fmtNumber, fmtRelative } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { AreaChart, DonutChart } from '@/components/charts';
import {
  Avatar,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  DateRangePicker,
  EmptyState,
  FilterSelect,
  ProgressBar,
  SkeletonCard,
  StatCard,
  StatusBadge,
} from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { ReasonBadge, SeverityBadge } from './shared';

const PLATFORMS: Platform[] = ['web', 'ios', 'android'];

export default function AiUsageDashboard() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const range = useUi((s) => s.range);
  const [platform, setPlatform] = useState<Platform | ''>('');
  const usage = useAiUsage(range.from, range.to, platform);
  const setFlag = useSetFlagStatus();
  const loading = usage.isLoading;
  const d = usage.data;

  const allowance = d?.monthlyAllowance ?? 0;
  const aiEnabled = d?.enabled ?? true;
  const k = d?.kpis;
  const daily = d?.daily ?? [];
  const bySubject = (d?.bySubject ?? []).map((s) => ({
    name: L(flatRef(s), 'name'),
    value: s.value,
    color: s.color,
  }));
  const topUsers = d?.topUsers ?? [];
  const openFlags = d?.openFlags ?? [];

  const markFlag = (id: string, status: 'reviewed' | 'dismissed') =>
    setFlag.mutate(
      { id, status },
      {
        onSuccess: () =>
          toast.success(
            t(
              status === 'reviewed'
                ? 'aitutor.usage.reviewedToast'
                : 'aitutor.usage.dismissedToast',
            ),
          ),
      },
    );

  return (
    <>
      <PageHeader
        title={t('aitutor.usage.title')}
        subtitle={t('aitutor.usage.subtitle')}
        meta={
          <StatusBadge
            status={aiEnabled ? 'enabled' : 'disabled'}
            label={aiEnabled ? t('aitutor.usage.live') : t('aitutor.usage.paused')}
          />
        }
        actions={
          <>
            <FilterSelect
              label={t('aitutor.usage.platform')}
              value={platform}
              onChange={(v) => setPlatform(v as Platform | '')}
              options={PLATFORMS.map((p) => ({ value: p, label: t(`aitutor.platforms.${p}`) }))}
            />
            <DateRangePicker />
            {can('aitutor', 'edit') && (
              <ButtonLink
                to="/ai-tutor/settings"
                variant="secondary"
                size="sm"
                icon={<Bot className="h-4 w-4" />}
              >
                {t('nav.aiSettings')}
              </ButtonLink>
            )}
          </>
        }
      />

      {usage.error && !d ? (
        <QueryError error={usage.error} onRetry={() => usage.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              loading={loading}
              label={t('aitutor.usage.kpiQuestions')}
              value={fmtNumber(k?.questions.value ?? 0)}
              delta={k?.questions.deltaPct ?? undefined}
              icon={<MessageSquareText />}
              trend={k?.questions.spark}
              color="#C9A24A"
            />
            <StatCard
              loading={loading}
              label={t('aitutor.usage.kpiActiveUsers')}
              value={fmtNumber(k?.peakActiveUsers.value ?? 0)}
              delta={k?.peakActiveUsers.deltaPct ?? undefined}
              icon={<Users />}
              trend={k?.peakActiveUsers.spark}
              color="#2563EB"
            />
            <StatCard
              loading={loading}
              label={t('aitutor.usage.kpiAvgPerUser')}
              value={fmtNumber(k?.avgPerUser.value ?? 0, { maximumFractionDigits: 1 })}
              delta={k?.avgPerUser.deltaPct ?? undefined}
              icon={<Bot />}
              color="#7C3AED"
              hint={t('aitutor.usage.allowanceOf', { n: allowance })}
            />
            <StatCard
              loading={loading}
              label={t('aitutor.usage.kpiCost')}
              value={fmtMoney(k?.costUsd.value ?? 0, 'USD')}
              delta={k?.costUsd.deltaPct ?? undefined}
              inverse
              icon={<CircleDollarSign />}
              trend={k?.costUsd.spark}
              color="#059669"
              hint={`≈ ${fmtMoney(k?.costIqd ?? 0, 'IQD')} · ${t('aitutor.usage.tokens', { n: fmtNumber(k?.tokens.value ?? 0) })}`}
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title={t('aitutor.usage.byDay')} subtitle={t('aitutor.usage.byDaySub')} />
              <CardBody>
                <AreaChart
                  loading={loading}
                  data={daily}
                  xKey="date"
                  xFormat={(v) => fmtDate(v, 'd MMM')}
                  valueFormat={(v) => fmtNumber(v)}
                  series={[
                    { key: 'questions', label: t('aitutor.usage.questions'), color: '#C9A24A' },
                    { key: 'users', label: t('aitutor.usage.activeUsers'), color: '#0B1F3A' },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title={t('aitutor.usage.bySubject')}
                subtitle={t('aitutor.usage.bySubjectSub')}
              />
              <CardBody>
                <DonutChart
                  loading={loading}
                  data={bySubject}
                  centerValue={fmtNumber(k?.questions.value ?? 0)}
                  centerLabel={t('aitutor.usage.questions')}
                  height={190}
                  className="sm:flex-col xl:flex-col"
                />
              </CardBody>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader
                title={t('aitutor.usage.topUsers')}
                subtitle={t('aitutor.usage.topUsersSub', { n: allowance })}
              />
              {loading ? (
                <SkeletonCard lines={6} className="border-0 shadow-none" />
              ) : topUsers.length === 0 ? (
                <EmptyState
                  compact
                  title={t('common.emptyTitle')}
                  hint={t('aitutor.usage.noUsage')}
                />
              ) : (
                <ul className="divide-y divide-line">
                  {topUsers.map((u, i) => {
                    const s = flatRef(u.student);
                    const cap = u.allowance || allowance || 1;
                    const pct = Math.min(100, (u.used / cap) * 100);
                    return (
                      <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                        <span className="num w-5 text-center text-xs font-semibold text-muted">
                          {i + 1}
                        </span>
                        <Avatar name={s.name_en} size="sm" />
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/users/${s.id}`}
                            className="block truncate text-sm font-medium text-ink hover:text-accent"
                          >
                            {L(s, 'name')}
                          </Link>
                          <ProgressBar
                            value={pct}
                            tone={pct >= 100 ? 'danger' : pct >= 85 ? 'warning' : 'accent'}
                            size="xs"
                            className="mt-1.5"
                            label={t('aitutor.usage.used')}
                          />
                        </div>
                        <div className="w-24 shrink-0 text-end">
                          <div className="num text-sm font-semibold">
                            {fmtNumber(u.used)}{' '}
                            <span className="text-xs font-normal text-muted">/ {u.allowance}</span>
                          </div>
                          <div className="text-[11px] text-muted">
                            {t('aitutor.usage.lastActive', { time: fmtRelative(u.lastActive) })}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader
                title={t('aitutor.usage.flagged')}
                subtitle={t('aitutor.usage.flaggedSub', { count: openFlags.length })}
                icon={<ShieldAlert className="h-4 w-4" />}
                action={
                  <Link
                    to="/ai-tutor/abuse"
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    {t('actions.viewAll')}
                  </Link>
                }
              />
              {loading ? (
                <SkeletonCard lines={5} className="border-0 shadow-none" />
              ) : openFlags.length === 0 ? (
                <EmptyState
                  compact
                  title={t('aitutor.usage.noFlags')}
                  hint={t('aitutor.usage.noFlagsHint')}
                />
              ) : (
                <ul className="divide-y divide-line">
                  {openFlags.slice(0, 5).map((f) => (
                    <li key={f.id} className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SeverityBadge severity={f.severity} />
                        <ReasonBadge reason={f.reason} />
                        <span className="ms-auto text-[11px] text-muted">
                          {fmtRelative(f.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-ink/90" dir="auto">
                        “{f.excerpt}”
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-muted">
                          {L(flatRef(f.student), 'name')} · {L(flatRef(f.subject), 'name')}
                        </span>
                        {can('aitutor', 'edit') && (
                          <>
                            <Button
                              size="xs"
                              variant="secondary"
                              icon={<CheckCheck className="h-3.5 w-3.5" />}
                              disabled={setFlag.isPending}
                              onClick={() => markFlag(f.id, 'reviewed')}
                            >
                              {t('aitutor.usage.review')}
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              icon={<X className="h-3.5 w-3.5" />}
                              disabled={setFlag.isPending}
                              onClick={() => markFlag(f.id, 'dismissed')}
                            >
                              {t('aitutor.usage.dismiss')}
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
