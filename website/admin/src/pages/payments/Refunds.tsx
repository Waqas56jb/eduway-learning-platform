import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Check, Clock, Undo2, X, XCircle } from 'lucide-react';
import type { Refund } from '@/types';
import { fmtDateTime, fmtMoney, fmtNumber, fmtRelative } from '@/utils/format';
import { useRefunds, useStudents, useTransactions } from '@/store/core';
import { useCan, useCurrentAdmin } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, DataTable, StatCard, StatusBadge, Tabs, useConfirm } from '@/components/ui';
import { approveRefund, rejectRefund } from './shared';

type TabKey = 'pending' | 'approved' | 'rejected';

export default function Refunds() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const loading = useMockLoading();
  const admin = useCurrentAdmin();
  const refunds = useRefunds((s) => s.items);
  const txns = useTransactions((s) => s.items);
  const students = useStudents((s) => s.items);
  const [tab, setTab] = useState<TabKey>('pending');
  const canApprove = can('payments', 'approve');
  const by = admin?.name ?? 'System';

  const studentName = (id: string) => L(students.find((s) => s.id === id), 'name');
  const txnRef = (id: string) => txns.find((x) => x.id === id)?.ref ?? '—';

  const counts = useMemo(
    () => ({
      pending: refunds.filter((r) => r.status === 'pending'),
      approved: refunds.filter((r) => r.status === 'approved'),
      rejected: refunds.filter((r) => r.status === 'rejected'),
    }),
    [refunds],
  );

  const approve = async (r: Refund) => {
    const ok = await confirm({
      title: t('payments.refunds.approveTitle', { amount: fmtMoney(r.amount, r.currency) }),
      body: t('payments.refunds.approveBody', { name: studentName(r.studentId), ref: txnRef(r.transactionId) }),
      tone: 'primary',
      confirmText: t('actions.approve'),
    });
    if (!ok) return;
    approveRefund(r, by);
    toast.success(t('payments.refunds.approved'));
  };

  const reject = async (r: Refund) => {
    const res = await confirm({
      title: t('payments.refunds.rejectTitle'),
      body: t('payments.refunds.rejectBody'),
      reason: { label: t('payments.refunds.rejectReason') },
      confirmText: t('actions.reject'),
    });
    if (!res) return;
    rejectRefund(r, by, res.reason);
    toast.success(t('payments.refunds.rejected'));
  };

  const bulkApprove = async (rows: Refund[], clear: () => void) => {
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const ok = await confirm({
      title: t('payments.refunds.approveTitle', { amount: fmtMoney(total, 'IQD') }),
      body: t('toast.bulkDone', { count: rows.length }),
      tone: 'primary',
      confirmText: t('payments.refunds.bulkApprove'),
    });
    if (!ok) return;
    rows.forEach((r) => approveRefund(r, by));
    clear();
    toast.success(t('toast.bulkDone', { count: rows.length }));
  };

  const columns = useMemo<ColumnDef<Refund>[]>(
    () => [
      {
        id: 'ref',
        accessorFn: (r) => txnRef(r.transactionId),
        header: t('payments.ref'),
        meta: { label: t('payments.ref') },
        cell: ({ row }) => (
          <Link to={`/payments/transactions/${row.original.transactionId}`} className="font-mono text-xs font-semibold text-primary hover:text-accent hover:underline" dir="ltr">
            {txnRef(row.original.transactionId)}
          </Link>
        ),
      },
      {
        id: 'student',
        accessorFn: (r) => studentName(r.studentId),
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
        header: t('payments.refunds.kind'),
        meta: { label: t('payments.refunds.kind') },
        cell: ({ row }) => <Badge tone={row.original.kind === 'full' ? 'purple' : 'accent'}>{t(`payments.refunds.${row.original.kind}`)}</Badge>,
      },
      {
        id: 'reason',
        accessorKey: 'reason',
        header: t('common.reason'),
        meta: { label: t('common.reason') },
        cell: ({ getValue }) => <span className="line-clamp-2 min-w-[12rem] max-w-xs text-ink/80">{getValue<string>()}</span>,
      },
      {
        id: 'requestedBy',
        accessorKey: 'requestedBy',
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
        header: t('payments.refunds.decidedBy'),
        meta: { label: t('payments.refunds.decidedBy') },
        cell: ({ row }) =>
          row.original.decidedBy ? (
            <div className="whitespace-nowrap">
              <div className="text-ink/80">{row.original.decidedBy}</div>
              <div className="text-[11px] text-muted num">{fmtDateTime(row.original.decidedAt)}</div>
            </div>
          ) : (
            <span className="text-muted">—</span>
          ),
      },
      {
        id: 'status',
        accessorKey: 'status',
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
    [t, L, txns, students, canApprove, by],
  );

  const pendingTotal = counts.pending.reduce((s, r) => s + r.amount, 0);
  const approvedTotal = counts.approved.reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <PageHeader title={t('payments.refunds.title')} subtitle={t('payments.refunds.subtitle')} />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard loading={loading} label={t('status.pending')} value={fmtMoney(pendingTotal, 'IQD', true)} icon={<Clock />} color="#F59E0B" hint={t('common.results', { count: counts.pending.length })} />
        <StatCard loading={loading} label={t('status.approved')} value={fmtMoney(approvedTotal, 'IQD', true)} icon={<Undo2 />} color="#7C3AED" hint={t('common.results', { count: counts.approved.length })} />
        <StatCard loading={loading} label={t('status.rejected')} value={fmtNumber(counts.rejected.length)} icon={<XCircle />} color="#DC2626" hint={' '} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 pt-2">
          <Tabs<TabKey>
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'pending', label: t('status.pending'), count: counts.pending.length },
              { key: 'approved', label: t('status.approved'), count: counts.approved.length },
              { key: 'rejected', label: t('status.rejected'), count: counts.rejected.length },
            ]}
          />
        </div>
        <DataTable
          key={tab}
          bare
          data={counts[tab]}
          columns={columns}
          loading={loading}
          exportName={can('payments', 'export') ? `refunds-${tab}` : undefined}
          bulkActions={
            tab === 'pending' && canApprove
              ? (rows, clear) => (
                  <Button size="sm" variant="success" icon={<Check className="h-4 w-4" />} onClick={() => bulkApprove(rows, clear)}>
                    {t('payments.refunds.bulkApprove')}
                  </Button>
                )
              : undefined
          }
          searchText={(r) => `${txnRef(r.transactionId)} ${studentName(r.studentId)} ${r.reason} ${r.requestedBy}`}
          emptyTitle={tab === 'pending' ? t('payments.refunds.emptyPending') : undefined}
          emptyHint={tab === 'pending' ? t('payments.refunds.emptyPendingHint') : undefined}
        />
      </div>
    </div>
  );
}
