import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AlertTriangle, BadgeCheck, CheckCheck, FileUp, Landmark, Percent, Undo2, Wallet } from 'lucide-react';
import { cn } from '@/utils/cn';
import { fmtDate, fmtMoney, fmtNumber } from '@/utils/format';
import { useCan } from '@/store/auth';
import { rangeFromPreset, type DateRange } from '@/store/ui';
import { useLocalize } from '@/hooks/useLocale';
import { qk } from '@/api/keys';
import { exportRequest, useApiMutation, useApiQuery, useExport, usePagedList } from '@/api/hooks';
import { flatRef } from '@/api/adapters';
import { useUpload } from '@/api/storage';
import type { ExportRequest } from '@/api/types';
import { RECON_INVALIDATE, reconciliationApi, type GatewayId, type ReconciliationDayRow, type ReconciliationRow } from '@/api/payments';
import { PageHeader } from '@/components/layout/PageHeader';
import { AreaChart } from '@/components/charts';
import { QueryError } from '@/components/ui/QueryError';
import { Badge, Button, Card, CardBody, CardHeader, DataTable, DateRangePicker, Field, FileUpload, FilterSelect, Modal, Select, StatCard, Switch, useConfirm } from '@/components/ui';
import { GATEWAYS, GatewayChip } from './shared';

type DayRow = ReconciliationDayRow & { id: string };

