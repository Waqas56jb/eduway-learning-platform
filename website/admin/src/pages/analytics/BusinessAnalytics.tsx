import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, RefreshCcw, Repeat, Undo2, UserPlus, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AcquisitionSource } from '@/types';
import { useBusinessAnalytics } from '@/api/analytics';
import type { Kpi } from '@/api/types';
import { flatLoc, flatRef } from '@/api/adapters';
import { useUi } from '@/store/ui';
import { useLocalize } from '@/hooks/useLocale';
import { cn } from '@/utils/cn';
import { fmtCompact, fmtMoney, fmtNumber, fmtPercent } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { AreaChart, BarChart, CHART_COLORS, DonutChart, LineChart } from '@/components/charts';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DateRangePicker,
  KpiTrend,
  StatCard,
  Switch,
} from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';

const pctChange = (cur: number, prev: number) =>
  prev === 0 ? (cur === 0 ? 0 : 100) : ((cur - prev) / prev) * 100;
const PLATFORM_COLORS: Record<string, string> = {
  web: '#0B1F3A',
  ios: '#C9A24A',
  android: '#059669',
};
const SOURCE_COLORS: Record<AcquisitionSource, string> = {
  organic: '#0B1F3A',
  school: '#C9A24A',
  marketer: '#7C3AED',
  referral: '#059669',
  campaign: '#EA580C',
};
const PKG_COLORS = ['#0B1F3A', '#C9A24A', '#2563EB', '#059669', '#DB2777'];

