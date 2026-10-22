import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Bot,
  Download,
  FileClock,
  FileSpreadsheet,
  GraduationCap,
  Lock,
  Receipt,
  School,
  ScrollText,
  ShieldCheck,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { rangeFromPreset, useUi, type DateRange } from '@/store/ui';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { flatRef } from '@/api/adapters';
import {
  useCreateExport,
  useDownloadExport,
  useExportHistory,
  useExportPreview,
  type ExportRecordDto,
  type ReportKey,
} from '@/api/analytics';
import { cn } from '@/utils/cn';
import { fmtDate, fmtDateTime, fmtNumber, fmtRelative } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  DateRangePicker,
  FilterSelect,
  Segmented,
  StatusBadge,
} from '@/components/ui';

const REPORTS: { key: ReportKey; icon: LucideIcon; sensitive?: boolean }[] = [
  { key: 'students', icon: GraduationCap, sensitive: true },
  { key: 'transactions', icon: Receipt, sensitive: true },
  { key: 'refunds', icon: Undo2, sensitive: true },
  { key: 'schools', icon: School },
  { key: 'learning', icon: FileSpreadsheet },
  { key: 'ai', icon: Bot },
  { key: 'audit', icon: ScrollText, sensitive: true },
];

export default function Exports() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const globalRange = useUi((s) => s.range);
  const allowed = can('analytics', 'export');

  const [report, setReport] = useState<ReportKey>('transactions');
  const [range, setRange] = useState<DateRange>(
    globalRange.preset === 'today' ? rangeFromPreset('30d') : globalRange,
  );
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const [historyFilter, setHistoryFilter] = useState('');
  const [awaiting, setAwaiting] = useState<string | null>(null);

  const preview = useExportPreview({ report, from: range.from, to: range.to });
  const history = useExportHistory({ report: historyFilter }, !!awaiting);
  const create = useCreateExport();
  const dl = useDownloadExport();
  const loading = history.isLoading;
  const rowsCount = preview.data?.rows ?? 0;

  // A job-based export (> 50k rows) finishes asynchronously: poll the history until it is ready, then download.
  useEffect(() => {
    if (!awaiting) return;
    const rec = history.items.find((h) => h.id === awaiting);
    if (!rec || rec.status === 'processing') return;
    setAwaiting(null);
    if (rec.status === 'ready')
      dl.mutate(rec, { onSuccess: () => toast.success(t('toast.exported')) });
    else toast.error(t('analytics.exports.failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaiting, history.items]);

  const rangeLabel = `${fmtDate(range.from)} – ${fmtDate(range.to)}`;
  const reportMeta = REPORTS.find((r) => r.key === report)!;

  const runExport = () => {
    if (!allowed) {
      toast.error(t('common.noPermission'));
      return;
    }
    if (preview.data && rowsCount === 0) {
      toast.error(t('analytics.exports.emptyRange'));
      return;
    }
    create.mutate(
      { report, from: range.from, to: range.to, format },
      {
        onSuccess: (rec) => {
          if (rec.status === 'ready')
            dl.mutate(rec, { onSuccess: () => toast.success(t('toast.exported')) });
          else if (rec.status === 'processing') {
            setAwaiting(rec.id);
            toast(t('analytics.exports.processing'));
          } else toast.error(t('analytics.exports.failed'));
        },
      },
    );
  };

  const columns = useMemo<ColumnDef<ExportRecordDto>[]>(
    () => [
      {
        id: 'report',
        accessorFn: (r) =>
          t(`analytics.exports.reports.${r.report}.name`, { defaultValue: r.report }),
        header: t('analytics.exports.report'),
        cell: ({ row, getValue }) => {
          const Icon = REPORTS.find((r) => r.key === row.original.report)?.icon ?? FileClock;
          return (
            <span className="flex items-center gap-2 font-medium">
              <Icon className="h-4 w-4 text-accent" />
              {getValue<string>()}
              {row.original.source === 'table' && (
                <Badge tone="slate">{t('analytics.exports.fromTable')}</Badge>
              )}
            </span>
          );
        },
      },
      {
        id: 'format',
        accessorKey: 'format',
        header: t('analytics.exports.format'),
        cell: ({ getValue }) => (
          <Badge tone={getValue<string>() === 'xlsx' ? 'success' : 'info'}>
            {getValue<string>().toUpperCase()}
          </Badge>
        ),
      },
      {
        id: 'range',
        accessorKey: 'range',
        header: t('dateRange.label'),
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-xs text-muted">{getValue<string>()}</span>
        ),
      },
      {
        id: 'rows',
        accessorKey: 'rows',
        header: t('analytics.exports.rows'),
        meta: { align: 'end' },
        cell: ({ getValue }) => fmtNumber(getValue<number>()),
      },
      {
        id: 'by',
        accessorFn: (r) => L(flatRef(r.by), 'name'),
        header: t('analytics.exports.by'),
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className="flex items-center gap-2">
            <Avatar name={getValue<string>()} size="xs" />
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: 'at',
        accessorKey: 'at',
        header: t('analytics.exports.when'),
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-xs" title={fmtDateTime(getValue<string>())}>
            {fmtRelative(getValue<string>())}
          </span>
        ),
        meta: { exportValue: (r) => r.at },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t('common.status'),
        enableSorting: false,
        cell: ({ getValue }) => (
          <StatusBadge
            status={getValue<string>()}
            label={t(`analytics.exports.statuses.${getValue<string>()}`)}
          />
        ),
      },
      {
        id: 'download',
        header: '',
        enableSorting: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row }) =>
          row.original.status === 'ready' && allowed ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('analytics.exports.download')}
              title={t('analytics.exports.download')}
              disabled={dl.isPending}
              onClick={(e) => {
                e.stopPropagation();
                dl.mutate(row.original);
              }}
            >
              <Download className="h-4 w-4" />
            </Button>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, allowed, dl.isPending],
  );

  return (
    <>
      <PageHeader title={t('analytics.exports.title')} subtitle={t('analytics.exports.subtitle')} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={t('analytics.exports.chooseReport')}
            subtitle={t('analytics.exports.chooseReportSub')}
          />
          <CardBody>
            <div
              role="radiogroup"
              aria-label={t('analytics.exports.report')}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
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
                      active
                        ? 'border-accent bg-accent/[0.06] shadow-glow'
                        : 'border-line bg-surface hover:border-accent/50',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                        active ? 'bg-accent/15 text-accent' : 'bg-ink/5 text-muted',
                      )}
                    >
                      <r.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                        {t(`analytics.exports.reports.${r.key}.name`)}
                        {r.sensitive && (
                          <Lock
                            className="h-3 w-3 text-muted"
                            aria-label={t('analytics.exports.pii')}
                          />
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {t(`analytics.exports.reports.${r.key}.desc`)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title={t('analytics.exports.options')}
            icon={<Download className="h-4 w-4" />}
          />
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
              <div className="mt-1 text-sm font-semibold text-ink">
                {t(`analytics.exports.reports.${reportMeta.key}.name`)}
              </div>
              <div className="num mt-0.5 text-xs text-muted">{rangeLabel}</div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="kpi-num text-2xl text-primary">
                  {preview.isLoading ? '—' : preview.error ? '—' : fmtNumber(rowsCount)}
                </span>
                <span className="text-xs text-muted">{t('analytics.exports.rows')}</span>
              </div>
            </div>
            <div
              className={cn(
                'flex gap-2.5 rounded-xl border p-3 text-xs',
                allowed
                  ? 'border-info/25 bg-info/5 text-ink/80'
                  : 'border-danger/25 bg-danger/5 text-danger',
              )}
            >
              {allowed ? (
                <ShieldCheck className="h-4 w-4 shrink-0 text-info" />
              ) : (
                <Lock className="h-4 w-4 shrink-0" />
              )}
              <span>
                {allowed
                  ? reportMeta.sensitive
                    ? t('analytics.exports.noticePii')
                    : t('analytics.exports.notice')
                  : t('analytics.exports.locked')}
              </span>
            </div>
            <Button
              size="lg"
              className="mt-auto w-full"
              icon={<Download className="h-4 w-4" />}
              loading={create.isPending || dl.isPending || !!awaiting}
              disabled={!allowed || preview.isLoading}
              onClick={runExport}
            >
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
          data={history.items}
          columns={columns}
          loading={loading}
          error={history.error}
          onRetry={() => history.refetch()}
          server={history.server}
          pageSize={10}
          exportName={allowed ? 'export-history' : undefined}
          toolbar={
            <FilterSelect
              label={t('analytics.exports.report')}
              value={historyFilter}
              onChange={setHistoryFilter}
              options={REPORTS.map((r) => ({
                value: r.key,
                label: t(`analytics.exports.reports.${r.key}.name`),
              }))}
            />
          }
        />
      </section>
    </>
  );
}
