import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Undo2, Wallet } from 'lucide-react';
import { fmtDateTime, fmtMoney, fmtNumber, fmtPercent } from '@/utils/format';
import { useCan } from '@/store/auth';
import { rangeFromPreset, type DateRange } from '@/store/ui';
import { useLocalize } from '@/hooks/useLocale';
import { qk } from '@/api/keys';
import { exportRequest, useExport, usePagedList } from '@/api/hooks';
import { useLookups } from '@/api/lookups';
import { paymentsApi, toTransactionVM, usePaymentsSummary, type TransactionVM } from '@/api/payments';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, DataTable, DateRangePicker, FilterSelect, StatCard, StatusBadge } from '@/components/ui';
import { GATEWAYS, GatewayChip } from './shared';

const STATUSES = ['initiated', 'pending', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded'] as const;

export default function Transactions() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const navigate = useNavigate();
  const lookups = useLookups();
  const packages = lookups.packages;
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset('12m'));
  const [status, setStatus] = useState('');
  const [gateway, setGateway] = useState('');
  const [pkg, setPkg] = useState('');
  const [source, setSource] = useState('');

  const filters = { from: range.from, to: range.to, status, gateway, packageId: pkg, source };
  const list = usePagedList({
    key: qk.payments.list,
    fetcher: (p) => paymentsApi.list(p),
    filters,
    initialSort: '-createdAt',
    pageSize: 25,
  });
  const rows = useMemo(() => list.items.map(toTransactionVM), [list.items]);
  const summary = usePaymentsSummary({ ...filters, q: list.exportFilters.q });
  const exp = useExport('/admin/payments/export', 'transactions');
  const loading = summary.isLoading;
  const kpi = {
    gross: summary.data?.gross ?? 0,
    paid: summary.data?.paidCount ?? 0,
    failedRate: summary.data?.failureRate ?? 0,
    refunded: summary.data?.refunded ?? 0,
  };
  const pendingRefunds = summary.data?.pendingRefunds ?? 0;

  const studentName = (x: TransactionVM) => L(x, 'studentName');
  const packageName = (x: TransactionVM) => L(x, 'packageName');

  const columns = useMemo<ColumnDef<TransactionVM>[]>(
    () => [
      {
        id: 'ref',
        accessorKey: 'ref',
        enableSorting: false,
        header: t('payments.ref'),
        meta: { label: t('payments.ref') },
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-primary" dir="ltr">
            {row.original.ref}
          </span>
        ),
      },
      {
        id: 'student',
        accessorFn: (x) => studentName(x),
        enableSorting: false,
        header: t('common.student'),
        meta: { label: t('common.student') },
        cell: ({ row }) => <span className="whitespace-nowrap font-medium text-ink">{studentName(row.original)}</span>,
      },
      {
        id: 'package',
        accessorFn: (x) => packageName(x),
        enableSorting: false,
        header: t('common.package'),
        meta: { label: t('common.package') },
        cell: ({ getValue }) => <span className="whitespace-nowrap text-ink/80">{getValue<string>()}</span>,
      },
      {
        id: 'amount',
        accessorKey: 'amount',
        header: t('common.amount'),
        meta: { align: 'end', label: t('common.amount') },
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <div className="font-semibold">{fmtMoney(row.original.amount, row.original.currency)}</div>
            {row.original.refundedAmount > 0 && <div className="text-[11px] text-danger">−{fmtMoney(row.original.refundedAmount, row.original.currency)}</div>}
          </div>
        ),
      },
      { id: 'currency', accessorKey: 'currency', enableSorting: false, header: t('common.currency'), meta: { label: t('common.currency') } },
      {
        id: 'gateway',
        accessorKey: 'gateway',
        header: t('payments.gateway'),
        meta: { label: t('payments.gateway') },
        cell: ({ row }) => <GatewayChip gateway={row.original.gateway} />,
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t('common.status'),
        meta: { label: t('common.status') },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'source',
        accessorFn: (x) => (x.schoolId ? x.schoolCode : x.promoCode) ?? t('payments.sources.direct'),
        enableSorting: false,
        header: t('payments.source'),
        meta: { label: t('payments.source') },
        cell: ({ row }) => {
          const x = row.original;
          const src = x.source;
          if (src === 'direct') return <span className="text-xs text-muted">{t('payments.sources.direct')}</span>;
          return (
            <div className="min-w-[8rem]">
              <Badge tone={src === 'school' ? 'info' : 'accent'}>{src === 'school' ? x.schoolCode : x.promoCode}</Badge>
              {x.schoolId && <div className="mt-0.5 max-w-[12rem] truncate text-[11px] text-muted">{L(x, 'schoolName')}</div>}
            </div>
          );
        },
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: t('common.date'),
        meta: { label: t('common.date') },
        cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted num">{fmtDateTime(row.original.createdAt)}</span>,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L],
  );

  return (
    <div>
      <PageHeader title={t('payments.transactions')} subtitle={t('payments.transactionsSub')} actions={<DateRangePicker value={range} onChange={setRange} />} />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('payments.kpi.gross')} value={fmtMoney(kpi.gross, 'IQD', true)} icon={<Wallet />} color="#C9A24A" hint={t(`dateRange.${range.preset}`)} />
        <StatCard loading={loading} label={t('payments.kpi.paid')} value={fmtNumber(kpi.paid)} icon={<CheckCircle2 />} color="#16A34A" hint={t('common.results', { count: summary.data?.total ?? list.meta.total })} />
        <StatCard loading={loading} label={t('payments.kpi.failedRate')} value={fmtPercent(kpi.failedRate, 1)} icon={<AlertTriangle />} color="#DC2626" hint={t(`dateRange.${range.preset}`)} />
        <StatCard
          loading={loading}
          label={t('payments.kpi.refunded')}
          value={fmtMoney(kpi.refunded, 'IQD', true)}
          icon={<Undo2 />}
          color="#7C3AED"
          hint={`${fmtNumber(pendingRefunds)} ${t('payments.kpi.pendingRefunds').toLowerCase()}`}
          onClick={() => navigate('/payments/refunds')}
        />
      </div>

      <DataTable
        data={rows}
        columns={columns}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        server={list.server}
        pageSize={25}
        initialHidden={['currency']}
        onRowClick={(x) => navigate(`/payments/transactions/${x.id}`)}
        onExport={can('payments', 'export') ? () => exp.mutate(exportRequest('csv', list.exportFilters)) : undefined}
        exporting={exp.isPending}
        toolbar={
          <>
            <FilterSelect label={t('payments.filters.status')} value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} />
            <FilterSelect label={t('payments.filters.gateway')} value={gateway} onChange={setGateway} options={GATEWAYS.map((g) => ({ value: g, label: t(`payments.gateways.${g}`) }))} />
            <FilterSelect label={t('payments.filters.package')} value={pkg} onChange={setPkg} options={packages.map((p) => ({ value: p.id, label: L(p, 'name') }))} />
            <FilterSelect
              label={t('payments.filters.source')}
              value={source}
              onChange={setSource}
              options={(['school', 'promo', 'direct'] as const).map((s) => ({ value: s, label: t(`payments.sources.${s}`) }))}
            />
          </>
        }
      />
    </div>
  );
}