export default function Reconciliation() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset('90d'));
  const [gateway, setGateway] = useState('');
  const [onlyMismatch, setOnlyMismatch] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const params = { from: range.from, to: range.to, gateway };
  const overview = useApiQuery(qk.reconciliation.sub('overview', params), () => reconciliationApi.get(params));
  const loading = overview.isLoading;
  const list = usePagedList({
    key: qk.reconciliation.list,
    fetcher: (p) => reconciliationApi.comparison(p),
    filters: { ...params, onlyMismatches: onlyMismatch || undefined },
    initialSort: '-day',
    pageSize: 10,
  });

  const days = useMemo<DayRow[]>(() => (overview.data?.daily ?? []).map((d) => ({ ...d, id: d.day })), [overview.data]);
  const chart = useMemo(() => (overview.data?.chart ?? []).map((c) => ({ day: c.date, gross: c.gross, refunds: c.refunds })), [overview.data]);
  const totals = overview.data?.summary ?? { gross: 0, refunds: 0, fees: 0, net: 0, txnCount: 0, mismatches: 0 };

  const resolve = useApiMutation((v: { day: string; gateway: GatewayId; reason: string }) => reconciliationApi.resolve(v), {
    invalidate: RECON_INVALIDATE,
    success: 'payments.recon.marked',
  });
  const exp = useExport('/admin/reconciliation/export', 'reconciliation');
  const runExport = (table: 'daily' | 'comparison', filters: Record<string, unknown>) =>
    exp.mutate({ ...exportRequest('csv', filters), table } as ExportRequest);

  const markReconciled = async (r: ReconciliationRow) => {
    const gw = t(`payments.gateways.${r.gateway}`, { defaultValue: r.gateway });
    const ok = await confirm({
      title: t('payments.recon.markTitle', { gateway: gw, day: fmtDate(r.day) }),
      body: t('payments.recon.markBody', { diff: fmtMoney(r.difference, 'IQD') }),
      tone: 'primary',
      reason: true,
      confirmText: t('payments.recon.markReconciled'),
    });
    if (!ok) return;
    resolve.mutate({ day: r.day, gateway: r.gateway, reason: ok.reason });
  };

  const dayColumns = useMemo<ColumnDef<DayRow>[]>(
    () => [
      { id: 'day', accessorKey: 'day', header: t('payments.recon.day'), meta: { label: t('payments.recon.day') }, cell: ({ row }) => <span className="whitespace-nowrap num">{fmtDate(row.original.day)}</span> },
      { id: 'count', accessorKey: 'count', header: t('payments.recon.txnCount'), meta: { label: t('payments.recon.txnCount'), align: 'end' } },
      { id: 'gross', accessorKey: 'gross', header: t('payments.recon.gross'), meta: { label: t('payments.recon.gross'), align: 'end' }, cell: ({ row }) => fmtMoney(row.original.gross) },
      {
        id: 'refunds',
        accessorKey: 'refunds',
        header: t('payments.recon.refunds'),
        meta: { label: t('payments.recon.refunds'), align: 'end' },
        cell: ({ row }) => <span className={row.original.refunds ? 'text-danger' : 'text-muted'}>{row.original.refunds ? `−${fmtMoney(row.original.refunds)}` : '—'}</span>,
      },
      { id: 'fees', accessorKey: 'fees', header: t('payments.recon.fees'), meta: { label: t('payments.recon.fees'), align: 'end' }, cell: ({ row }) => <span className="text-muted">−{fmtMoney(row.original.fees)}</span> },
      { id: 'net', accessorKey: 'net', header: t('payments.recon.net'), meta: { label: t('payments.recon.net'), align: 'end' }, cell: ({ row }) => <span className="font-semibold">{fmtMoney(row.original.net)}</span> },
    ],
    [t],
  );

  const compareColumns = useMemo<ColumnDef<ReconciliationRow>[]>(
    () => [
      { id: 'day', accessorKey: 'day', header: t('payments.recon.day'), meta: { label: t('payments.recon.day') }, cell: ({ row }) => <span className="whitespace-nowrap num">{fmtDate(row.original.day)}</span> },
      {
        id: 'gateway',
        accessorKey: 'gateway',
        header: t('payments.gateway'),
        meta: { label: t('payments.gateway') },
        cell: ({ row }) => <GatewayChip gateway={row.original.gateway} />,
      },
      { id: 'count', accessorKey: 'count', enableSorting: false, header: t('payments.recon.txnCount'), meta: { label: t('payments.recon.txnCount'), align: 'end' } },
      {
        id: 'systemAmount',
        accessorKey: 'systemAmount',
        header: t('payments.recon.system'),
        meta: { label: t('payments.recon.system'), align: 'end' },
        cell: ({ row }) => fmtMoney(row.original.systemAmount),
      },
      {
        id: 'reportedAmount',
        accessorKey: 'reportedAmount',
        enableSorting: false,
        header: t('payments.recon.gatewayReported'),
        meta: { label: t('payments.recon.gatewayReported'), align: 'end' },
        cell: ({ row }) =>
          row.original.reportedAmount == null ? <span className="text-xs text-muted">{t('payments.recon.notReported')}</span> : fmtMoney(row.original.reportedAmount),
      },
      {
        id: 'difference',
        accessorKey: 'difference',
        header: t('payments.recon.difference'),
        meta: { label: t('payments.recon.difference'), align: 'end' },
        cell: ({ row }) => {
          const d = row.original.difference;
          if (row.original.reportedAmount == null) return <span className="text-muted">—</span>;
          return <span className={cn('font-semibold', d === 0 ? 'text-muted' : d < 0 ? 'text-danger' : 'text-warning')}>{d === 0 ? '—' : `${d > 0 ? '+' : '−'}${fmtMoney(Math.abs(d))}`}</span>;
        },
      },
      {
        id: 'state',
        accessorKey: 'state',
        enableSorting: false,
        header: t('common.status'),
        meta: { label: t('common.status') },
        cell: ({ row }) => {
          const r = row.original;
          const s = r.state;
          return (
            <div>
              <Badge tone={s === 'matched' ? 'success' : s === 'reconciled' ? 'info' : s === 'unreported' ? 'neutral' : 'danger'} dot>
                {t(`payments.recon.${s}`)}
              </Badge>
              {s === 'reconciled' && r.resolvedBy && (
                <div className="mt-0.5 max-w-[12rem] truncate text-[11px] text-muted" title={r.note ?? undefined}>
                  {L(flatRef(r.resolvedBy), 'name')} · {fmtDate(r.resolvedAt)}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row }) =>
          row.original.state === 'mismatch' && can('payments', 'approve') ? (
            <Button size="xs" variant="secondary" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => markReconciled(row.original)}>
              {t('payments.recon.markReconciled')}
            </Button>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, can],
  );

  return (
    <div>
      <PageHeader
        title={t('payments.recon.title')}
        subtitle={t('payments.recon.subtitle')}
        actions={
          <>
            <FilterSelect label={t('payments.gateway')} value={gateway} onChange={setGateway} options={GATEWAYS.map((g) => ({ value: g, label: t(`payments.gateways.${g}`) }))} />
            <DateRangePicker value={range} onChange={setRange} />
            {can('payments', 'approve') && (
              <Button variant="secondary" icon={<FileUp className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
                {t('payments.recon.import')}
              </Button>
            )}
          </>
        }
      />

      {overview.error && !overview.data ? (
        <QueryError error={overview.error} onRetry={() => overview.refetch()} className="mb-5" />
      ) : (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard loading={loading} label={t('payments.recon.gross')} value={fmtMoney(totals.gross, 'IQD', true)} icon={<Wallet />} color="#C9A24A" hint={t('common.results', { count: totals.txnCount })} />
            <StatCard loading={loading} label={t('payments.recon.refunds')} value={fmtMoney(totals.refunds, 'IQD', true)} icon={<Undo2 />} color="#7C3AED" hint={' '} />
            <StatCard loading={loading} label={t('payments.kpi.fees')} value={fmtMoney(totals.fees, 'IQD', true)} icon={<Percent />} color="#64748B" hint={' '} />
            <StatCard loading={loading} label={t('payments.kpi.net')} value={fmtMoney(totals.net, 'IQD', true)} icon={<Landmark />} color="#16A34A" hint={' '} />
            <StatCard
              loading={loading}
              label={t('payments.kpi.mismatches')}
              value={fmtNumber(totals.mismatches)}
              icon={totals.mismatches ? <AlertTriangle /> : <BadgeCheck />}
              color={totals.mismatches ? '#DC2626' : '#16A34A'}
              hint={' '}
              onClick={() => setOnlyMismatch(true)}
            />
          </div>

          <div className="mb-5 grid gap-5 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader title={t('payments.recon.daily')} subtitle={t('payments.recon.dailySub')} />
              <CardBody>
                <AreaChart
                  data={chart}
                  xKey="day"
                  loading={loading}
                  height={300}
                  valueFormat={(v) => fmtMoney(v, 'IQD', true)}
                  xFormat={(v) => fmtDate(v, 'd MMM')}
                  series={[
                    { key: 'gross', label: t('payments.recon.gross'), color: '#C9A24A' },
                    { key: 'refunds', label: t('payments.recon.refunds'), color: '#DC2626' },
                  ]}
                />
              </CardBody>
            </Card>
            <Card className="overflow-hidden xl:col-span-2">
              <CardHeader title={t('payments.recon.daily')} subtitle={t(`dateRange.${range.preset}`)} />
              <DataTable
                bare
                hideSearch
                data={days}
                columns={dayColumns}
                loading={loading}
                pageSize={10}
                maxHeight="340px"
                initialHidden={['fees']}
                initialSort={[{ id: 'day', desc: true }]}
                onExport={can('payments', 'export') ? () => runExport('daily', params) : undefined}
                exporting={exp.isPending}
                emptyTitle={t('payments.recon.noActivity')}
                emptyHint={t('payments.recon.noActivityHint')}
              />
            </Card>
          </div>
        </>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          title={t('payments.recon.comparison')}
          subtitle={t('payments.recon.comparisonSub')}
          action={<Switch size="sm" checked={onlyMismatch} onChange={setOnlyMismatch} label={t('payments.recon.onlyMismatches')} />}
        />
        <DataTable
          bare
          data={list.items}
          columns={compareColumns}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          server={list.server}
          pageSize={10}
          rowClassName={(r) => (r.state === 'mismatch' ? 'bg-danger/[0.03]' : undefined)}
          onExport={can('payments', 'export') ? () => runExport('comparison', list.exportFilters) : undefined}
          exporting={exp.isPending}
          emptyTitle={t('payments.recon.noActivity')}
          emptyHint={t('payments.recon.noActivityHint')}
        />
      </Card>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}

/* ─── Gateway settlement import (ADM-REC-04) ─────────────────────────────── */

function ImportModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [gateway, setGateway] = useState<GatewayId>('zaincash');
  const [file, setFile] = useState<File | null>(null);
  const up = useUpload('reconciliation_import');
  const imp = useApiMutation((v: { gateway: GatewayId; fileKey: string }) => reconciliationApi.import(v), {
    invalidate: RECON_INVALIDATE,
    success: false,
  });

  const submit = async () => {
    if (!file) return;
    const r = await up.start(file);
    if (!r) return;
    imp.mutate(
      { gateway, fileKey: r.fileKey },
      {
        onSuccess: (res) => {
          toast.success(t('payments.recon.imported', { days: res.days, matched: res.matched, mismatches: res.mismatches }));
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('payments.recon.importTitle')}
      description={t('payments.recon.importSub')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button icon={<FileUp className="h-4 w-4" />} disabled={!file} loading={up.uploading || imp.isPending} onClick={submit}>
            {t('payments.recon.importSubmit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('payments.gateway')} htmlFor="rec-gw">
          <Select id="rec-gw" value={gateway} onChange={(e) => setGateway(e.target.value as GatewayId)} options={GATEWAYS.map((g) => ({ value: g, label: t(`payments.gateways.${g}`) }))} />
        </Field>
        <Field label={t('payments.recon.importFile')} hint={t('payments.recon.importHint')}>
          <FileUpload accept=".csv,.xlsx" maxSizeMb={20} progress={up.progress} onFile={(f) => setFile(f)} />
        </Field>
      </div>
    </Modal>
  );
}
