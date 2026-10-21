import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Undo2, Wallet } from 'lucide-react';
import type { Transaction } from '@/types';
import { fmtDateTime, fmtMoney, fmtNumber, fmtPercent } from '@/utils/format';
import { usePackages, useRefunds, useSchools, useStudents, useTransactions } from '@/store/core';
import { useCan } from '@/store/auth';
import { rangeFromPreset, type DateRange } from '@/store/ui';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, DataTable, DateRangePicker, FilterSelect, StatCard, StatusBadge } from '@/components/ui';
import { CAPTURED, GATEWAYS, GatewayChip } from './shared';

const STATUSES = ['initiated', 'pending', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded'] as const;

type Source = 'school' | 'promo' | 'direct';
const sourceOf = (t: Transaction): Source => (t.schoolId ? 'school' : t.promoCode ? 'promo' : 'direct');

export default function Transactions() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const navigate = useNavigate();
  const txns = useTransactions((s) => s.items);
  const students = useStudents((s) => s.items);
  const packages = usePackages((s) => s.items);
  const schools = useSchools((s) => s.items);
  const pendingRefunds = useRefunds((s) => s.items.filter((r) => r.status === 'pending').length);
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset('12m'));
  const loading = useMockLoading(450, [range]);
  const [status, setStatus] = useState('');
  const [gateway, setGateway] = useState('');
  const [pkg, setPkg] = useState('');
  const [source, setSource] = useState('');

  const studentName = (id: string) => L(students.find((s) => s.id === id), 'name');
  const packageName = (id: string) => L(packages.find((p) => p.id === id), 'name');

  const rows = useMemo(
    () =>
      txns.filter(
        (x) =>
          x.createdAt >= range.from &&
          x.createdAt <= range.to &&
          (!status || x.status === status) &&
          (!gateway || x.gateway === gateway) &&
          (!pkg || x.packageId === pkg) &&
          (!source || sourceOf(x) === source),
      ),
    [txns, range, status, gateway, pkg, source],
  );

  const kpi = useMemo(() => {
    const captured = rows.filter((r) => CAPTURED.includes(r.status));
    const gross = captured.reduce((s, r) => s + r.amount, 0);
    const refunded = rows.reduce((s, r) => s + r.refundedAmount, 0);
    const settledAttempts = rows.filter((r) => r.status !== 'initiated' && r.status !== 'pending');
    const failed = rows.filter((r) => r.status === 'failed').length;
    return {
      gross,
      paid: captured.length,
      failedRate: settledAttempts.length ? (failed / settledAttempts.length) * 100 : 0,
      refunded,
    };
  }, [rows]);

  const columns = useMemo<ColumnDef<Transaction>[]>(
    () => [
      {
        id: 'ref',
        accessorKey: 'ref',
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
        accessorFn: (x) => studentName(x.studentId),
        header: t('common.student'),
        meta: { label: t('common.student') },
        cell: ({ row }) => <span className="whitespace-nowrap font-medium text-ink">{studentName(row.original.studentId)}</span>,
      },
      {
        id: 'package',
        accessorFn: (x) => packageName(x.packageId),
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
      { id: 'currency', accessorKey: 'currency', header: t('common.currency'), meta: { label: t('common.currency') } },
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
        accessorFn: (x) => (x.schoolId ? schools.find((s) => s.id === x.schoolId)?.code : x.promoCode) ?? t('payments.sources.direct'),
        header: t('payments.source'),
        meta: { label: t('payments.source') },
        cell: ({ row }) => {
          const x = row.original;
          const src = sourceOf(x);
          if (src === 'direct') return <span className="text-xs text-muted">{t('payments.sources.direct')}</span>;
          const school = schools.find((s) => s.id === x.schoolId);
          return (
            <div className="min-w-[8rem]">
              <Badge tone={src === 'school' ? 'info' : 'accent'}>{src === 'school' ? school?.code : x.promoCode}</Badge>
              {school && <div className="mt-0.5 max-w-[12rem] truncate text-[11px] text-muted">{L(school, 'name')}</div>}
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
    [t, L, students, packages, schools],
  );

  return (
    <div>
      <PageHeader title={t('payments.transactions')} subtitle={t('payments.transactionsSub')} actions={<DateRangePicker value={range} onChange={setRange} />} />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('payments.kpi.gross')} value={fmtMoney(kpi.gross, 'IQD', true)} icon={<Wallet />} color="#C9A24A" hint={t(`dateRange.${range.preset}`)} />
        <StatCard loading={loading} label={t('payments.kpi.paid')} value={fmtNumber(kpi.paid)} icon={<CheckCircle2 />} color="#16A34A" hint={t('common.results', { count: rows.length })} />
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
        loading={loading}
        pageSize={25}
        initialSort={[{ id: 'createdAt', desc: true }]}
        initialHidden={['currency']}
        onRowClick={(x) => navigate(`/payments/transactions/${x.id}`)}
        exportName={can('payments', 'export') ? 'transactions' : undefined}
        searchText={(x) => `${x.ref} ${studentName(x.studentId)} ${students.find((s) => s.id === x.studentId)?.mobile ?? ''} ${x.promoCode ?? ''}`}
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
