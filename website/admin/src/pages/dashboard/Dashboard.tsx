import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO, subMonths } from 'date-fns';
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
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { AreaChart, BarChart, CHART_COLORS, DonutChart, LineChart } from '@/components/charts';
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
import { activityInRange, dailyActivity, pctChange, systemHealth, topicSignals } from '@/data/analytics';
import { governorates } from '@/data/geo';
import { supportTickets } from '@/data/support';
import { useMockLoading } from '@/hooks/useMockLoading';
import { useLocalize } from '@/hooks/useLocale';
import { useCan, useCurrentAdmin } from '@/store/auth';
import {
  useLessons,
  useMarketers,
  usePackages,
  useSchools,
  useStudents,
  useSubjects,
  useTopics,
  useTransactions,
  useUnits,
} from '@/store/core';
import { useUi } from '@/store/ui';
import type { Transaction } from '@/types';
import { cn } from '@/utils/cn';
import { fmtCompact, fmtDateTime, fmtMoney, fmtNumber, fmtPercent, fmtRelative } from '@/utils/format';
import { MOCK_NOW } from '@/utils/random';

const GOLD = '#C9A24A';
const NAVY = '#0B1F3A';

const isPaid = (t: Transaction) => t.status === 'paid' || t.status === 'partially_refunded';
const net = (t: Transaction) => t.amount - t.refundedAmount;
const monthKey = (iso: string) => iso.slice(0, 7);

