import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { BadgeCheck, CheckCheck, Clock, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Settlement } from '@/types';
import { useSettlements } from '@/store/partners';
import { useMarketers, useSchools } from '@/store/core';
import { useCan, useCurrentAdmin } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { fmtDate, fmtMoney, fmtNumber } from '@/utils/format';
import { Button, DataTable, FilterSelect, StatCard, StatusBadge, useConfirm } from '@/components/ui';

export const fmtPeriod = (period: string) => fmtDate(`${period}-01T00:00:00`, 'MMM yyyy');

interface Props {
  partnerType: Settlement['partnerType'];
  /** Restrict to one partner (detail pages). */
  partnerId?: string;
  /** Compact: no totals strip, no partner column. */
  compact?: boolean;
}

/** Settlement list with approve / mark-paid workflow, shared by schools and marketers. */
export function SettlementsTable({ partnerType, partnerId, compact }: Props) {
  const { t } = useTranslation();
  const L = useLocalize();
  const confirm = useConfirm();
  const can = useCan();
  const admin = useCurrentAdmin();
  const loading = useMockLoading();
  const all = useSettlements((s) => s.items);
  const update = useSettlements((s) => s.update);
  const updateMany = useSettlements((s) => s.updateMany);
  const schools = useSchools((s) => s.items);
  const marketers = useMarketers((s) => s.items);
  const [period, setPeriod] = useState('');
  const [status, setStatus] = useState('');

  const module = partnerType === 'school' ? 'schools' : 'marketers';
  const canApprove = can(module, 'approve');

  const partnerName = (id: string) => {
    const p = partnerType === 'school' ? schools.find((s) => s.id === id) : marketers.find((m) => m.id === id);
    return p ? L(p, 'name') : id;
  };

  const scoped = useMemo(() => all.filter((s) => s.partnerType === partnerType && (!partnerId || s.partnerId === partnerId)), [all, partnerType, partnerId]);
  const rows = useMemo(() => scoped.filter((s) => (!period || s.period === period) && (!status || s.status === status)), [scoped, period, status]);
  const periods = useMemo(() => [...new Set(scoped.map((s) => s.period))].sort().reverse(), [scoped]);

  const sum = (st: Settlement['status']) => rows.filter((r) => r.status === st);
  const totals = (['pending', 'approved', 'paid'] as const).map((st) => ({ st, list: sum(st) }));

  const by = admin?.name ?? 'Admin';

  const approve = async (s: Settlement) => {
    const ok = await confirm({ title: t('schools.settlements.approveTitle', { amount: fmtMoney(s.amount) }), body: t('schools.settlements.approveBody'), tone: 'primary', confirmText: t('schools.settlements.approve') });
    if (!ok) return;
    update(s.id, { status: 'approved', approvedBy: by }, { action: 'settlement.approve', summary: `Approved ${partnerType} settlement ${partnerName(s.partnerId)} · ${s.period} (${fmtMoney(s.amount)})` });
    toast.success(t('schools.settlements.approved'));
  };

  const pay = async (s: Settlement) => {
    const ok = await confirm({ title: t('schools.settlements.payTitle', { amount: fmtMoney(s.amount) }), body: t('schools.settlements.payBody'), tone: 'warning', confirmText: t('schools.settlements.markPaid') });
    if (!ok) return;
    update(s.id, { status: 'paid', paidAt: new Date().toISOString() }, { action: 'settlement.mark_paid', summary: `Marked ${partnerType} settlement ${partnerName(s.partnerId)} · ${s.period} as paid` });
    toast.success(t('schools.settlements.paid'));
  };

  const columns = useMemo<ColumnDef<Settlement>[]>(
    () => [
      { accessorKey: 'period', header: t('schools.settlements.period'), cell: ({ row }) => <span className="font-medium">{fmtPeriod(row.original.period)}</span> },
      ...(compact
        ? []
        : [
            {
              id: 'partner',
              accessorFn: (r: Settlement) => partnerName(r.partnerId),
              header: t('schools.settlements.partner'),
              cell: ({ row }: { row: { original: Settlement } }) => (
                <Link
                  to={`/${module}/${row.original.partnerId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-ink hover:text-accent hover:underline"
                >
                  {partnerName(row.original.partnerId)}
                </Link>
              ),
            } as ColumnDef<Settlement>,
          ]),
      { accessorKey: 'qualifiedStudents', header: t('schools.settlements.qualified'), meta: { align: 'end' }, cell: ({ getValue }) => fmtNumber(getValue<number>()) },
      { accessorKey: 'amount', header: t('schools.settlements.amount'), meta: { align: 'end' }, cell: ({ getValue }) => <span className="font-semibold">{fmtMoney(getValue<number>())}</span> },
      { accessorKey: 'status', header: t('common.status'), cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
      { accessorKey: 'approvedBy', header: t('schools.settlements.approvedBy'), cell: ({ getValue }) => <span className="text-muted">{getValue<string | null>() ?? '—'}</span> },
      { accessorKey: 'paidAt', header: t('schools.settlements.paidAt'), cell: ({ getValue }) => <span className="text-muted">{fmtDate(getValue<string | null>())}</span> },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row }) => {
          const s = row.original;
          if (!canApprove || s.status === 'paid') return null;
          return s.status === 'pending' ? (
            <Button size="xs" variant="outline" icon={<BadgeCheck className="h-3.5 w-3.5" />} onClick={() => approve(s)}>
              {t('schools.settlements.approve')}
            </Button>
          ) : (
            <Button size="xs" variant="success" icon={<Wallet className="h-3.5 w-3.5" />} onClick={() => pay(s)}>
              {t('schools.settlements.markPaid')}
            </Button>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, compact, canApprove, schools, marketers, module],
  );

  const icons = { pending: <Clock />, approved: <BadgeCheck />, paid: <CheckCheck /> };
  const colors = { pending: '#F59E0B', approved: '#2563EB', paid: '#16A34A' };

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="grid gap-4 sm:grid-cols-3">
          {totals.map(({ st, list }) => (
            <StatCard
              key={st}
              loading={loading}
              label={t(`schools.settlements.totals.${st}`)}
              value={fmtMoney(list.reduce((a, b) => a + b.amount, 0), 'IQD', true)}
              hint={t('schools.settlements.totals.count', { count: list.length })}
              icon={icons[st]}
              color={colors[st]}
              onClick={() => setStatus(status === st ? '' : st)}
            />
          ))}
        </div>
      )}
      <DataTable
        data={rows}
        columns={columns}
        loading={loading}
        hideSearch={compact}
        searchText={(r) => `${partnerName(r.partnerId)} ${r.period} ${r.status}`}
        exportName={can(module, 'export') ? `${partnerType}-settlements` : undefined}
        initialSort={[{ id: 'period', desc: true }]}
        pageSize={compact ? 5 : 10}
        emptyTitle={t('schools.settlements.empty')}
        toolbar={
          <>
            <FilterSelect label={t('schools.settlements.period')} value={period} onChange={setPeriod} options={periods.map((p) => ({ value: p, label: fmtPeriod(p) }))} />
            <FilterSelect
              label={t('common.status')}
              value={status}
              onChange={setStatus}
              options={(['pending', 'approved', 'paid'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))}
            />
          </>
        }
        bulkActions={
          canApprove
            ? (sel, clear) => {
                const pend = sel.filter((s) => s.status === 'pending');
                const appr = sel.filter((s) => s.status === 'approved');
                return (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!pend.length}
                      icon={<BadgeCheck className="h-4 w-4" />}
                      onClick={async () => {
                        if (!(await confirm({ title: t('schools.settlements.bulkApproveTitle', { count: pend.length }), body: t('schools.settlements.approveBody'), tone: 'primary' }))) return;
                        updateMany(pend.map((s) => s.id), { status: 'approved', approvedBy: by }, { action: 'settlement.bulk_approve', summary: `Approved ${pend.length} ${partnerType} settlements` });
                        toast.success(t('schools.settlements.bulkApproved', { count: pend.length }));
                        clear();
                      }}
                    >
                      {t('schools.settlements.approve')} ({pend.length})
                    </Button>
                    <Button
                      size="sm"
                      variant="success"
                      disabled={!appr.length}
                      icon={<Wallet className="h-4 w-4" />}
                      onClick={async () => {
                        if (!(await confirm({ title: t('schools.settlements.bulkPayTitle', { count: appr.length }), body: t('schools.settlements.payBody'), tone: 'warning' }))) return;
                        updateMany(appr.map((s) => s.id), { status: 'paid', paidAt: new Date().toISOString() }, { action: 'settlement.bulk_mark_paid', summary: `Marked ${appr.length} ${partnerType} settlements as paid` });
                        toast.success(t('schools.settlements.bulkPaid', { count: appr.length }));
                        clear();
                      }}
                    >
                      {t('schools.settlements.markPaid')} ({appr.length})
                    </Button>
                  </>
                );
              }
            : undefined
        }
        bare={compact}
      />
    </div>
  );
}
