import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Check, Clock, Undo2, X, XCircle } from 'lucide-react';
import { fmtDateTime, fmtMoney, fmtNumber, fmtRelative } from '@/utils/format';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { uuid } from '@/api/client';
import { qk } from '@/api/keys';
import { exportRequest, useExport, usePagedList } from '@/api/hooks';
import { refundsApi, toRefundVM, useRefundMutations, useRefundsSummary, type RefundVM } from '@/api/payments';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, DataTable, StatCard, StatusBadge, Tabs, useConfirm } from '@/components/ui';

type TabKey = 'pending' | 'approved' | 'rejected';

export default function Refunds() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const [tab, setTab] = useState<TabKey>('pending');
  const canApprove = can('payments', 'approve');
  const list = usePagedList({
    key: qk.refunds.list,
    fetcher: (p) => refundsApi.list(p),
    filters: { status: tab },
    initialSort: '-requestedAt',
  });
  const rows = useMemo(() => list.items.map(toRefundVM), [list.items]);
  const summary = useRefundsSummary();
  const loading = summary.isLoading;
  const metaCounts = (list.meta.counts as Partial<Record<TabKey, number>> | undefined) ?? {};
  const counts = {
    pending: metaCounts.pending ?? summary.data?.pending.count ?? 0,
    approved: metaCounts.approved ?? summary.data?.approved.count ?? 0,
    rejected: metaCounts.rejected ?? summary.data?.rejected.count ?? 0,
  };
  const m = useRefundMutations();
  const exp = useExport('/admin/refunds/export', 'refunds');

  const studentName = (r: RefundVM) => L(r, 'studentName');

  const approve = async (r: RefundVM) => {
    const ok = await confirm({
      title: t('payments.refunds.approveTitle', { amount: fmtMoney(r.amount, r.currency) }),
      body: t('payments.refunds.approveBody', { name: studentName(r), ref: r.ref }),
      tone: 'primary',
      confirmText: t('actions.approve'),
    });
    if (!ok) return;
    m.approve.mutate({ id: r.id, key: uuid() });
  };

  const reject = async (r: RefundVM) => {
    const res = await confirm({
      title: t('payments.refunds.rejectTitle'),
      body: t('payments.refunds.rejectBody'),
      reason: { label: t('payments.refunds.rejectReason') },
      confirmText: t('actions.reject'),
    });
    if (!res) return;
    m.reject.mutate({ id: r.id, reason: res.reason });
  };

  const bulkApprove = async (selected: RefundVM[], clear: () => void) => {
    const total = selected.reduce((s, r) => s + r.amount, 0);
    const ok = await confirm({
      title: t('payments.refunds.approveTitle', { amount: fmtMoney(total, 'IQD') }),
      body: t('toast.bulkDone', { count: selected.length }),
      tone: 'primary',
      confirmText: t('payments.refunds.bulkApprove'),
    });
    if (!ok) return;
    m.bulkApprove.mutate(
      { ids: selected.map((r) => r.id), key: uuid() },
      {
        onSuccess: (res) => {
          clear();
          if (res.failed.length) toast.error(t('payments.refunds.bulkPartial', { ok: res.succeeded.length, failed: res.failed.length }));
          else toast.success(t('toast.bulkDone', { count: res.succeeded.length }));
        },
      },
    );
  };

  const columns = useMemo<ColumnDef<RefundVM>[]>(
    () => [
      {
        id: 'ref',
        accessorFn: (r) => r.ref,
        enableSorting: false,
        header: t('payments.ref'),
        meta: { label: t('payments.ref') },
        cell: ({ row }) => (
          <Link to={`/payments/transactions/${row.original.transactionId}`} className="font-mono text-xs font-semibold text-primary hover:text-accent hover:underline" dir="ltr">
            {row.original.ref}
          </Link>
        ),
      },
      {
        id: 'student',
        accessorFn: (r) => studentName(r),
        enableSorting: false,
        header: t('common.student'),
        meta: { label: t('common.student') },
        cell: ({ getValue }) => <span className="whitespace-nowrap font-medium">{getValue<string>()}</span>,
      },
      {
        id: 'amount',
        accessorKey: 'amount',
        header: t('common.amount'),
        meta: { label: t('common.amount'), align: 'end' },
        cell: ({ row }) => <span className="font-semibold">{fmtMoney(row.original.amount, row.original.currency)}</span>,
      },
      {
        id: 'kind',
        accessorKey: 'kind',
        enableSorting: false,
        header: t('payments.refunds.kind'),
        meta: { label: t('payments.refunds.kind') },
        cell: ({ row }) => <Badge tone={row.original.kind === 'full' ? 'purple' : 'accent'}>{t(`payments.refunds.${row.original.kind}`)}</Badge>,
      },
      {
        id: 'reason',
        accessorKey: 'reason',
        enableSorting: false,
        header: t('common.reason'),
        meta: { label: t('common.reason') },
        cell: ({ getValue }) => <span className="line-clamp-2 min-w-[12rem] max-w-xs text-ink/80">{getValue<string>()}</span>,
      },
      {
        id: 'requestedAt',
        accessorKey: 'requestedAt',
        header: t('payments.refunds.requestedBy'),
        meta: { label: t('payments.refunds.requestedBy') },
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <div className="text-ink/80">{row.original.requestedBy}</div>
            <div className="text-[11px] text-muted" title={fmtDateTime(row.original.requestedAt)}>
              {fmtRelative(row.original.requestedAt)}
            </div>
          </div>
        ),
      },
      {
        id: 'decidedBy',
        accessorFn: (r) => r.decidedBy ?? '',
        enableSorting: false,
        header: t('payments.refunds.decidedBy'),
        meta: { label: t('payments.refunds.decidedBy') },
        cell: ({ row }) =>
          row.original.decidedBy ? (
            <div className="whitespace-nowrap">
              <div className="text-ink/80">{row.original.decidedBy}</div>
              <div className="text-[11px] text-muted num">{fmtDateTime(row.original.decidedAt)}</div>
              {row.original.decisionNote && (
                <div className="max-w-[14rem] truncate text-[11px] text-muted" title={row.original.decisionNote}>
                  {row.original.decisionNote}
                </div>
              )}
            </div>
          ) : (
            <span className="text-muted">—</span>
          ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        enableSorting: false,
        header: t('common.status'),
        meta: { label: t('common.status') },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row }) =>
          row.original.status === 'pending' && canApprove ? (
            <div className="flex justify-end gap-1.5">
              <Button size="xs" variant="success" icon={<Check className="h-3.5 w-3.5" />} onClick={() => approve(row.original)}>
                {t('actions.approve')}
              </Button>
              <Button size="xs" variant="secondary" icon={<X className="h-3.5 w-3.5" />} onClick={() => reject(row.original)}>
                {t('actions.reject')}
              </Button>
            </div>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, canApprove],
  );

  const pendingTotal = summary.data?.pending.amount ?? 0;
  const approvedTotal = summary.data?.approved.amount ?? 0;

  return (
    <div>
      <PageHeader title={t('payments.refunds.title')} subtitle={t('payments.refunds.subtitle')} />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard loading={loading} label={t('status.pending')} value={fmtMoney(pendingTotal, 'IQD', true)} icon={<Clock />} color="#F59E0B" hint={t('common.results', { count: summary.data?.pending.count ?? 0 })} />
        <StatCard loading={loading} label={t('status.approved')} value={fmtMoney(approvedTotal, 'IQD', true)} icon={<Undo2 />} color="#7C3AED" hint={t('common.results', { count: summary.data?.approved.count ?? 0 })} />
        <StatCard loading={loading} label={t('status.rejected')} value={fmtNumber(summary.data?.rejected.count ?? 0)} icon={<XCircle />} color="#DC2626" hint={' '} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 pt-2">
          <Tabs<TabKey>
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'pending', label: t('status.pending'), count: counts.pending },
              { key: 'approved', label: t('status.approved'), count: counts.approved },
              { key: 'rejected', label: t('status.rejected'), count: counts.rejected },
            ]}
          />
        </div>
        <DataTable
          key={tab}
          bare
          data={rows}
          columns={columns}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          server={list.server}
          onExport={can('payments', 'export') ? () => exp.mutate(exportRequest('csv', list.exportFilters)) : undefined}
          exporting={exp.isPending}
          bulkActions={
            tab === 'pending' && canApprove
              ? (rows, clear) => (
                  <Button size="sm" variant="success" icon={<Check className="h-4 w-4" />} onClick={() => bulkApprove(rows, clear)}>
                    {t('payments.refunds.bulkApprove')}
                  </Button>
                )
              : undefined
          }
          emptyTitle={tab === 'pending' ? t('payments.refunds.emptyPending') : undefined}
          emptyHint={tab === 'pending' ? t('payments.refunds.emptyPendingHint') : undefined}
        />
      </div>
    </div>
  );
}