export default function Dashboard() {
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const can = useCan();
  const confirm = useConfirm();
  const admin = useCurrentAdmin();

  const range = useUi((s) => s.range);
  const loading = useMockLoading(550, [range.from, range.to]);

  const students = useStudents((s) => s.items);
  const transactions = useTransactions((s) => s.items);
  const lessons = useLessons((s) => s.items);
  const updateLesson = useLessons((s) => s.update);
  const packages = usePackages((s) => s.items);
  const schools = useSchools((s) => s.items);
  const marketers = useMarketers((s) => s.items);
  const subjects = useSubjects((s) => s.items);
  const units = useUnits((s) => s.items);
  const topics = useTopics((s) => s.items);

  const [revMode, setRevMode] = useState<'revenue' | 'subs'>('revenue');

  // ─── Monthly buckets (last 12 months) ───────────────────────────────────────
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => format(subMonths(MOCK_NOW, 11 - i), 'yyyy-MM')), []);

  const monthly = useMemo(() => {
    const rows = months.map((m) => ({ month: m, revenue: 0, subs: 0, regs: 0 }));
    const idx = new Map(months.map((m, i) => [m, i]));
    for (const tx of transactions) {
      const i = idx.get(monthKey(tx.createdAt));
      if (i === undefined || !isPaid(tx)) continue;
      rows[i].revenue += net(tx);
      rows[i].subs += 1;
    }
    for (const s of students) {
      const i = idx.get(monthKey(s.createdAt));
      if (i !== undefined) rows[i].regs += 1;
    }
    return rows;
  }, [months, transactions, students]);

  // ─── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const now = MOCK_NOW.getTime();
    const day = 86_400_000;
    const within = (iso: string, fromDays: number, toDays: number) => {
      const age = (now - new Date(iso).getTime()) / day;
      return age >= fromDays && age < toDays;
    };

    const total = students.length;
    const last30 = students.filter((s) => within(s.createdAt, 0, 30)).length;
    const cumulative = months.map((m) => students.filter((s) => monthKey(s.createdAt) <= m).length);

    const active = students.filter((s) => s.subscriptionStatus === 'active').length;
    const subsSeries = monthly.map((m) => m.subs);

    const thisMonth = monthly[11].revenue;
    const lastMonth = monthly[10].revenue;

    const regs7 = students.filter((s) => within(s.createdAt, 0, 7)).length;
    const regsPrev7 = students.filter((s) => within(s.createdAt, 7, 14)).length;
    const regsDaily = Array.from({ length: 14 }, (_, i) => students.filter((s) => within(s.createdAt, 13 - i, 14 - i)).length);

    const published = lessons.filter((l) => l.status === 'published');
    const publishedPrev = published.filter((l) => l.publishAt && within(l.publishAt, 30, 10_000)).length;
    const publishedSeries = months.map((m) => published.filter((l) => l.publishAt && monthKey(l.publishAt) <= m).length);

    const last14 = dailyActivity.slice(-14);
    const quiz7 = last14.slice(7).reduce((s, d) => s + d.quizAttempts, 0);
    const quizPrev7 = last14.slice(0, 7).reduce((s, d) => s + d.quizAttempts, 0);

    const curMonth = format(MOCK_NOW, 'yyyy-MM');
    const dayOfMonth = MOCK_NOW.getDate();
    const prevMonth = format(subMonths(MOCK_NOW, 1), 'yyyy-MM');
    const aiThis = dailyActivity.filter((d) => d.date.startsWith(curMonth));
    const aiPrev = dailyActivity.filter((d) => d.date.startsWith(prevMonth) && Number(d.date.slice(8)) <= dayOfMonth);
    const aiTotal = aiThis.reduce((s, d) => s + d.aiQuestions, 0);
    const aiPrevTotal = aiPrev.reduce((s, d) => s + d.aiQuestions, 0);

    const open = supportTickets.filter((x) => x.status === 'open').length;
    const pending = supportTickets.filter((x) => x.status === 'pending').length;

    return {
      total,
      totalDelta: pctChange(total, total - last30),
      cumulative,
      active,
      activePct: total ? (active / total) * 100 : 0,
      subsSeries,
      subsDelta: pctChange(monthly[11].subs, monthly[10].subs),
      thisMonth,
      revDelta: pctChange(thisMonth, lastMonth),
      regs7,
      regsDelta: pctChange(regs7, regsPrev7),
      regsDaily,
      published: published.length,
      publishedDelta: pctChange(published.length, publishedPrev),
      publishedSeries,
      quiz7,
      quizDelta: pctChange(quiz7, quizPrev7),
      quizSeries: last14.map((d) => d.quizAttempts),
      aiTotal,
      aiDelta: pctChange(aiTotal, aiPrevTotal),
      aiSeries: aiThis.map((d) => d.aiQuestions),
      open,
      pending,
    };
  }, [students, lessons, monthly, months]);

  // ─── Range-dependent widgets ────────────────────────────────────────────────
  const dau = useMemo(() => activityInRange(range.from, range.to).map((d) => ({ date: d.date, dau: d.dau })), [range]);

  const byGov = useMemo(() => {
    const from = range.from.slice(0, 10);
    const to = range.to.slice(0, 10);
    const counts = new Map<string, number>();
    for (const s of students) {
      const d = s.createdAt.slice(0, 10);
      if (d >= from && d <= to) counts.set(s.governorateId, (counts.get(s.governorateId) ?? 0) + 1);
    }
    return governorates
      .map((g) => ({ name: L(g, 'name'), registrations: counts.get(g.id) ?? 0 }))
      .filter((g) => g.registrations > 0)
      .sort((a, b) => b.registrations - a.registrations)
      .slice(0, 8);
  }, [students, range, L]);

  const pkgDist = useMemo(() => {
    const rows = packages.map((p, i) => ({
      name: L(p, 'name'),
      value: students.filter((s) => s.packageId === p.id).length,
      color: [NAVY, GOLD, '#2563EB', '#059669'][i] ?? CHART_COLORS[i % CHART_COLORS.length],
    }));
    rows.push({ name: t('dashboard.charts.noPackage'), value: students.filter((s) => !s.packageId).length, color: '#94A3B8' });
    return rows.filter((r) => r.value > 0);
  }, [packages, students, L, t]);

  const weakTopics = useMemo(() => {
    return [...topicSignals]
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 6)
      .map((sig) => {
        const topic = topics.find((x) => x.id === sig.topicId);
        const unit = units.find((u) => u.id === topic?.unitId);
        const subject = subjects.find((s) => s.id === unit?.subjectId);
        return { name: topic ? L(topic, 'name') : sig.topicId, accuracy: sig.accuracy, color: subject?.color ?? GOLD };
      });
  }, [topics, units, subjects, L]);

  // ─── Panels ─────────────────────────────────────────────────────────────────
  const pendingLessons = useMemo(
    () => lessons.filter((l) => l.status === 'in_review').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [lessons],
  );
  const recentPayments = useMemo(
    () => [...transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    [transactions],
  );
  const topSchools = useMemo(() => [...schools].sort((a, b) => b.verifiedPaidStudents - a.verifiedPaidStudents).slice(0, 5), [schools]);
  const topMarketers = useMemo(() => [...marketers].sort((a, b) => b.paidStudents - a.paidStudents).slice(0, 5), [marketers]);
  const maxSchool = Math.max(1, ...topSchools.map((s) => s.verifiedPaidStudents));

  const approve = async (id: string, title: string) => {
    const ok = await confirm({
      title: t('dashboard.panels.approveConfirm', { title }),
      body: t('dashboard.panels.approveBody'),
      tone: 'primary',
      confirmText: t('actions.approve'),
    });
    if (!ok) return;
    const now = new Date().toISOString();
    updateLesson(
      id,
      (prev) => ({
        status: 'approved',
        updatedAt: now,
        versions: [
          { id: `ver_${id}_${Date.now()}`, version: (prev.versions[0]?.version ?? 0) + 1, author: admin?.name ?? 'Admin', note: 'Approved from dashboard', status: 'approved', createdAt: now },
          ...prev.versions,
        ],
      }),
      { action: 'lesson.approve', summary: `Approved lesson “${title}” from dashboard` },
    );
    toast.success(t('dashboard.panels.approved'));
  };

  const monthLabel = (m: string) => format(parseISO(`${m}-01`), 'MMM yy');
  const dayLabel = (d: string) => format(parseISO(d), 'd MMM');
  const studentName = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? L(s, 'name') : id;
  };
  const firstName = (admin?.name ?? '').replace(/^Dr\.\s*/, '').split(' ')[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={admin ? `${t('dashboard.greeting', { name: firstName })} — ${t('dashboard.subtitle')}` : t('dashboard.subtitle')}
        actions={<DateRangePicker />}
      />

      {/* KPI row */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="KPIs">
        <StatCard loading={loading} label={t('dashboard.kpi.totalStudents')} value={fmtNumber(kpis.total)} delta={kpis.totalDelta} icon={<Users />} color={NAVY} trend={kpis.cumulative} onClick={can('users') ? () => navigate('/users') : undefined} />
        <StatCard loading={loading} label={t('dashboard.kpi.activeSubs')} value={fmtNumber(kpis.active)} delta={kpis.subsDelta} hint={t('dashboard.kpi.ofTotal', { pct: fmtPercent(kpis.activePct) })} icon={<WalletCards />} color="#059669" trend={kpis.subsSeries} />
        <StatCard loading={loading} label={t('dashboard.kpi.revenueMonth')} value={fmtMoney(kpis.thisMonth, 'IQD', true)} delta={kpis.revDelta} hint={t('dashboard.kpi.vsLastMonth')} icon={<CircleDollarSign />} color={GOLD} trend={monthly.map((m) => m.revenue)} onClick={can('payments') ? () => navigate('/payments/transactions') : undefined} />
        <StatCard loading={loading} label={t('dashboard.kpi.newRegs')} value={fmtNumber(kpis.regs7)} delta={kpis.regsDelta} hint={t('dashboard.kpi.vsPrev7')} icon={<UserPlus />} color="#2563EB" trend={kpis.regsDaily} />
        <StatCard loading={loading} label={t('dashboard.kpi.videosPublished')} value={fmtNumber(kpis.published)} delta={kpis.publishedDelta} hint={t('dashboard.kpi.lessonsTotal', { total: lessons.length })} icon={<PlayCircle />} color="#7C3AED" trend={kpis.publishedSeries} onClick={can('content') ? () => navigate('/content/lessons') : undefined} />
        <StatCard loading={loading} label={t('dashboard.kpi.quizAttempts')} value={fmtNumber(kpis.quiz7)} delta={kpis.quizDelta} hint={t('dashboard.kpi.vsPrev7')} icon={<ClipboardCheck />} color="#DB2777" trend={kpis.quizSeries} />
        <StatCard loading={loading} label={t('dashboard.kpi.aiQuestions')} value={fmtNumber(kpis.aiTotal)} delta={kpis.aiDelta} hint={t('dashboard.kpi.vsLastMonth')} icon={<Bot />} color="#EA580C" trend={kpis.aiSeries} onClick={can('aitutor') ? () => navigate('/ai-tutor') : undefined} />
        <StatCard loading={loading} label={t('dashboard.kpi.openIssues')} value={fmtNumber(kpis.open)} hint={t('dashboard.kpi.pendingTickets', { count: kpis.pending })} icon={<LifeBuoy />} color="#DC2626" trend={[9, 11, 8, 12, 10, 9, 11, 8, kpis.open]} />
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
              centerValue={fmtNumber(students.length)}
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
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{L(s, 'name')}</span>
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
                      <Avatar name={m.name_en} src={m.avatar} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{L(m, 'name')}</span>
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
            action={<Badge tone="warning">{pendingLessons.length}</Badge>}
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
                const subject = subjects.find((s) => s.id === l.subjectId);
                const title = L(l, 'title');
                return (
                  <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: subject?.color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <Link to={`/content/lessons/${l.id}`} className="block truncate text-sm font-medium text-ink hover:text-accent">
                        {title}
                      </Link>
                      <span className="block text-xs text-muted">
                        {subject ? L(subject, 'name') : ''} · {fmtRelative(l.updatedAt)}
                      </span>
                    </div>
                    {can('content', 'approve') && (
                      <Button size="xs" variant="secondary" icon={<CheckCircle2 className="h-3.5 w-3.5 text-success" />} onClick={() => approve(l.id, title)}>
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
                  const pkg = packages.find((p) => p.id === tx.packageId);
                  const content = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{studentName(tx.studentId)}</span>
                        <span className="block truncate text-xs text-muted">
                          {pkg ? L(pkg, 'name') : '—'} · {fmtDateTime(tx.createdAt)}
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
              <Badge tone="success" dot>
                {t('health.operational')}
              </Badge>
            }
          />
          <CardBody className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: <Gauge className="h-4 w-4" />, label: t('health.uptime'), value: fmtPercent(systemHealth.uptime30d, 2) },
                { icon: <Activity className="h-4 w-4" />, label: t('health.errors'), value: fmtPercent(systemHealth.errorRate24h, 2) },
                { icon: <Clock3 className="h-4 w-4" />, label: t('health.api'), value: `${fmtNumber(systemHealth.apiP95Ms)} ms` },
                { icon: <Database className="h-4 w-4" />, label: t('health.backup'), value: fmtRelative(systemHealth.lastBackup), sub: `${systemHealth.backupSizeGb} GB` },
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
                {systemHealth.services.map((s) => (
                  <li key={s.key} className="flex items-center gap-2.5 text-sm">
                    <span className={cn('h-2 w-2 rounded-full', s.status === 'operational' ? 'bg-success' : 'bg-warning')} />
                    <span className="flex-1 text-ink/85">{s.name}</span>
                    <span className="text-xs text-muted num">{fmtCompact(s.latencyMs)} ms</span>
                    <Badge tone={s.status === 'operational' ? 'success' : 'warning'}>{t(`dashboard.health.${s.status}`)}</Badge>
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
        </Card>
      </section>
    </div>
  );
}

