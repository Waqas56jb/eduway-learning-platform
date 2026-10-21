import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bot, CheckCheck, CircleDollarSign, MessageSquareText, ShieldAlert, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { activityInRange, pctChange, previousRange } from '@/data/analytics';
import { IQD_PER_USD } from '@/data/ai';
import { SUBJECT_COLORS } from '@/data/subjects';
import type { SubjectKey } from '@/types';
import { useUi } from '@/store/ui';
import { useStudents } from '@/store/core';
import { useAiSettings, useFlaggedConversations } from '@/store/ai';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { fmtDate, fmtMoney, fmtNumber, fmtRelative } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { AreaChart, DonutChart } from '@/components/charts';
import { Avatar, Button, ButtonLink, Card, CardBody, CardHeader, DateRangePicker, EmptyState, ProgressBar, SkeletonCard, StatCard, StatusBadge } from '@/components/ui';
import { ReasonBadge, SeverityBadge, SUBJECT_KEY } from './shared';

const SUBJECTS: SubjectKey[] = ['math', 'physics', 'chemistry', 'biology', 'english'];

export default function AiUsageDashboard() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const range = useUi((s) => s.range);
  const loading = useMockLoading(450, [range.from, range.to]);
  const students = useStudents((s) => s.items);
  const allowance = useAiSettings((s) => s.settings.monthlyAllowance);
  const aiEnabled = useAiSettings((s) => s.settings.enabled);
  const flags = useFlaggedConversations((s) => s.items);
  const updateFlag = useFlaggedConversations((s) => s.update);

  const cur = useMemo(() => activityInRange(range.from, range.to), [range]);
  const prev = useMemo(() => {
    const p = previousRange(range.from, range.to);
    return activityInRange(p.from, p.to);
  }, [range]);

  const sum = (rows: typeof cur, k: 'aiQuestions' | 'aiCostUsd' | 'aiTokens') => rows.reduce((s, d) => s + d[k], 0);
  const peakUsers = (rows: typeof cur) => rows.reduce((m, d) => Math.max(m, d.aiActiveUsers), 0);

  const q = sum(cur, 'aiQuestions');
  const qPrev = sum(prev, 'aiQuestions');
  const users = peakUsers(cur);
  const usersPrev = peakUsers(prev);
  const avg = users ? q / users : 0;
  const avgPrev = usersPrev ? qPrev / usersPrev : 0;
  const cost = sum(cur, 'aiCostUsd');
  const costPrev = sum(prev, 'aiCostUsd');

  const daily = cur.map((d) => ({ date: d.date, questions: d.aiQuestions, users: d.aiActiveUsers }));
  const spark = cur.slice(-20);

  const bySubject = SUBJECTS.map((k) => ({
    name: t(`subjects.${k}`),
    value: cur.reduce((s, d) => s + d.aiBySubject[k], 0),
    color: SUBJECT_COLORS[k],
  }));

  const topUsers = [...students].sort((a, b) => b.aiQuestionsUsed - a.aiQuestionsUsed).slice(0, 8);
  const openFlags = flags.filter((f) => f.status === 'open').sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const setFlag = (id: string, status: 'reviewed' | 'dismissed') => {
    updateFlag(id, { status }, { action: `ai_flag.${status === 'reviewed' ? 'review' : 'dismiss'}`, summary: `Marked flagged AI conversation ${id} as ${status}` });
    toast.success(t(status === 'reviewed' ? 'aitutor.usage.reviewedToast' : 'aitutor.usage.dismissedToast'));
  };

  return (
    <>
      <PageHeader
        title={t('aitutor.usage.title')}
        subtitle={t('aitutor.usage.subtitle')}
        meta={<StatusBadge status={aiEnabled ? 'enabled' : 'disabled'} label={aiEnabled ? t('aitutor.usage.live') : t('aitutor.usage.paused')} />}
        actions={
          <>
            <DateRangePicker />
            {can('aitutor', 'edit') && (
              <ButtonLink to="/ai-tutor/settings" variant="secondary" size="sm" icon={<Bot className="h-4 w-4" />}>
                {t('nav.aiSettings')}
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('aitutor.usage.kpiQuestions')} value={fmtNumber(q)} delta={pctChange(q, qPrev)} icon={<MessageSquareText />} trend={spark.map((d) => d.aiQuestions)} color="#C9A24A" />
        <StatCard loading={loading} label={t('aitutor.usage.kpiActiveUsers')} value={fmtNumber(users)} delta={pctChange(users, usersPrev)} icon={<Users />} trend={spark.map((d) => d.aiActiveUsers)} color="#2563EB" />
        <StatCard loading={loading} label={t('aitutor.usage.kpiAvgPerUser')} value={fmtNumber(avg, { maximumFractionDigits: 1 })} delta={pctChange(avg, avgPrev)} icon={<Bot />} color="#7C3AED" hint={t('aitutor.usage.allowanceOf', { n: allowance })} />
        <StatCard
          loading={loading}
          label={t('aitutor.usage.kpiCost')}
          value={fmtMoney(cost, 'USD')}
          delta={pctChange(cost, costPrev)}
          inverse
          icon={<CircleDollarSign />}
          trend={spark.map((d) => d.aiCostUsd)}
          color="#059669"
          hint={`≈ ${fmtMoney(cost * IQD_PER_USD, 'IQD')}`}
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
          <CardHeader title={t('aitutor.usage.bySubject')} subtitle={t('aitutor.usage.bySubjectSub')} />
          <CardBody>
            <DonutChart loading={loading} data={bySubject} centerValue={fmtNumber(q)} centerLabel={t('aitutor.usage.questions')} height={190} className="sm:flex-col xl:flex-col" />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title={t('aitutor.usage.topUsers')} subtitle={t('aitutor.usage.topUsersSub', { n: allowance })} />
          {loading ? (
            <SkeletonCard lines={6} className="border-0 shadow-none" />
          ) : (
            <ul className="divide-y divide-line">
              {topUsers.map((s, i) => {
                const pct = Math.min(100, (s.aiQuestionsUsed / allowance) * 100);
                return (
                  <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-5 text-center text-xs font-semibold text-muted num">{i + 1}</span>
                    <Avatar name={s.name_en} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link to={`/users/${s.id}`} className="block truncate text-sm font-medium text-ink hover:text-accent">
                        {L(s, 'name')}
                      </Link>
                      <ProgressBar value={pct} tone={pct >= 100 ? 'danger' : pct >= 85 ? 'warning' : 'accent'} size="xs" className="mt-1.5" label={t('aitutor.usage.used')} />
                    </div>
                    <div className="w-24 shrink-0 text-end">
                      <div className="text-sm font-semibold num">
                        {fmtNumber(s.aiQuestionsUsed)} <span className="text-xs font-normal text-muted">/ {allowance}</span>
                      </div>
                      <div className="text-[11px] text-muted">{t('aitutor.usage.lastActive', { time: fmtRelative(s.lastActive) })}</div>
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
              <Link to="/ai-tutor/abuse" className="text-xs font-semibold text-accent hover:underline">
                {t('actions.viewAll')}
              </Link>
            }
          />
          {loading ? (
            <SkeletonCard lines={5} className="border-0 shadow-none" />
          ) : openFlags.length === 0 ? (
            <EmptyState compact title={t('aitutor.usage.noFlags')} hint={t('aitutor.usage.noFlagsHint')} />
          ) : (
            <ul className="divide-y divide-line">
              {openFlags.slice(0, 5).map((f) => {
                const st = students.find((s) => s.id === f.studentId);
                return (
                  <li key={f.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SeverityBadge severity={f.severity} />
                      <ReasonBadge reason={f.reason} />
                      <span className="ms-auto text-[11px] text-muted">{fmtRelative(f.createdAt)}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-ink/90" dir="auto">
                      “{f.excerpt}”
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-muted">
                        {st ? L(st, 'name') : f.studentId} · {t(`subjects.${SUBJECT_KEY[f.subjectId]}`)}
                      </span>
                      {can('aitutor', 'edit') && (
                        <>
                          <Button size="xs" variant="secondary" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => setFlag(f.id, 'reviewed')}>
                            {t('aitutor.usage.review')}
                          </Button>
                          <Button size="xs" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setFlag(f.id, 'dismissed')}>
                            {t('aitutor.usage.dismiss')}
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
