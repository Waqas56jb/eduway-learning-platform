import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Bot, Download, FileClock, FileSpreadsheet, GraduationCap, Lock, Receipt, School, ScrollText, ShieldCheck, Undo2, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { ExportRecord } from '@/types';
import { activityInRange } from '@/data/analytics';
import { rangeFromPreset, useUi, type DateRange } from '@/store/ui';
import { useCan, useCurrentAdmin } from '@/store/auth';
import { governorates as govs } from '@/data/geo';
import { usePackages, useRefunds, useSchools, useStudents, useTransactions } from '@/store/core';
import { useAudit } from '@/store/audit';
import { useExports } from '@/store/exports';
import { useMockLoading } from '@/hooks/useMockLoading';
import { cn } from '@/utils/cn';
import { exportCsv } from '@/utils/csv';
import { uid } from '@/utils/id';
import { fmtDate, fmtDateTime, fmtNumber, fmtRelative } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, Card, CardBody, CardHeader, DataTable, DateRangePicker, FilterSelect, Segmented } from '@/components/ui';
import { inRange } from './buckets';

type ReportKey = 'students' | 'transactions' | 'refunds' | 'schools' | 'learning' | 'ai' | 'audit';

const REPORTS: { key: ReportKey; icon: LucideIcon; sensitive?: boolean }[] = [
  { key: 'students', icon: GraduationCap, sensitive: true },
  { key: 'transactions', icon: Receipt, sensitive: true },
  { key: 'refunds', icon: Undo2, sensitive: true },
  { key: 'schools', icon: School },
  { key: 'learning', icon: FileSpreadsheet },
  { key: 'ai', icon: Bot },
  { key: 'audit', icon: ScrollText, sensitive: true },
];

type Row = Record<string, unknown>;

