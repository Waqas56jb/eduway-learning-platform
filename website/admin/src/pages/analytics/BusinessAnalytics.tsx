import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, RefreshCcw, Repeat, Undo2, UserPlus, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AcquisitionSource, Transaction } from '@/types';
import { pctChange, previousRange } from '@/data/analytics';
import { useUi } from '@/store/ui';
import { useMarketers, usePackages, useRefunds, useSchools, useStudents, useTransactions } from '@/store/core';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { cn } from '@/utils/cn';
import { fmtCompact, fmtMoney, fmtNumber, fmtPercent } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { AreaChart, BarChart, CHART_COLORS, DonutChart, LineChart } from '@/components/charts';
import { Badge, Card, CardBody, CardHeader, DateRangePicker, KpiTrend, StatCard, Switch } from '@/components/ui';
import { bucketCount, bucketLabel, bucketize, grainFor, inRange } from './buckets';

const PAID = new Set<Transaction['status']>(['paid', 'partially_refunded', 'refunded']);
const SOURCES: AcquisitionSource[] = ['organic', 'school', 'marketer', 'referral', 'campaign'];
const SOURCE_COLORS: Record<AcquisitionSource, string> = { organic: '#0B1F3A', school: '#C9A24A', marketer: '#7C3AED', referral: '#059669', campaign: '#EA580C' };
const PKG_COLORS = ['#0B1F3A', '#C9A24A', '#2563EB', '#059669', '#DB2777'];