/** Compact table used under each chart. */
function MiniTable({
  head,
  rows,
  className,
}: {
  head: ReactNode[];
  rows: ReactNode[][];
  className?: string;
}) {
  return (
    <div className={cn('scrollbar-thin overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th
                key={i}
                className={cn(
                  'whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted',
                  i === 0 ? 'text-start' : 'text-end',
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-line last:border-0">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={cn(
                    'whitespace-nowrap px-3 py-2',
                    ci === 0 ? 'text-start' : 'num text-end',
                  )}
                >
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
  const q = useBusinessAnalytics({ from: range.from, to: range.to, compare });
  const loading = q.isLoading;

  const m = useMemo(() => {
    const d = q.data;
    const zero: Kpi = { value: 0, prev: null, deltaPct: null, spark: [] };
    const k = d?.kpis;
    const kv = (x: typeof zero | undefined) => x ?? zero;
    const cur = {
      regs: kv(k?.registrations).value,
      paid: kv(k?.paidSubscriptions).value,
      renewals: kv(k?.renewals).value,
      gross: kv(k?.grossRevenue).value,
      refundAmt: kv(k?.refunds).value,
      refundCount: k?.refunds.count ?? 0,
      net: kv(k?.netRevenue).value,
    };
    const delta = {
      regs: k?.registrations.deltaPct ?? undefined,
      paid: k?.paidSubscriptions.deltaPct ?? undefined,
      renewals: k?.renewals.deltaPct ?? undefined,
      gross: k?.grossRevenue.deltaPct ?? undefined,
      refundAmt: k?.refunds.deltaPct ?? undefined,
      net: k?.netRevenue.deltaPct ?? undefined,
    };
    const timeline = (d?.timeline ?? []).map((r) => ({
      ...r,
      prevRevenue: r.prevRevenue ?? 0,
      prevRegistrations: r.prevRegistrations ?? 0,
    }));
    const funnel = d?.funnel;
    const pre = {
      regs: funnel?.prev?.registrations ?? kv(k?.registrations).prev ?? 0,
      paid: funnel?.prev?.paid ?? kv(k?.paidSubscriptions).prev ?? 0,
      renewals: funnel?.prev?.renewals ?? kv(k?.renewals).prev ?? 0,
    };
    const pkgRows = (d?.packages ?? []).map((p, i) => ({
      id: p.packageId,
      name: L(flatRef(p), 'name'),
      color: p.color || PKG_COLORS[i % PKG_COLORS.length],
      count: p.count,
      prev: p.prev ?? 0,
      revenue: p.revenue,
    }));
    const srcRows = (d?.sources ?? []).map((r) => ({
      src: r.source,
      label: L(flatLoc('label', r.label), 'label'),
      color: r.color || SOURCE_COLORS[r.source],
      regs: r.regs,
      prev: r.prev ?? 0,
      paid: r.paid,
      conv: r.conv,
      revenue: r.revenue,
    }));
    const schoolRows = (d?.schools ?? []).map((r) => ({
      id: r.id,
      name: L(flatRef(r), 'name'),
      tier: r.tier,
      paid: r.paid,
      prev: r.prev ?? 0,
      revenue: r.revenue,
    }));
    const marketerRows = (d?.marketers ?? []).map((r) => ({
      id: r.id,
      name: L(flatRef(r), 'name'),
      color: r.color,
      schools: r.schools,
      paid: r.paid,
      prev: r.prev ?? 0,
      revenue: r.revenue,
    }));
    const platforms = d?.platforms ?? [];
    return {
      cur,
      pre,
      delta,
      timeline,
      conversion: funnel?.conversionPct ?? 0,
      prevConversion: funnel?.prev?.conversionPct ?? null,
      pkgRows,
      srcRows,
      schoolRows,
      marketerRows,
      platforms,
    };
  }, [q.data, L]);

  const delta = (c: number, p: number) => (compare ? <KpiTrend delta={pctChange(c, p)} /> : null);
  const money = (v: number) => fmtMoney(v, 'IQD', true);
  const spark = (k: 'registrations' | 'paid' | 'revenue' | 'refunds' | 'renewals' | 'net') =>
    m.timeline.map((r) => r[k]);

  return (
    <>
      <PageHeader
        title={t('analytics.business.title')}
        subtitle={t('analytics.business.subtitle')}
        actions={
          <>
            <Switch
              checked={compare}
              onChange={setCompare}
              label={<span className="text-xs">{t('common.comparePrevious')}</span>}
              className="rounded-lg border border-line bg-surface px-3 py-1.5"
            />
            <DateRangePicker />
          </>
        }
      />

      {q.error && !q.data ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <StatCard
              loading={loading}
              label={t('analytics.business.registrations')}
              value={fmtNumber(m.cur.regs)}
              delta={compare ? m.delta.regs : undefined}
              icon={<UserPlus />}
              trend={spark('registrations')}
              color="#2563EB"
            />
            <StatCard
              loading={loading}
              label={t('analytics.business.paidSubs')}
              value={fmtNumber(m.cur.paid)}
              delta={compare ? m.delta.paid : undefined}
              icon={<CreditCard />}
              trend={spark('paid')}
              color="#059669"
            />
            <StatCard
              loading={loading}
              label={t('analytics.business.renewals')}
              value={fmtNumber(m.cur.renewals)}
              delta={compare ? m.delta.renewals : undefined}
              icon={<Repeat />}
              trend={spark('renewals')}
              color="#7C3AED"
            />
            <StatCard
              loading={loading}
              label={t('analytics.business.grossRevenue')}
              value={money(m.cur.gross)}
              delta={compare ? m.delta.gross : undefined}
              icon={<Wallet />}
              trend={spark('revenue')}
              color="#C9A24A"
            />
            <StatCard
              loading={loading}
              label={t('analytics.business.refunds')}
              value={money(m.cur.refundAmt)}
              delta={compare ? m.delta.refundAmt : undefined}
              inverse
              icon={<Undo2 />}
              trend={spark('refunds')}
              color="#DC2626"
              hint={t('analytics.business.refundCount', { count: m.cur.refundCount })}
            />
            <StatCard
              loading={loading}
              label={t('analytics.business.netRevenue')}
              value={money(m.cur.net)}
              delta={compare ? m.delta.net : undefined}
              icon={<RefreshCcw />}
              trend={spark('net')}
              color="#0B1F3A"
            />
          </div>

          {/* Revenue */}
          <Card className="mt-6">
            <CardHeader
              title={t('analytics.business.revenueTitle')}
              subtitle={
                compare
                  ? t('analytics.business.revenueCompareSub')
                  : t('analytics.business.revenueSub')
              }
            />
            <CardBody className="space-y-5">
              {compare ? (
                <LineChart
                  loading={loading}
                  data={m.timeline}
                  xKey="label"
                  valueFormat={fmtCompact}
                  series={[
                    {
                      key: 'revenue',
                      label: t('analytics.business.grossRevenue'),
                      color: '#C9A24A',
                    },
                    {
                      key: 'prevRevenue',
                      label: t('analytics.business.previousPeriod'),
                      color: '#0B1F3A',
                    },
                  ]}
                />
              ) : (
                <AreaChart
                  loading={loading}
                  data={m.timeline}
                  xKey="label"
                  valueFormat={fmtCompact}
                  series={[
                    {
                      key: 'revenue',
                      label: t('analytics.business.grossRevenue'),
                      color: '#C9A24A',
                    },
                    { key: 'refunds', label: t('analytics.business.refunds'), color: '#DC2626' },
                  ]}
                />
              )}
              <MiniTable
                className="max-h-64 overflow-y-auto"
                head={[
                  t('common.period'),
                  t('analytics.business.registrations'),
                  t('analytics.business.paidSubs'),
                  t('analytics.business.renewals'),
                  t('analytics.business.grossRevenue'),
                  t('analytics.business.refunds'),
                  t('analytics.business.netRevenue'),
                ]}
                rows={[...m.timeline].reverse().map((r) => [
                  r.label,
                  fmtNumber(r.registrations),
                  fmtNumber(r.paid),
                  fmtNumber(r.renewals),
                  fmtMoney(r.revenue),
                  fmtMoney(r.refunds),
                  <span key="n" className="font-semibold">
                    {fmtMoney(r.net)}
                  </span>,
                ])}
              />
            </CardBody>
          </Card>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            {/* Registrations vs paid */}
            <Card>
              <CardHeader
                title={t('analytics.business.funnelTitle')}
                subtitle={t('analytics.business.funnelSub')}
              />
              <CardBody className="space-y-4">
                <BarChart
                  loading={loading}
                  data={m.timeline}
                  xKey="label"
                  height={250}
                  valueFormat={(v) => fmtNumber(v)}
                  series={[
                    {
                      key: 'registrations',
                      label: t('analytics.business.registrations'),
                      color: '#0B1F3A',
                    },
                    { key: 'paid', label: t('analytics.business.paidSubs'), color: '#C9A24A' },
                    ...(compare
                      ? [
                          {
                            key: 'prevRegistrations',
                            label: t('analytics.business.prevRegistrations'),
                            color: '#94A3B8',
                          },
                        ]
                      : []),
                  ]}
                />
                <MiniTable
                  head={[
                    t('analytics.business.metric'),
                    t('analytics.business.thisPeriod'),
                    ...(compare
                      ? [t('analytics.business.previousPeriod'), t('analytics.business.change')]
                      : []),
                  ]}
                  rows={[
                    [
                      t('analytics.business.registrations'),
                      fmtNumber(m.cur.regs),
                      ...(compare ? [fmtNumber(m.pre.regs), delta(m.cur.regs, m.pre.regs)] : []),
                    ],
                    [
                      t('analytics.business.paidSubs'),
                      fmtNumber(m.cur.paid),
                      ...(compare ? [fmtNumber(m.pre.paid), delta(m.cur.paid, m.pre.paid)] : []),
                    ],
                    [
                      t('analytics.business.renewals'),
                      fmtNumber(m.cur.renewals),
                      ...(compare
                        ? [fmtNumber(m.pre.renewals), delta(m.cur.renewals, m.pre.renewals)]
                        : []),
                    ],
                    [
                      t('analytics.business.conversion'),
                      fmtPercent(m.conversion, 1),
                      ...(compare
                        ? [
                            m.prevConversion == null ? '' : fmtPercent(m.prevConversion, 1),
                            m.prevConversion == null ? '' : delta(m.conversion, m.prevConversion),
                          ]
                        : []),
                    ],
                  ]}
                />
              </CardBody>
            </Card>

            {/* Packages */}
            <Card>
              <CardHeader
                title={t('analytics.business.packageTitle')}
                subtitle={t('analytics.business.packageSub')}
              />
              <CardBody className="space-y-4">
                <DonutChart
                  loading={loading}
                  data={m.pkgRows
                    .filter((p) => p.count > 0)
                    .map((p) => ({ name: p.name, value: p.count, color: p.color }))}
                  centerValue={fmtNumber(m.cur.paid)}
                  centerLabel={t('analytics.business.paidSubs')}
                  height={190}
                />
                <MiniTable
                  head={[
                    t('common.package'),
                    t('analytics.business.subs'),
                    t('analytics.business.revenue'),
                    ...(compare ? [t('analytics.business.change')] : []),
                  ]}
                  rows={m.pkgRows.map((p) => [
                    <span key="n" className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                      {p.name}
                    </span>,
                    fmtNumber(p.count),
                    fmtMoney(p.revenue),
                    ...(compare ? [delta(p.count, p.prev)] : []),
                  ])}
                />
              </CardBody>
            </Card>

            {/* Source attribution */}
            <Card>
              <CardHeader
                title={t('analytics.business.sourceTitle')}
                subtitle={t('analytics.business.sourceSub')}
              />
              <CardBody className="space-y-4">
                <BarChart
                  loading={loading}
                  horizontal
                  colorByRow
                  height={220}
                  categoryWidth={90}
                  data={m.srcRows.map((r) => ({
                    name: t(`analytics.sources.${r.src}`, { defaultValue: r.label }),
                    value: r.regs,
                    color: r.color,
                  }))}
                  xKey="name"
                  valueFormat={(v) => fmtNumber(v)}
                  series={[
                    {
                      key: 'value',
                      label: t('analytics.business.registrations'),
                      color: '#0B1F3A',
                    },
                  ]}
                />
                <MiniTable
                  head={[
                    t('analytics.business.source'),
                    t('analytics.business.registrations'),
                    t('analytics.business.paid'),
                    t('analytics.business.conversion'),
                    t('analytics.business.revenue'),
                    ...(compare ? [t('analytics.business.change')] : []),
                  ]}
                  rows={m.srcRows.map((r) => [
                    t(`analytics.sources.${r.src}`, { defaultValue: r.label }),
                    fmtNumber(r.regs),
                    fmtNumber(r.paid),
                    fmtPercent(r.conv),
                    fmtMoney(r.revenue, 'IQD', true),
                    ...(compare ? [delta(r.regs, r.prev)] : []),
                  ])}
                />
              </CardBody>
            </Card>

            {/* Schools */}
            <Card>
              <CardHeader
                title={t('analytics.business.schoolTitle')}
                subtitle={t('analytics.business.schoolSub')}
                action={
                  <Link to="/schools" className="text-xs font-semibold text-accent hover:underline">
                    {t('actions.viewAll')}
                  </Link>
                }
              />
              <CardBody className="space-y-4">
                <BarChart
                  loading={loading}
                  horizontal
                  height={220}
                  categoryWidth={150}
                  data={m.schoolRows
                    .slice(0, 6)
                    .map((r) => ({
                      name: r.name.length > 24 ? `${r.name.slice(0, 23)}…` : r.name,
                      revenue: r.revenue,
                    }))}
                  xKey="name"
                  valueFormat={fmtCompact}
                  series={[
                    { key: 'revenue', label: t('analytics.business.revenue'), color: '#C9A24A' },
                  ]}
                />
                <MiniTable
                  className="max-h-60 overflow-y-auto"
                  head={[
                    t('common.school'),
                    t('analytics.business.tier'),
                    t('analytics.business.paid'),
                    t('analytics.business.revenue'),
                    ...(compare ? [t('analytics.business.change')] : []),
                  ]}
                  rows={m.schoolRows.map((r) => [
                    <Link key="n" to={`/schools/${r.id}`} className="font-medium hover:text-accent">
                      {r.name}
                    </Link>,
                    <Badge
                      key="t"
                      tone={
                        r.tier === 'Gold' || r.tier === 'Platinum'
                          ? 'accent'
                          : r.tier === 'Silver'
                            ? 'slate'
                            : 'neutral'
                      }
                    >
                      {t(`analytics.tiers.${r.tier}`, { defaultValue: r.tier })}
                    </Badge>,
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
              action={
                <Link to="/marketers" className="text-xs font-semibold text-accent hover:underline">
                  {t('actions.viewAll')}
                </Link>
              }
            />
            <CardBody className="grid gap-6 lg:grid-cols-2">
              <BarChart
                loading={loading}
                height={240}
                data={m.marketerRows.map((r, i) => ({
                  name: r.name.split(' ')[0],
                  paid: r.paid,
                  color: r.color || CHART_COLORS[i % CHART_COLORS.length],
                }))}
                xKey="name"
                colorByRow
                valueFormat={(v) => fmtNumber(v)}
                series={[{ key: 'paid', label: t('analytics.business.paid'), color: '#0B1F3A' }]}
              />
              <MiniTable
                head={[
                  t('common.marketer'),
                  t('analytics.business.schools'),
                  t('analytics.business.paid'),
                  t('analytics.business.revenue'),
                  ...(compare ? [t('analytics.business.change')] : []),
                ]}
                rows={m.marketerRows.map((r) => [
                  <Link key="n" to={`/marketers/${r.id}`} className="font-medium hover:text-accent">
                    {r.name}
                  </Link>,
                  fmtNumber(r.schools),
                  fmtNumber(r.paid),
                  fmtMoney(r.revenue, 'IQD', true),
                  ...(compare ? [delta(r.paid, r.prev)] : []),
                ])}
              />
            </CardBody>
          </Card>

          {/* Platform split (web / iOS / Android) */}
          <Card className="mt-6">
            <CardHeader
              title={t('analytics.platform.title')}
              subtitle={t('analytics.platform.businessSub')}
            />
            <CardBody className="grid gap-6 lg:grid-cols-2">
              <DonutChart
                loading={loading}
                data={m.platforms.map((p) => ({
                  name: t(`analytics.platform.${p.platform}`),
                  value: p.registrations,
                  color: PLATFORM_COLORS[p.platform],
                }))}
                centerValue={fmtNumber(m.platforms.reduce((a, p) => a + p.registrations, 0))}
                centerLabel={t('analytics.business.registrations')}
                height={190}
              />
              <MiniTable
                head={[
                  t('analytics.platform.platform'),
                  t('analytics.business.registrations'),
                  t('analytics.business.paid'),
                  t('analytics.business.revenue'),
                ]}
                rows={m.platforms.map((p) => [
                  <span key="n" className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: PLATFORM_COLORS[p.platform] }}
                    />
                    {t(`analytics.platform.${p.platform}`)}
                  </span>,
                  fmtNumber(p.registrations),
                  fmtNumber(p.paid),
                  fmtMoney(p.revenue, 'IQD', true),
                ])}
              />
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}
