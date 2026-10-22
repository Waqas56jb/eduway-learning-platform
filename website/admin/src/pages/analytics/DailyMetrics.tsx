import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Activity, Bot, CalendarDays, CheckCircle2, Clock, Coins, GraduationCap, LineChart as LineIcon, UserPlus, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DAILY_FIELDS, useDailyMetrics, type DailyField, type DailyRow } from '@/api/drilldown';
import { useLookups } from '@/api/lookups';
import type { Platform } from '@/api/types';
import { useUi } from '@/store/ui';
import { useLocalize } from '@/hooks/useLocale';
import { fmtDate, fmtMoney, fmtNumber, fmtPercent } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { AreaChart, BarChart, CHART_COLORS, LineChart } from '@/components/charts';
import { Card, CardBody, CardHeader, DataTable, DateRangePicker, EmptyState, Segmented, Select, StatCard } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';

type PlatformFilter = 'all' | Platform;
const RATE_FIELDS: DailyField[] = ['videoCompletionRate', 'quizCompletionRate', 'errorRate'];
const EXPLORE_COLORS: Partial<Record<DailyField, string>> = { watchMinutes: '#C9A24A', revenue: '#16A34A', aiQuestions: '#7C3AED', registrations: '#2563EB' };

/** ADM-ANL-03 — day-by-day platform metrics (rollups + live today) with platform filter, charts and a CSV-exportable table. */
export default function DailyMetrics() {
  const { t } = useTranslation();
  const L = useLocalize();
  const range = useUi((s) => s.range);
  const lookups = useLookups();
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [metric, setMetric] = useState<DailyField>('watchMinutes');
  const q = useDailyMetrics({ from: range.from, to: range.to, platform: platform === 'all' ? '' : platform });
  const rows = useMemo(() => q.data ?? [], [q.data]);
  const loading = q.isLoading;

  const label = (f: DailyField) => t(`drilldown.daily.fields.${f}`);
  const fmtField = (f: DailyField, v: number | undefined) => {
    const n = v ?? 0;
    if (RATE_FIELDS.includes(f)) return fmtPercent(n, 1);
    if (f === 'revenue') return fmtMoney(n);
    if (f === 'aiCostUsd') return fmtMoney(n, 'USD');
    return fmtNumber(Math.round(n * 10) / 10);
  };

  const chartRows = useMemo(
    () =>
      rows.map((r) => {
        const out: Record<string, number | string> = { label: fmtDate(`${r.date}T00:00:00`, 'd MMM') };
        for (const f of DAILY_FIELDS) out[f] = r[f] ?? 0;
        for (const [slug, n] of Object.entries(r.aiBySubject ?? {})) out[`ai_${slug}`] = n;
        return out;
      }),
    [rows],
  );

  const sum = (f: DailyField) => rows.reduce((a, r) => a + (r[f] ?? 0), 0);
  const avg = (f: DailyField) => (rows.length ? sum(f) / rows.length : 0);
  const max = (f: DailyField) => rows.reduce((a, r) => Math.max(a, r[f] ?? 0), 0);
  const trend = (f: DailyField) => rows.map((r) => r[f] ?? 0);
  /** Weighted completion (the per-day rates are already percentages). */
  const avgRate = (f: DailyField, weight: DailyField) => {
    const w = sum(weight);
    return w ? rows.reduce((a, r) => a + (r[f] ?? 0) * (r[weight] ?? 0), 0) / w : avg(f);
  };

  const aiSlugs = useMemo(() => [...new Set(rows.flatMap((r) => Object.keys(r.aiBySubject ?? {})))], [rows]);
  const aiSeries = aiSlugs.map((slug, i) => {
    const s = lookups.subjects.find((x) => x.slug === slug);
    return { key: `ai_${slug}`, label: s ? L(s, 'name') : slug, color: s?.color ?? CHART_COLORS[i % CHART_COLORS.length] };
  });
  const aiTotal = aiSlugs.reduce((a, slug) => a + rows.reduce((b, r) => b + (r.aiBySubject?.[slug] ?? 0), 0), 0);

  const columns = useMemo<ColumnDef<DailyRow>[]>(
    () => [
      {
        id: 'date',
        accessorKey: 'date',
        header: t('common.date'),
        meta: { label: t('common.date') },
        cell: ({ getValue }) => <span className="whitespace-nowrap font-medium">{fmtDate(`${getValue<string>()}T00:00:00`, 'EEE d MMM yyyy')}</span>,
      },
      ...DAILY_FIELDS.map(
        (f): ColumnDef<DailyRow> => ({
          id: f,
          accessorFn: (r) => r[f] ?? 0,
          header: t(`drilldown.daily.fields.${f}`),
          meta: { label: t(`drilldown.daily.fields.${f}`), align: 'end' },
          cell: ({ getValue }) => <span className="whitespace-nowrap num">{fmtField(f, getValue<number>())}</span>,
        }),
      ),
    ],
    [t],
  );

  const tableRows = useMemo(() => [...rows].sort((a, b) => b.date.localeCompare(a.date)), [rows]);
  const allZero = rows.length > 0 && rows.every((r) => DAILY_FIELDS.every((f) => !r[f]));

  return (
    <>
      <PageHeader
        title={t('drilldown.daily.title')}
        subtitle={t('drilldown.daily.subtitle')}
        actions={
          <>
            <Segmented
              size="sm"
              aria-label={t('drilldown.daily.platform')}
              value={platform}
              onChange={setPlatform}
              options={[
                { value: 'all', label: t('common.all') },
                { value: 'web', label: t('notifications.platforms.web') },
                { value: 'ios', label: t('notifications.platforms.ios') },
                { value: 'android', label: t('notifications.platforms.android') },
              ]}
            />
            <DateRangePicker />
          </>
        }
      />

      {q.error && !q.data ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          {platform !== 'all' && <p className="mb-4 text-xs text-muted">{t('drilldown.daily.platformNote')}</p>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard loading={loading} label={t('drilldown.daily.avgDau')} value={fmtNumber(Math.round(avg('dau')))} hint={t('drilldown.daily.peak', { value: fmtNumber(max('dau')) })} icon={<Users />} trend={trend('dau')} color="#0B1F3A" />
            <StatCard
              loading={loading}
              label={t('drilldown.daily.watchHours')}
              value={fmtNumber(Math.round(sum('watchMinutes') / 60))}
              hint={t('drilldown.daily.videoCompletion', { value: fmtPercent(avg('videoCompletionRate'), 1) })}
              icon={<Clock />}
              trend={trend('watchMinutes')}
              color="#C9A24A"
            />
            <StatCard
              loading={loading}
              label={t('drilldown.daily.fields.quizAttempts')}
              value={fmtNumber(sum('quizAttempts'))}
              hint={t('drilldown.daily.quizCompletion', { value: fmtPercent(avgRate('quizCompletionRate', 'quizAttempts'), 1) })}
              icon={<CheckCircle2 />}
              trend={trend('quizAttempts')}
              color="#059669"
            />
            <StatCard loading={loading} label={t('drilldown.daily.fields.examAttempts')} value={fmtNumber(sum('examAttempts'))} icon={<GraduationCap />} trend={trend('examAttempts')} color="#2563EB" />
            <StatCard
              loading={loading}
              label={t('drilldown.daily.fields.aiQuestions')}
              value={fmtNumber(sum('aiQuestions'))}
              hint={t('drilldown.daily.aiCost', { tokens: fmtNumber(sum('aiTokens')), cost: fmtMoney(sum('aiCostUsd'), 'USD') })}
              icon={<Bot />}
              trend={trend('aiQuestions')}
              color="#7C3AED"
            />
            <StatCard loading={loading} label={t('drilldown.daily.fields.registrations')} value={fmtNumber(sum('registrations'))} icon={<UserPlus />} trend={trend('registrations')} color="#DB2777" />
            <StatCard loading={loading} label={t('drilldown.daily.fields.revenue')} value={fmtMoney(sum('revenue'), 'IQD', true)} icon={<Coins />} trend={trend('revenue')} color="#16A34A" />
            <StatCard loading={loading} label={t('drilldown.daily.days')} value={fmtNumber(rows.length)} hint={rows.length ? `${fmtDate(`${rows[0].date}T00:00:00`)} – ${fmtDate(`${rows[rows.length - 1].date}T00:00:00`)}` : undefined} icon={<CalendarDays />} color="#64748B" />
          </div>

          {allZero && !loading && (
            <Card className="mt-6">
              <EmptyState compact title={t('drilldown.daily.emptyTitle')} hint={t('drilldown.daily.emptyHint')} />
            </Card>
          )}

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader icon={<Activity className="h-4 w-4" />} title={t('drilldown.daily.activeTitle')} subtitle={t('drilldown.daily.activeSub')} />
              <CardBody>
                <LineChart
                  loading={loading}
                  data={chartRows}
                  xKey="label"
                  valueFormat={(v) => fmtNumber(v)}
                  series={[
                    { key: 'dau', label: label('dau'), color: '#0B1F3A' },
                    { key: 'wau', label: label('wau'), color: '#C9A24A' },
                    { key: 'mau', label: label('mau'), color: '#2563EB' },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                icon={<LineIcon className="h-4 w-4" />}
                title={t('drilldown.daily.explorer')}
                subtitle={t('drilldown.daily.explorerSub')}
                action={
                  <Select
                    className="w-52"
                    aria-label={t('drilldown.daily.metric')}
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as DailyField)}
                    options={DAILY_FIELDS.map((f) => ({ value: f, label: label(f) }))}
                  />
                }
              />
              <CardBody>
                <AreaChart
                  loading={loading}
                  data={chartRows}
                  xKey="label"
                  valueFormat={(v) => fmtField(metric, v)}
                  series={[{ key: metric, label: label(metric), color: EXPLORE_COLORS[metric] ?? '#0B1F3A' }]}
                  legend={false}
                />
              </CardBody>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader icon={<Bot className="h-4 w-4" />} title={t('drilldown.daily.aiBySubject')} subtitle={t('drilldown.daily.aiBySubjectSub', { count: aiTotal })} />
            <CardBody>
              {!loading && aiSeries.length === 0 ? (
                <EmptyState compact title={t('drilldown.daily.noAi')} hint=" " />
              ) : (
                <BarChart loading={loading} data={chartRows} xKey="label" stacked valueFormat={(v) => fmtNumber(v)} series={aiSeries} height={260} />
              )}
            </CardBody>
          </Card>

          <div className="mt-6">
            <h2 className="mb-3 text-base font-semibold text-ink">{t('drilldown.daily.table')}</h2>
            <DataTable
              data={tableRows}
              columns={columns}
              loading={loading}
              error={q.error}
              onRetry={() => q.refetch()}
              getRowId={(r) => r.date}
              hideSearch
              exportName={`daily-metrics${platform === 'all' ? '' : `-${platform}`}`}
              initialHidden={['errorRate', 'aiTokens', 'aiActiveUsers']}
              pageSize={15}
              emptyTitle={t('drilldown.daily.emptyTitle')}
              emptyHint={t('drilldown.daily.emptyHint')}
            />
          </div>
        </>
      )}
    </>
  );
}