/** Compact table used under each chart. */
function MiniTable({ head, rows, className }: { head: ReactNode[]; rows: ReactNode[][]; className?: string }) {
  return (
    <div className={cn('scrollbar-thin overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th key={i} className={cn('whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted', i === 0 ? 'text-start' : 'text-end')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-line last:border-0">
              {r.map((c, ci) => (
                <td key={ci} className={cn('whitespace-nowrap px-3 py-2', ci === 0 ? 'text-start' : 'text-end num')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BusinessAnalytics() {
  const { t } = useTranslation();
  const L = useLocalize();
  const range = useUi((s) => s.range);
  const [compare, setCompare] = useState(false);
  const loading = useMockLoading(500, [range.from, range.to]);

  const students = useStudents((s) => s.items);
  const txns = useTransactions((s) => s.items);
  const refunds = useRefunds((s) => s.items);
  const packages = usePackages((s) => s.items);
  const schools = useSchools((s) => s.items);
  const marketers = useMarketers((s) => s.items);

  const m = useMemo(() => {
    const { from, to } = range;
    const prev = previousRange(from, to);
    const grain = grainFor(from, to);
    const n = bucketCount(from, to, grain);

    const paidTx = txns.filter((x) => PAID.has(x.status));
    const firstPaid = new Map<string, string>();
    [...paidTx].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((x) => !firstPaid.has(x.studentId) && firstPaid.set(x.studentId, x.id));
    const isRenewal = (x: Transaction) => firstPaid.get(x.studentId) !== x.id;
    const approvedRefunds = refunds.filter((r) => r.status === 'approved');

    const period = (f: string, tt: string) => {
      const tx = paidTx.filter((x) => inRange(x.createdAt, f, tt));
      const gross = tx.reduce((s, x) => s + x.amount, 0);
      const rf = approvedRefunds.filter((r) => inRange(r.decidedAt ?? r.requestedAt, f, tt));
      const refundAmt = rf.reduce((s, r) => s + r.amount, 0);
      return {
        regs: students.filter((s) => inRange(s.createdAt, f, tt)),
        tx,
        gross,
        refundAmt,
        refundCount: rf.length,
        net: gross - refundAmt,
        renewals: tx.filter(isRenewal).length,
      };
    };
    const cur = period(from, to);
    const pre = period(prev.from, prev.to);

    const series = (f: string, tt: string) => ({
      regs: bucketize(students, (s) => s.createdAt, () => 1, f, tt, grain, n),
      paid: bucketize(paidTx, (x) => x.createdAt, () => 1, f, tt, grain, n),
      revenue: bucketize(paidTx, (x) => x.createdAt, (x) => x.amount, f, tt, grain, n),
      refunds: bucketize(approvedRefunds, (r) => r.decidedAt ?? r.requestedAt, (r) => r.amount, f, tt, grain, n),
      renewals: bucketize(paidTx.filter(isRenewal), (x) => x.createdAt, () => 1, f, tt, grain, n),
    });
    const sc = series(from, to);
    const sp = series(prev.from, prev.to);
    const timeline = Array.from({ length: n }, (_, i) => ({
      label: bucketLabel(i, from, grain),
      registrations: sc.regs[i],
      paid: sc.paid[i],
      renewals: sc.renewals[i],
      revenue: sc.revenue[i],
      refunds: sc.refunds[i],
      net: sc.revenue[i] - sc.refunds[i],
      prevRevenue: sp.revenue[i] ?? 0,
      prevRegistrations: sp.regs[i] ?? 0,
    }));

    const pkgRows = packages.map((p, i) => {
      const c = cur.tx.filter((x) => x.packageId === p.id);
      const pp = pre.tx.filter((x) => x.packageId === p.id);
      return { id: p.id, name: L(p, 'name'), color: PKG_COLORS[i % PKG_COLORS.length], count: c.length, prev: pp.length, revenue: c.reduce((s, x) => s + x.amount, 0) };
    });

    const paidStudents = new Set(paidTx.map((x) => x.studentId));
    const srcRows = SOURCES.map((src) => {
      const regs = cur.regs.filter((s) => s.source === src);
      const prevRegs = pre.regs.filter((s) => s.source === src);
      const paid = regs.filter((s) => paidStudents.has(s.id)).length;
      return { src, regs: regs.length, prev: prevRegs.length, paid, conv: regs.length ? (paid / regs.length) * 100 : 0, revenue: cur.tx.filter((x) => students.find((s) => s.id === x.studentId)?.source === src).reduce((s, x) => s + x.amount, 0) };
    });

    const schoolRows = schools
      .map((s) => {
        const c = cur.tx.filter((x) => x.schoolId === s.id);
        const pp = pre.tx.filter((x) => x.schoolId === s.id);
        return { id: s.id, name: L(s, 'name'), tier: s.tier, paid: new Set(c.map((x) => x.studentId)).size, prev: new Set(pp.map((x) => x.studentId)).size, revenue: c.reduce((a, x) => a + x.amount, 0) };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const marketerRows = marketers
      .map((mk) => {
        const c = cur.tx.filter((x) => x.marketerId === mk.id);
        const pp = pre.tx.filter((x) => x.marketerId === mk.id);
        return { id: mk.id, name: L(mk, 'name'), schools: mk.schoolIds.length, paid: new Set(c.map((x) => x.studentId)).size, prev: new Set(pp.map((x) => x.studentId)).size, revenue: c.reduce((a, x) => a + x.amount, 0) };
      })
      .sort((a, b) => b.revenue - a.revenue);

    return { cur, pre, timeline, pkgRows, srcRows, schoolRows, marketerRows };
  }, [range, students, txns, refunds, packages, schools, marketers, L]);

  const delta = (c: number, p: number) => (compare ? <KpiTrend delta={pctChange(c, p)} /> : null);
  const money = (v: number) => fmtMoney(v, 'IQD', true);
  const spark = (k: 'registrations' | 'paid' | 'revenue' | 'refunds' | 'renewals' | 'net') => m.timeline.map((r) => r[k]);

  return (
    <>
      <PageHeader
        title={t('analytics.business.title')}
        subtitle={t('analytics.business.subtitle')}
        actions={
          <>
            <Switch checked={compare} onChange={setCompare} label={<span className="text-xs">{t('common.comparePrevious')}</span>} className="rounded-lg border border-line bg-surface px-3 py-1.5" />
            <DateRangePicker />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard loading={loading} label={t('analytics.business.registrations')} value={fmtNumber(m.cur.regs.length)} delta={compare ? pctChange(m.cur.regs.length, m.pre.regs.length) : undefined} icon={<UserPlus />} trend={spark('registrations')} color="#2563EB" />
        <StatCard loading={loading} label={t('analytics.business.paidSubs')} value={fmtNumber(m.cur.tx.length)} delta={compare ? pctChange(m.cur.tx.length, m.pre.tx.length) : undefined} icon={<CreditCard />} trend={spark('paid')} color="#059669" />
        <StatCard loading={loading} label={t('analytics.business.renewals')} value={fmtNumber(m.cur.renewals)} delta={compare ? pctChange(m.cur.renewals, m.pre.renewals) : undefined} icon={<Repeat />} trend={spark('renewals')} color="#7C3AED" />
        <StatCard loading={loading} label={t('analytics.business.grossRevenue')} value={money(m.cur.gross)} delta={compare ? pctChange(m.cur.gross, m.pre.gross) : undefined} icon={<Wallet />} trend={spark('revenue')} color="#C9A24A" />
        <StatCard loading={loading} label={t('analytics.business.refunds')} value={money(m.cur.refundAmt)} delta={compare ? pctChange(m.cur.refundAmt, m.pre.refundAmt) : undefined} inverse icon={<Undo2 />} trend={spark('refunds')} color="#DC2626" hint={t('analytics.business.refundCount', { count: m.cur.refundCount })} />
        <StatCard loading={loading} label={t('analytics.business.netRevenue')} value={money(m.cur.net)} delta={compare ? pctChange(m.cur.net, m.pre.net) : undefined} icon={<RefreshCcw />} trend={spark('net')} color="#0B1F3A" />
      </div>

      {/* Revenue */}
      <Card className="mt-6">
        <CardHeader title={t('analytics.business.revenueTitle')} subtitle={compare ? t('analytics.business.revenueCompareSub') : t('analytics.business.revenueSub')} />
        <CardBody className="space-y-5">
          {compare ? (
            <LineChart
              loading={loading}
              data={m.timeline}
              xKey="label"
              valueFormat={fmtCompact}
              series={[
                { key: 'revenue', label: t('analytics.business.grossRevenue'), color: '#C9A24A' },
                { key: 'prevRevenue', label: t('analytics.business.previousPeriod'), color: '#0B1F3A' },
              ]}
            />
          ) : (
            <AreaChart
              loading={loading}
              data={m.timeline}
              xKey="label"
              valueFormat={fmtCompact}
              series={[
                { key: 'revenue', label: t('analytics.business.grossRevenue'), color: '#C9A24A' },
                { key: 'refunds', label: t('analytics.business.refunds'), color: '#DC2626' },
              ]}
            />
          )}
          <MiniTable
            className="max-h-64 overflow-y-auto"
            head={[t('common.period'), t('analytics.business.registrations'), t('analytics.business.paidSubs'), t('analytics.business.renewals'), t('analytics.business.grossRevenue'), t('analytics.business.refunds'), t('analytics.business.netRevenue')]}
            rows={[...m.timeline].reverse().map((r) => [r.label, fmtNumber(r.registrations), fmtNumber(r.paid), fmtNumber(r.renewals), fmtMoney(r.revenue), fmtMoney(r.refunds), <span key="n" className="font-semibold">{fmtMoney(r.net)}</span>])}
          />
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* Registrations vs paid */}
        <Card>
          <CardHeader title={t('analytics.business.funnelTitle')} subtitle={t('analytics.business.funnelSub')} />
          <CardBody className="space-y-4">
            <BarChart
              loading={loading}
              data={m.timeline}
              xKey="label"
              height={250}
              valueFormat={(v) => fmtNumber(v)}
              series={[
                { key: 'registrations', label: t('analytics.business.registrations'), color: '#0B1F3A' },
                { key: 'paid', label: t('analytics.business.paidSubs'), color: '#C9A24A' },
                ...(compare ? [{ key: 'prevRegistrations', label: t('analytics.business.prevRegistrations'), color: '#94A3B8' }] : []),
              ]}
            />
            <MiniTable
              head={[t('analytics.business.metric'), t('analytics.business.thisPeriod'), ...(compare ? [t('analytics.business.previousPeriod'), t('analytics.business.change')] : [])]}
              rows={[
                [t('analytics.business.registrations'), fmtNumber(m.cur.regs.length), ...(compare ? [fmtNumber(m.pre.regs.length), delta(m.cur.regs.length, m.pre.regs.length)] : [])],
                [t('analytics.business.paidSubs'), fmtNumber(m.cur.tx.length), ...(compare ? [fmtNumber(m.pre.tx.length), delta(m.cur.tx.length, m.pre.tx.length)] : [])],
                [t('analytics.business.renewals'), fmtNumber(m.cur.renewals), ...(compare ? [fmtNumber(m.pre.renewals), delta(m.cur.renewals, m.pre.renewals)] : [])],
                [t('analytics.business.conversion'), fmtPercent(m.cur.regs.length ? (m.cur.regs.filter((s) => m.cur.tx.some((x) => x.studentId === s.id)).length / m.cur.regs.length) * 100 : 0, 1), ...(compare ? ['', ''] : [])],
              ]}
            />
          </CardBody>
        </Card>

        {/* Packages */}
        <Card>
          <CardHeader title={t('analytics.business.packageTitle')} subtitle={t('analytics.business.packageSub')} />
          <CardBody className="space-y-4">
            <DonutChart
              loading={loading}
              data={m.pkgRows.filter((p) => p.count > 0).map((p) => ({ name: p.name, value: p.count, color: p.color }))}
              centerValue={fmtNumber(m.cur.tx.length)}
              centerLabel={t('analytics.business.paidSubs')}
              height={190}
            />
            <MiniTable
              head={[t('common.package'), t('analytics.business.subs'), t('analytics.business.revenue'), ...(compare ? [t('analytics.business.change')] : [])]}
              rows={m.pkgRows.map((p) => [
                <span key="n" className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}</span>,
                fmtNumber(p.count),
                fmtMoney(p.revenue),
                ...(compare ? [delta(p.count, p.prev)] : []),
              ])}
            />
          </CardBody>
        </Card>

        {/* Source attribution */}
        <Card>
          <CardHeader title={t('analytics.business.sourceTitle')} subtitle={t('analytics.business.sourceSub')} />
          <CardBody className="space-y-4">
            <BarChart
              loading={loading}
              horizontal
              colorByRow
              height={220}
              categoryWidth={90}
              data={m.srcRows.map((r) => ({ name: t(`analytics.sources.${r.src}`), value: r.regs, color: SOURCE_COLORS[r.src] }))}
              xKey="name"
              valueFormat={(v) => fmtNumber(v)}
              series={[{ key: 'value', label: t('analytics.business.registrations'), color: '#0B1F3A' }]}
            />
            <MiniTable
              head={[t('analytics.business.source'), t('analytics.business.registrations'), t('analytics.business.paid'), t('analytics.business.conversion'), t('analytics.business.revenue'), ...(compare ? [t('analytics.business.change')] : [])]}
              rows={m.srcRows.map((r) => [t(`analytics.sources.${r.src}`), fmtNumber(r.regs), fmtNumber(r.paid), fmtPercent(r.conv), fmtMoney(r.revenue, 'IQD', true), ...(compare ? [delta(r.regs, r.prev)] : [])])}
            />
          </CardBody>
        </Card>

        {/* Schools */}
        <Card>
          <CardHeader
            title={t('analytics.business.schoolTitle')}
            subtitle={t('analytics.business.schoolSub')}
            action={<Link to="/schools" className="text-xs font-semibold text-accent hover:underline">{t('actions.viewAll')}</Link>}
          />
          <CardBody className="space-y-4">
            <BarChart
              loading={loading}
              horizontal
              height={220}
              categoryWidth={150}
              data={m.schoolRows.slice(0, 6).map((r) => ({ name: r.name.length > 24 ? `${r.name.slice(0, 23)}…` : r.name, revenue: r.revenue }))}
              xKey="name"
              valueFormat={fmtCompact}
              series={[{ key: 'revenue', label: t('analytics.business.revenue'), color: '#C9A24A' }]}
            />
            <MiniTable
              className="max-h-60 overflow-y-auto"
              head={[t('common.school'), t('analytics.business.tier'), t('analytics.business.paid'), t('analytics.business.revenue'), ...(compare ? [t('analytics.business.change')] : [])]}
              rows={m.schoolRows.map((r) => [
                <Link key="n" to={`/schools/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link>,
                <Badge key="t" tone={r.tier === 'Gold' || r.tier === 'Platinum' ? 'accent' : r.tier === 'Silver' ? 'slate' : 'neutral'}>{t(`analytics.tiers.${r.tier}`, { defaultValue: r.tier })}</Badge>,
                fmtNumber(r.paid),
                fmtMoney(r.revenue, 'IQD', true),
                ...(compare ? [delta(r.paid, r.prev)] : []),
              ])}
            />
          </CardBody>
        </Card>
      </div>

      {/* Marketers */}
      <Card className="mt-6">
        <CardHeader
          title={t('analytics.business.marketerTitle')}
          subtitle={t('analytics.business.marketerSub')}
          action={<Link to="/marketers" className="text-xs font-semibold text-accent hover:underline">{t('actions.viewAll')}</Link>}
        />
        <CardBody className="grid gap-6 lg:grid-cols-2">
          <BarChart
            loading={loading}
            height={240}
            data={m.marketerRows.map((r, i) => ({ name: r.name.split(' ')[0], paid: r.paid, color: CHART_COLORS[i % CHART_COLORS.length] }))}
            xKey="name"
            colorByRow
            valueFormat={(v) => fmtNumber(v)}
            series={[{ key: 'paid', label: t('analytics.business.paid'), color: '#0B1F3A' }]}
          />
          <MiniTable
            head={[t('common.marketer'), t('analytics.business.schools'), t('analytics.business.paid'), t('analytics.business.revenue'), ...(compare ? [t('analytics.business.change')] : [])]}
            rows={m.marketerRows.map((r) => [
              <Link key="n" to={`/marketers/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link>,
              fmtNumber(r.schools),
              fmtNumber(r.paid),
              fmtMoney(r.revenue, 'IQD', true),
              ...(compare ? [delta(r.paid, r.prev)] : []),
            ])}
          />
        </CardBody>
      </Card>
    </>
  );
}
