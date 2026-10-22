import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Database,
  Gauge,
  LifeBuoy,
  PlayCircle,
  ServerCog,
  UserPlus,
  Users,
  WalletCards,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { AreaChart, BarChart, DonutChart, LineChart } from '@/components/charts';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DateRangePicker,
  EmptyState,
  ProgressBar,
  Segmented,
  Skeleton,
  StatCard,
  StatusBadge,
  useConfirm,
} from '@/components/ui';
import { useLang } from '@/hooks/useLocale';
import { useCan, useCurrentAdmin } from '@/store/auth';
import { useUi } from '@/store/ui';
import { cn } from '@/utils/cn';
import { fmtCompact, fmtDateTime, fmtMoney, fmtNumber, fmtPercent, fmtRelative } from '@/utils/format';
import { dashboardApi } from '@/api/dashboard';
import { api } from '@/api/client';
import { qk } from '@/api/keys';
import { useApiMutation } from '@/api/hooks';
import type { Kpi } from '@/api/types';

const GOLD = '#C9A24A';
const NAVY = '#0B1F3A';
const EMPTY_KPI: Kpi = { value: 0, prev: null, deltaPct: null, spark: [] };

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const can = useCan();
  const confirm = useConfirm();
  const admin = useCurrentAdmin();

  const lang = useLang();
  const range = useUi((s) => s.range);
  const dash = useQuery({ queryKey: qk.dashboard.sub('main', range.from, range.to), queryFn: () => dashboardApi.get({ from: range.from, to: range.to }) });
  const health = useQuery({ queryKey: qk.dashboard.sub('health'), queryFn: dashboardApi.health, refetchInterval: 60_000 });
  const loading = dash.isLoading;
  const d = dash.data;

  const [revMode, setRevMode] = useState<'revenue' | 'subs'>('revenue');

  const monthly = d?.monthly ?? [];
  const k = d?.kpis;
  const kpis = useMemo(() => {
    const v = (x?: Kpi) => x ?? EMPTY_KPI;
    return {
      total: v(k?.totalStudents),
      active: v(k?.activeSubscriptions),
      activePct: k?.activeSubscriptions.pctOfTotal ?? 0,
      revenue: v(k?.revenueThisMonth),
      regs: v(k?.newRegistrations7d),
      published: v(k?.publishedLessons),
      totalLessons: k?.publishedLessons.totalLessons ?? 0,
      quiz: v(k?.quizAttempts7d),
      ai: v(k?.aiQuestionsMonth),
      open: v(k?.openIssues),
      pending: k?.openIssues.pending ?? 0,
    };
  }, [k]);

  // ─── Range-dependent widgets ────────────────────────────────────────────────
  const dau = d?.dau ?? [];
  const byGov = useMemo(
    () => (d?.registrationsByGovernorate ?? []).map((g) => ({ name: g.name[lang], registrations: g.registrations })),
    [d, lang],
  );
  const pkgDist = useMemo(
    () =>
      (d?.packageDistribution ?? [])
        .map((p) => ({ name: p.packageId ? p.name[lang] : t('dashboard.charts.noPackage'), value: p.value, color: p.color }))
        .filter((r) => r.value > 0),
    [d, lang, t],
  );
  const weakTopics = useMemo(() => (d?.weakestTopics ?? []).map((w) => ({ name: w.name[lang], accuracy: w.accuracy, color: w.color })), [d, lang]);

  // ─── Panels ─────────────────────────────────────────────────────────────────
  const pendingLessons = d?.pendingReview ?? [];
  const pendingCount = d?.pendingReviewCount ?? pendingLessons.length;
  const recentPayments = d?.recentPayments ?? [];
  const topSchools = d?.topSchools ?? [];
  const topMarketers = d?.topMarketers ?? [];
  const maxSchool = Math.max(1, ...topSchools.map((s) => s.verifiedPaidStudents));

  const approveMut = useApiMutation((id: string) => api.post(`/admin/lessons/${id}/approve`, { note: 'Approved from dashboard' }), {
    invalidate: [qk.dashboard.all, qk.lessons.all],
    success: 'dashboard.panels.approved',
  });
  const approve = async (id: string, title: string) => {
    const ok = await confirm({
      title: t('dashboard.panels.approveConfirm', { title }),
      body: t('dashboard.panels.approveBody'),
      tone: 'primary',
      confirmText: t('actions.approve'),
    });
    if (!ok) return;
    approveMut.mutate(id);
  };

  const monthLabel = (m: string) => format(parseISO(`${m}-01`), 'MMM yy');
  const dayLabel = (d: string) => format(parseISO(d), 'd MMM');
  const firstName = (admin?.name ?? '').replace(/^Dr\.\s*/, '').split(' ')[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={admin ? `${t('dashboard.greeting', { name: firstName })} — ${t('dashboard.subtitle')}` : t('dashboard.subtitle')}
        actions={<DateRangePicker />}
      />

      {dash.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          <span className="flex-1">{t('api.loadFailed')}</span>
          <Button size="sm" variant="secondary" onClick={() => dash.refetch()}>
            {t('api.retry')}
          </Button>
        </div>
      )}

      {/* KPI row */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="KPIs">
        <StatCard loading={loading} label={t('dashboard.kpi.totalStudents')} value={fmtNumber(kpis.total.value)} delta={kpis.total.deltaPct ?? undefined} icon={<Users />} color={NAVY} trend={kpis.total.spark} onClick={can('users') ? () => navigate('/users') : undefined} />
        <StatCard loading={loading} label={t('dashboard.kpi.activeSubs')} value={fmtNumber(kpis.active.value)} delta={kpis.active.deltaPct ?? undefined} hint={t('dashboard.kpi.ofTotal', { pct: fmtPercent(kpis.activePct) })} icon={<WalletCards />} color="#059669" trend={kpis.active.spark} />
        <StatCard loading={loading} label={t('dashboard.kpi.revenueMonth')} value={fmtMoney(kpis.revenue.value, 'IQD', true)} delta={kpis.revenue.deltaPct ?? undefined} hint={t('dashboard.kpi.vsLastMonth')} icon={<CircleDollarSign />} color={GOLD} trend={kpis.revenue.spark} onClick={can('payments') ? () => navigate('/payments/transactions') : undefined} />
        <StatCard loading={loading} label={t('dashboard.kpi.newRegs')} value={fmtNumber(kpis.regs.value)} delta={kpis.regs.deltaPct ?? undefined} hint={t('dashboard.kpi.vsPrev7')} icon={<UserPlus />} color="#2563EB" trend={kpis.regs.spark} />
        <StatCard loading={loading} label={t('dashboard.kpi.videosPublished')} value={fmtNumber(kpis.published.value)} delta={kpis.published.deltaPct ?? undefined} hint={t('dashboard.kpi.lessonsTotal', { total: kpis.totalLessons })} icon={<PlayCircle />} color="#7C3AED" trend={kpis.published.spark} onClick={can('content') ? () => navigate('/content/lessons') : undefined} />
        <StatCard loading={loading} label={t('dashboard.kpi.quizAttempts')} value={fmtNumber(kpis.quiz.value)} delta={kpis.quiz.deltaPct ?? undefined} hint={t('dashboard.kpi.vsPrev7')} icon={<ClipboardCheck />} color="#DB2777" trend={kpis.quiz.spark} />
        <StatCard loading={loading} label={t('dashboard.kpi.aiQuestions')} value={fmtNumber(kpis.ai.value)} delta={kpis.ai.deltaPct ?? undefined} hint={t('dashboard.kpi.vsLastMonth')} icon={<Bot />} color="#EA580C" trend={kpis.ai.spark} onClick={can('aitutor') ? () => navigate('/ai-tutor') : undefined} />
        <StatCard loading={loading} label={t('dashboard.kpi.openIssues')} value={fmtNumber(kpis.open.value)} hint={t('dashboard.kpi.pendingTickets', { count: kpis.pending })} icon={<LifeBuoy />} color="#DC2626" trend={kpis.open.spark} />
      </section>

      {/* Revenue + packages */}
      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={t('dashboard.charts.revenue')}
            subtitle={t('dashboard.charts.revenueSub')}
            icon={<CircleDollarSign className="h-4 w-4" />}
            action={
              <Segmented
                size="sm"
                aria-label={t('dashboard.charts.revenue')}
                value={revMode}
                onChange={setRevMode}
                options={[
                  { value: 'revenue', label: t('dashboard.charts.revenueSeries') },
                  { value: 'subs', label: t('dashboard.charts.subsSeries') },
                ]}
              />
            }
          />
          <CardBody>
            <AreaChart
              loading={loading}
              data={monthly}
              xKey="month"
              xFormat={monthLabel}
              height={290}
              series={
                revMode === 'revenue'
                  ? [{ key: 'revenue', label: t('dashboard.charts.revenueSeries'), color: GOLD }]
                  : [{ key: 'subs', label: t('dashboard.charts.subsSeries'), color: NAVY }]
              }
              valueFormat={revMode === 'revenue' ? (v) => fmtMoney(v, 'IQD', true) : (v) => fmtNumber(v)}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('dashboard.charts.packages')} subtitle={t('dashboard.charts.packagesSub')} />
          <CardBody>
            <DonutChart
              loading={loading}
              data={pkgDist}
              height={200}
              centerValue={fmtNumber(kpis.total.value)}
              centerLabel={t('dashboard.charts.students')}
              className="sm:flex-col"
            />
          </CardBody>
        </Card>
      </section>

      {/* DAU + governorates */}
      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t('dashboard.charts.dau')} subtitle={t('dashboard.charts.dauSub')} icon={<Activity className="h-4 w-4" />} />
          <CardBody>
            {!loading && dau.length === 0 ? (
              <EmptyState compact />
            ) : (
              <LineChart loading={loading} data={dau} xKey="date" xFormat={dayLabel} height={270} series={[{ key: 'dau', label: t('dashboard.charts.dauSeries'), color: '#2563EB' }]} valueFormat={(v) => fmtNumber(v)} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('dashboard.charts.byGov')} subtitle={t('dashboard.charts.byGovSub')} />
          <CardBody>
            {!loading && byGov.length === 0 ? (
              <EmptyState compact />
            ) : (
              <BarChart loading={loading} horizontal data={byGov} xKey="name" categoryWidth={92} height={270} series={[{ key: 'registrations', label: t('dashboard.charts.registrations'), color: NAVY }]} valueFormat={(v) => fmtNumber(v)} />
            )}
          </CardBody>
        </Card>
      </section>

      {/* Weak topics + partners */}
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title={t('dashboard.charts.weak')} subtitle={t('dashboard.charts.weakSub')} />
          <CardBody>
            <BarChart loading={loading} horizontal colorByRow data={weakTopics} xKey="name" categoryWidth={130} height={260} series={[{ key: 'accuracy', label: t('dashboard.charts.accuracy'), color: '#DC2626' }]} valueFormat={(v) => fmtPercent(v)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t('dashboard.panels.topSchools')}
            subtitle={t('dashboard.panels.topSchoolsSub')}
            action={can('schools') && <Link to="/schools" className="text-xs font-semibold text-accent hover:underline">{t('actions.viewAll')}</Link>}
          />
          <ul className="divide-y divide-line">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="px-5 py-3.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="mt-2 h-1.5 w-full" />
                  </li>
                ))
              : topSchools.map((s, i) => (
                  <li key={s.id}>
                    <Link to={`/schools/${s.id}`} className="block px-5 py-3 transition hover:bg-accent/[0.04]">
                      <div className="flex items-center gap-3">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent/10 text-[11px] font-bold text-accent num">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{s.name[lang]}</span>
                        <Badge tone={s.tier === 'Gold' || s.tier === 'Platinum' ? 'accent' : s.tier === 'Silver' ? 'slate' : 'neutral'}>{t('dashboard.panels.tier', { tier: s.tier })}</Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-3 ps-9">
                        <ProgressBar value={s.verifiedPaidStudents} max={maxSchool} size="xs" />
                        <span className="w-16 shrink-0 text-end text-xs text-muted num">{t('dashboard.panels.paidStudents', { count: s.verifiedPaidStudents })}</span>
                      </div>
                    </Link>
                  </li>
                ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader
            title={t('dashboard.panels.topMarketers')}
            subtitle={t('dashboard.panels.topMarketersSub')}
            action={can('marketers') && <Link to="/marketers" className="text-xs font-semibold text-accent hover:underline">{t('actions.viewAll')}</Link>}
          />
          <ul className="divide-y divide-line">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-3.5 flex-1" />
                  </li>
                ))
              : topMarketers.map((m) => (
                  <li key={m.id}>
                    <Link to={`/marketers/${m.id}`} className="flex items-center gap-3 px-5 py-2.5 transition hover:bg-accent/[0.04]">
                      <Avatar name={m.name.en} src={m.avatarUrl ?? undefined} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{m.name[lang]}</span>
                        <span className="block text-xs text-muted num">{t('dashboard.panels.paidStudents', { count: m.paidStudents })}</span>
                      </span>
                      <span className="text-end">
                        <span className="block text-sm font-semibold text-ink num">{fmtMoney(m.pendingReward, 'IQD', true)}</span>
                        <span className="block text-[11px] text-muted">{t('dashboard.panels.pendingReward')}</span>
                      </span>
                    </Link>
                  </li>
                ))}
          </ul>
        </Card>
      </section>

      {/* Pending review + payments + health */}
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader
            title={t('dashboard.panels.pending')}
            subtitle={t('dashboard.panels.pendingSub')}
            icon={<Clock3 className="h-4 w-4" />}
            action={<Badge tone="warning">{pendingCount}</Badge>}
          />
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : pendingLessons.length === 0 ? (
            <EmptyState compact title={t('dashboard.panels.pendingEmpty')} hint=" " icon={<CheckCircle2 className="h-10 w-10 text-success" />} />
          ) : (
            <ul className="scrollbar-thin max-h-[360px] divide-y divide-line overflow-y-auto">
              {pendingLessons.map((l) => {
                const subject = l.subject;
                const title = l.title[lang];
                return (
                  <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: subject?.color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <Link to={`/content/lessons/${l.id}`} className="block truncate text-sm font-medium text-ink hover:text-accent">
                        {title}
                      </Link>
                      <span className="block text-xs text-muted">
                        {subject ? subject.name[lang] : ''} · {fmtRelative(l.updatedAt)}
                      </span>
                    </div>
                    {can('content', 'approve') && (
                      <Button size="xs" variant="secondary" loading={approveMut.isPending && approveMut.variables === l.id} icon={<CheckCircle2 className="h-3.5 w-3.5 text-success" />} onClick={() => approve(l.id, title)}>
                        {t('actions.approve')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title={t('dashboard.panels.recentPayments')}
            icon={<CircleDollarSign className="h-4 w-4" />}
            action={can('payments') && <Link to="/payments/transactions" className="text-xs font-semibold text-accent hover:underline">{t('actions.viewAll')}</Link>}
          />
          <ul className="divide-y divide-line">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="px-5 py-3">
                    <Skeleton className="h-8 w-full" />
                  </li>
                ))
              : recentPayments.map((tx) => {
                  const pkg = tx.package;
                  const content = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{tx.student.name[lang]}</span>
                        <span className="block truncate text-xs text-muted">
                          {pkg ? pkg.name[lang] : '—'} · {fmtDateTime(tx.createdAt)}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="text-sm font-semibold text-ink num">{fmtMoney(tx.amount, tx.currency)}</span>
                        <StatusBadge status={tx.status} />
                      </span>
                    </>
                  );
                  return (
                    <li key={tx.id}>
                      {can('payments') ? (
                        <Link to={`/payments/transactions/${tx.id}`} className="flex items-center gap-3 px-5 py-2.5 transition hover:bg-accent/[0.04]">
                          {content}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 px-5 py-2.5">{content}</div>
                      )}
                    </li>
                  );
                })}
          </ul>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader
            title={t('health.title')}
            icon={<ServerCog className="h-4 w-4" />}
            action={
              health.data && (
                <Badge tone={health.data.status === 'operational' ? 'success' : health.data.status === 'degraded' ? 'warning' : 'danger'} dot>
                  {health.data.status === 'operational' ? t('health.operational') : t(`dashboard.health.${health.data.status}`)}
                </Badge>
              )
            }
          />
          {health.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !health.data ? (
            <EmptyState compact title={t('api.loadFailed')} action={<Button size="sm" variant="secondary" onClick={() => health.refetch()}>{t('api.retry')}</Button>} />
          ) : (
          <CardBody className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: <Gauge className="h-4 w-4" />, label: t('health.uptime'), value: fmtPercent(health.data.uptime30d, 2) },
                { icon: <Activity className="h-4 w-4" />, label: t('health.errors'), value: fmtPercent(health.data.errorRate24h, 2) },
                { icon: <Clock3 className="h-4 w-4" />, label: t('health.api'), value: `${fmtNumber(health.data.apiP95Ms)} ms` },
                { icon: <Database className="h-4 w-4" />, label: t('health.backup'), value: fmtRelative(health.data.lastBackup), sub: health.data.backupSizeGb != null ? `${health.data.backupSizeGb} GB` : undefined },
              ].map((m) => (
                <div key={m.label} className="rounded-lg border border-line bg-surface-2 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span className="text-accent">{m.icon}</span>
                    {m.label}
                  </div>
                  <div className="mt-1 text-base font-semibold text-ink num">{m.value}</div>
                  {m.sub && <div className="text-[11px] text-muted num">{m.sub}</div>}
                </div>
              ))}
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('dashboard.health.services')}</div>
              <ul className="space-y-2">
                {health.data.services.map((s) => (
                  <li key={s.key} className="flex items-center gap-2.5 text-sm">
                    <span className={cn('h-2 w-2 rounded-full', s.status === 'operational' ? 'bg-success' : s.status === 'degraded' ? 'bg-warning' : 'bg-danger')} />
                    <span className="flex-1 text-ink/85">{s.name[lang]}</span>
                    <span className="text-xs text-muted num">{s.latencyMs != null ? `${fmtCompact(s.latencyMs)} ms` : '—'}</span>
                    <Badge tone={s.status === 'operational' ? 'success' : s.status === 'degraded' ? 'warning' : 'danger'}>{t(`dashboard.health.${s.status}`)}</Badge>
                  </li>
                ))}
              </ul>
            </div>
            {can('security') && (
              <Link to="/security/audit-logs" className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                {t('nav.auditLogs')} <ArrowRight className="h-3.5 w-3.5 flip-rtl" />
              </Link>
            )}
          </CardBody>
          )}
        </Card>
      </section>
    </div>
  );
}

