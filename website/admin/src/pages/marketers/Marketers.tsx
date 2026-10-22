import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Award, GraduationCap, Megaphone, Pencil, Plus, School, Trash2, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { qk } from '@/api/keys';
import { exportRequest, useApiMutation, useExport, usePagedList } from '@/api/hooks';
import { useLookups } from '@/api/lookups';
import { marketersApi, partnerKeys, useMarketerStats, type MarketerVM } from '@/api/partners';
import type { BulkResult } from '@/api/types';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { fmtDate, fmtMoney, fmtNumber } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { MarketerForm } from '@/components/forms/MarketerForm';
import { Avatar, Badge, Button, DataTable, FilterSelect, StatCard, StatusBadge, Tooltip, useConfirm } from '@/components/ui';

export default function Marketers() {
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const can = useCan();
  const lookups = useLookups();
  const stats = useMarketerStats();
  const [status, setStatus] = useState('');
  const [gov, setGov] = useState('');
  const [editing, setEditing] = useState<MarketerVM | null>(null);
  const [drawer, setDrawer] = useState(false);

  const list = usePagedList({
    key: qk.marketers.list,
    fetcher: marketersApi.list,
    filters: { status, governorateId: gov },
    initialSort: '-paidStudents',
  });
  const exp = useExport('/admin/marketers/export', 'marketers');

  const bulkToast = (r: BulkResult) => {
    if (r.succeeded.length) toast.success(t('toast.bulkDone', { count: r.succeeded.length }));
    if (r.failed.length) toast.error(t('schools.bulkFailed', { count: r.failed.length, reason: r.failed[0]?.message ?? '' }));
  };
  const bulkStatus = useApiMutation((v: { ids: string[]; status: 'active' | 'inactive' }) => marketersApi.bulkStatus(v.ids, v.status), {
    invalidate: [...partnerKeys],
    onSuccess: bulkToast,
  });
  const removeM = useApiMutation((id: string) => marketersApi.remove(id), {
    invalidate: [...partnerKeys],
    success: () => t('toast.deleted', { entity: t('marketers.entity') }),
  });

  const openEdit = (m: MarketerVM | null) => {
    setEditing(m);
    setDrawer(true);
  };

  const del = async (m: MarketerVM) => {
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: L(m, 'name') }), body: t('marketers.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    removeM.mutate(m.id);
  };

  const columns = useMemo<ColumnDef<MarketerVM>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (r) => L(r, 'name'),
        header: t('marketers.fields.name'),
        meta: { label: t('marketers.fields.name') },
        cell: ({ row }) => (
          <div className="flex min-w-[200px] items-center gap-3">
            <Avatar name={row.original.name_en} src={row.original.avatar} size="md" />
            <div className="min-w-0">
              <div className="truncate font-semibold text-ink">{L(row.original, 'name')}</div>
              <div className="truncate text-xs text-muted">{L(row.original, 'governorateName')}</div>
            </div>
          </div>
        ),
      },
      { id: 'mobile', accessorKey: 'mobile', header: t('marketers.fields.mobile'), enableSorting: false, cell: ({ getValue }) => <span className="whitespace-nowrap text-muted num" dir="ltr">{getValue<string>()}</span> },
      { id: 'email', accessorKey: 'email', header: t('marketers.fields.email'), enableSorting: false, cell: ({ getValue }) => <span className="text-muted">{getValue<string>()}</span> },
      { id: 'schoolsCount', accessorFn: (r) => r.schoolsCount, header: t('marketers.fields.schools'), meta: { align: 'end' }, cell: ({ getValue }) => fmtNumber(getValue<number>()) },
      { id: 'paidStudents', accessorKey: 'paidStudents', header: t('marketers.fields.paid'), meta: { align: 'end' }, cell: ({ getValue }) => <span className="font-semibold">{fmtNumber(getValue<number>())}</span> },
      {
        id: 'milestonesHit',
        accessorKey: 'milestonesHit',
        header: t('marketers.fields.milestones'),
        meta: { align: 'center' },
        cell: ({ getValue }) => {
          const n = getValue<number>();
          return n ? <Badge tone="accent" icon={<Award className="h-3 w-3" />}>{fmtNumber(n)}</Badge> : <span className="text-muted">0</span>;
        },
      },
      { id: 'pendingReward', accessorKey: 'pendingReward', header: t('marketers.fields.pendingReward'), meta: { align: 'end' }, cell: ({ getValue }) => fmtMoney(getValue<number>()) },
      { id: 'status', accessorKey: 'status', header: t('common.status'), enableSorting: false, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
      { id: 'joinedAt', accessorKey: 'joinedAt', header: t('marketers.fields.joined'), cell: ({ getValue }) => <span className="whitespace-nowrap text-muted">{fmtDate(getValue<string>())}</span> },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {can('marketers', 'edit') && (
              <Tooltip content={t('actions.edit')}>
                <Button size="icon-sm" variant="ghost" aria-label={t('actions.edit')} onClick={() => openEdit(row.original)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </Tooltip>
            )}
            {can('marketers', 'delete') && (
              <Tooltip content={t('actions.delete')}>
                <Button size="icon-sm" variant="ghost" className="hover:bg-danger/10 hover:text-danger" aria-label={t('actions.delete')} onClick={() => del(row.original)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Tooltip>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, can],
  );

  const st = stats.data;

  return (
    <>
      <PageHeader
        title={t('marketers.title')}
        subtitle={t('marketers.subtitle')}
        actions={
          can('marketers', 'create') && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => openEdit(null)}>
              {t('marketers.add')}
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={stats.isLoading} label={t('marketers.kpi.active')} value={fmtNumber(st?.active ?? 0)} hint={`${fmtNumber(st?.total ?? 0)} ${t('common.total')}`} icon={<Megaphone />} color="#0B1F3A" />
        <StatCard loading={stats.isLoading} label={t('marketers.kpi.schools')} value={fmtNumber(st?.schoolsAssigned ?? 0)} icon={<School />} color="#7C3AED" />
        <StatCard loading={stats.isLoading} label={t('marketers.kpi.paid')} value={fmtNumber(st?.paidStudents ?? 0)} icon={<GraduationCap />} color="#2563EB" />
        <StatCard
          loading={stats.isLoading}
          label={t('marketers.kpi.pending')}
          value={fmtMoney(st?.pendingRewards ?? 0, 'IQD', true)}
          icon={<Wallet />}
          color="#C9A24A"
          onClick={() => navigate('/marketers/settlements')}
        />
      </div>
      <DataTable
        data={list.items}
        columns={columns}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        server={list.server}
        onRowClick={(m) => navigate(`/marketers/${m.id}`)}
        onExport={can('marketers', 'export') ? (ids) => exp.mutate(exportRequest('csv', list.exportFilters, ids)) : undefined}
        exporting={exp.isPending}
        initialHidden={['email', 'joinedAt']}
        toolbar={
          <>
            <FilterSelect label={t('common.status')} value={status} onChange={setStatus} options={(['active', 'inactive'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />
            <FilterSelect
              label={t('common.governorate')}
              value={gov}
              onChange={setGov}
              options={lookups.governorates.map((g) => ({ value: g.id, label: L(g, 'name') }))}
            />
          </>
        }
        bulkActions={
          can('marketers', 'edit')
            ? (sel, clear) => (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={bulkStatus.isPending && bulkStatus.variables?.status === 'active'}
                    onClick={() => bulkStatus.mutate({ ids: sel.map((m) => m.id), status: 'active' }, { onSuccess: clear })}
                  >
                    {t('actions.activate')}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={bulkStatus.isPending && bulkStatus.variables?.status === 'inactive'}
                    onClick={async () => {
                      if (!(await confirm({ title: `${t('actions.deactivate')} (${sel.length})`, body: t('confirm.title'), confirmText: t('actions.deactivate') }))) return;
                      bulkStatus.mutate({ ids: sel.map((m) => m.id), status: 'inactive' }, { onSuccess: clear });
                    }}

                  >
                    {t('actions.deactivate')}
                  </Button>
                </>
              )
            : undefined
        }
      />
      <MarketerForm open={drawer} onClose={() => setDrawer(false)} marketer={editing} />
    </>
  );
}