export default function Exports() {
  const { t } = useTranslation();
  const can = useCan();
  const admin = useCurrentAdmin();
  const loading = useMockLoading(400);
  const globalRange = useUi((s) => s.range);
  const allowed = can('analytics', 'export');

  const [report, setReport] = useState<ReportKey>('transactions');
  const [range, setRange] = useState<DateRange>(globalRange.preset === 'today' ? rangeFromPreset('30d') : globalRange);
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const [busy, setBusy] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('');

  const students = useStudents((s) => s.items);
  const txns = useTransactions((s) => s.items);
  const refunds = useRefunds((s) => s.items);
  const schools = useSchools((s) => s.items);
  const packages = usePackages((s) => s.items);
  const audit = useAudit((s) => s.items);
  const history = useExports((s) => s.items);
  const addExport = useExports((s) => s.add);

  /** Builds the rows for the chosen report within the range. */
  const rows = useMemo<Row[]>(() => {
    const { from, to } = range;
    const pkgName = (id: string | null) => packages.find((p) => p.id === id)?.name_en ?? '';
    const schoolName = (id: string | null) => schools.find((s) => s.id === id)?.name_en ?? '';
    switch (report) {
      case 'students':
        return students
          .filter((s) => inRange(s.createdAt, from, to))
          .map((s) => ({ id: s.id, name_en: s.name_en, name_ar: s.name_ar, mobile: s.mobile, governorate: govs.find((g) => g.id === s.governorateId)?.name_en ?? '', school: schoolName(s.schoolId), package: pkgName(s.packageId), subscription: s.subscriptionStatus, source: s.source, created: s.createdAt }));
      case 'transactions':
        return txns
          .filter((x) => inRange(x.createdAt, from, to))
          .map((x) => ({ ref: x.ref, student: students.find((s) => s.id === x.studentId)?.name_en ?? x.studentId, package: pkgName(x.packageId), amount: x.amount, discount: x.discount, currency: x.currency, gateway: x.gateway, status: x.status, refunded: x.refundedAmount, promo: x.promoCode ?? '', school: schoolName(x.schoolId), created: x.createdAt }));
      case 'refunds':
        return refunds
          .filter((r) => inRange(r.requestedAt, from, to))
          .map((r) => ({ id: r.id, transaction: txns.find((x) => x.id === r.transactionId)?.ref ?? r.transactionId, student: students.find((s) => s.id === r.studentId)?.name_en ?? r.studentId, amount: r.amount, kind: r.kind, reason: r.reason, status: r.status, requested_by: r.requestedBy, requested_at: r.requestedAt, decided_by: r.decidedBy ?? '', decided_at: r.decidedAt ?? '' }));
      case 'schools':
        return schools.map((s) => {
          const tx = txns.filter((x) => x.schoolId === s.id && inRange(x.createdAt, from, to) && (x.status === 'paid' || x.status === 'partially_refunded'));
          return { code: s.code, school: s.name_en, governorate: govs.find((g) => g.id === s.governorateId)?.name_en ?? '', status: s.status, tier: s.tier, paid_students_in_period: new Set(tx.map((x) => x.studentId)).size, revenue_in_period: tx.reduce((a, x) => a + x.amount, 0), verified_paid_students: s.verifiedPaidStudents, pending_settlement_iqd: s.pendingSettlement };
        });
      case 'learning':
        return activityInRange(from, to).map((d) => ({ date: d.date, dau: d.dau, wau: d.wau, mau: d.mau, watch_minutes: d.watchMinutes, video_completion_pct: d.videoCompletionRate, quiz_attempts: d.quizAttempts, quiz_completion_pct: d.quizCompletionRate, exam_attempts: d.examAttempts }));
      case 'ai':
        return activityInRange(from, to).map((d) => ({ date: d.date, questions: d.aiQuestions, active_users: d.aiActiveUsers, tokens: d.aiTokens, cost_usd: d.aiCostUsd, ...Object.fromEntries(Object.entries(d.aiBySubject).map(([k, v]) => [`q_${k}`, v])) }));
      case 'audit':
        return audit
          .filter((a) => inRange(a.at, from, to))
          .map((a) => ({ at: a.at, actor: a.actor, role: a.actorRole, action: a.action, entity: a.entity, entity_id: a.entityId, summary: a.summary, ip: a.ip, device: a.device }));
    }
  }, [report, range, students, txns, refunds, schools, packages, audit]);

  const rangeLabel = `${fmtDate(range.from)} – ${fmtDate(range.to)}`;
  const reportMeta = REPORTS.find((r) => r.key === report)!;

  const runExport = async () => {
    if (!allowed) {
      toast.error(t('common.noPermission'));
      return;
    }
    if (rows.length === 0) {
      toast.error(t('analytics.exports.emptyRange'));
      return;
    }
    setBusy(true);
    await new Promise((r) => setTimeout(r, 700));
    exportCsv(`eduway-${report}`, rows);
    addExport(
      { id: uid('exp'), report, format, range: rangeLabel, rows: rows.length, by: admin?.name ?? 'System', at: new Date().toISOString() },
      { action: 'export.create', summary: `Exported ${rows.length} ${report} rows (${format.toUpperCase()}, ${rangeLabel})` },
    );
    setBusy(false);
    toast.success(format === 'xlsx' ? t('analytics.exports.xlsxNote') : t('toast.exported'));
  };

  const columns = useMemo<ColumnDef<ExportRecord>[]>(
    () => [
      {
        id: 'report',
        accessorFn: (r) => t(`analytics.exports.reports.${r.report}.name`, { defaultValue: r.report }),
        header: t('analytics.exports.report'),
        cell: ({ row, getValue }) => {
          const Icon = REPORTS.find((r) => r.key === row.original.report)?.icon ?? FileClock;
          return (
            <span className="flex items-center gap-2 font-medium">
              <Icon className="h-4 w-4 text-accent" />
              {getValue<string>()}
            </span>
          );
        },
      },
      { accessorKey: 'format', header: t('analytics.exports.format'), cell: ({ getValue }) => <Badge tone={getValue<string>() === 'xlsx' ? 'success' : 'info'}>{getValue<string>().toUpperCase()}</Badge> },
      { accessorKey: 'range', header: t('dateRange.label'), cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted">{getValue<string>()}</span> },
      { accessorKey: 'rows', header: t('analytics.exports.rows'), meta: { align: 'end' }, cell: ({ getValue }) => fmtNumber(getValue<number>()) },
      {
        accessorKey: 'by',
        header: t('analytics.exports.by'),
        cell: ({ getValue }) => (
          <span className="flex items-center gap-2">
            <Avatar name={getValue<string>()} size="xs" />
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: 'at',
        header: t('analytics.exports.when'),
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-xs" title={fmtDateTime(getValue<string>())}>
            {fmtRelative(getValue<string>())}
          </span>
        ),
        meta: { exportValue: (r) => r.at },
      },
    ],
    [t],
  );

  const historyRows = historyFilter ? history.filter((h) => h.report === historyFilter) : history;

  return (
    <>
      <PageHeader title={t('analytics.exports.title')} subtitle={t('analytics.exports.subtitle')} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t('analytics.exports.chooseReport')} subtitle={t('analytics.exports.chooseReportSub')} />
          <CardBody>
            <div role="radiogroup" aria-label={t('analytics.exports.report')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {REPORTS.map((r) => {
                const active = r.key === report;
                return (
                  <button
                    key={r.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setReport(r.key)}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3.5 text-start transition-all duration-200',
                      active ? 'border-accent bg-accent/[0.06] shadow-glow' : 'border-line bg-surface hover:border-accent/50',
                    )}
                  >
                    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', active ? 'bg-accent/15 text-accent' : 'bg-ink/5 text-muted')}>
                      <r.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                        {t(`analytics.exports.reports.${r.key}.name`)}
                        {r.sensitive && <Lock className="h-3 w-3 text-muted" aria-label={t('analytics.exports.pii')} />}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{t(`analytics.exports.reports.${r.key}.desc`)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title={t('analytics.exports.options')} icon={<Download className="h-4 w-4" />} />
          <CardBody className="flex flex-1 flex-col gap-5">
            <div>
              <span className="label">{t('dateRange.label')}</span>
              <DateRangePicker value={range} onChange={setRange} align="start" />
            </div>
            <div>
              <span className="label">{t('analytics.exports.format')}</span>
              <Segmented
                aria-label={t('analytics.exports.format')}
                value={format}
                onChange={setFormat}
                options={[
                  { value: 'csv', label: 'CSV' },
                  { value: 'xlsx', label: 'XLSX' },
                ]}
              />
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="text-xs text-muted">{t('analytics.exports.preview')}</div>
              <div className="mt-1 text-sm font-semibold text-ink">{t(`analytics.exports.reports.${reportMeta.key}.name`)}</div>
              <div className="mt-0.5 text-xs text-muted num">{rangeLabel}</div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="kpi-num text-2xl text-primary">{loading ? '—' : fmtNumber(rows.length)}</span>
                <span className="text-xs text-muted">{t('analytics.exports.rows')}</span>
              </div>
            </div>
            <div className={cn('flex gap-2.5 rounded-xl border p-3 text-xs', allowed ? 'border-info/25 bg-info/5 text-ink/80' : 'border-danger/25 bg-danger/5 text-danger')}>
              {allowed ? <ShieldCheck className="h-4 w-4 shrink-0 text-info" /> : <Lock className="h-4 w-4 shrink-0" />}
              <span>{allowed ? (reportMeta.sensitive ? t('analytics.exports.noticePii') : t('analytics.exports.notice')) : t('analytics.exports.locked')}</span>
            </div>
            <Button size="lg" className="mt-auto w-full" icon={<Download className="h-4 w-4" />} loading={busy} disabled={!allowed || loading} onClick={runExport}>
              {t('analytics.exports.generate')}
            </Button>
          </CardBody>
        </Card>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <FileClock className="h-4 w-4 text-accent" />
          <h2 className="section-title">{t('analytics.exports.history')}</h2>
          <span className="text-xs text-muted">· {t('analytics.exports.historySub')}</span>
        </div>
        <DataTable
          data={historyRows}
          columns={columns}
          loading={loading}
          initialSort={[{ id: 'at', desc: true }]}
          exportName="export-history"
          searchText={(r) => `${r.report} ${r.by} ${r.range}`}
          toolbar={
            <FilterSelect label={t('analytics.exports.report')} value={historyFilter} onChange={setHistoryFilter} options={REPORTS.map((r) => ({ value: r.key, label: t(`analytics.exports.reports.${r.key}.name`) }))} />
          }
        />
      </section>
    </>
  );
}
