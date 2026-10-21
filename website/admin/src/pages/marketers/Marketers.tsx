import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Award, GraduationCap, Megaphone, Pencil, Plus, School, Trash2, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Marketer } from '@/types';
import { governorateById, governorates } from '@/data';
import { useMarketers, useSchools } from '@/store/core';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
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
  const loading = useMockLoading();
  const marketers = useMarketers((s) => s.items);
  const remove = useMarketers((s) => s.remove);
  const updateMany = useMarketers((s) => s.updateMany);
  const updateSchools = useSchools((s) => s.updateMany);
  const [status, setStatus] = useState('');
  const [gov, setGov] = useState('');
  const [editing, setEditing] = useState<Marketer | null>(null);
  const [drawer, setDrawer] = useState(false);

  const rows = useMemo(() => marketers.filter((m) => (!status || m.status === status) && (!gov || m.governorateId === gov)), [marketers, status, gov]);

  const openEdit = (m: Marketer | null) => {
    setEditing(m);
    setDrawer(true);
  };

  const del = async (m: Marketer) => {
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: L(m, 'name') }), body: t('marketers.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    if (m.schoolIds.length) updateSchools(m.schoolIds, { marketerId: null }, { silent: true });
    remove(m.id);
    toast.success(t('toast.deleted', { entity: t('marketers.entity') }));
  };

  const columns = useMemo<ColumnDef<Marketer>[]>(
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
              <div className="truncate text-xs text-muted">{L(governorateById(row.original.governorateId), 'name')}</div>
            </div>
          </div>
        ),
      },
      { accessorKey: 'mobile', header: t('marketers.fields.mobile'), cell: ({ getValue }) => <span className="whitespace-nowrap text-muted num" dir="ltr">{getValue<string>()}</span> },
      { accessorKey: 'email', header: t('marketers.fields.email'), cell: ({ getValue }) => <span className="text-muted">{getValue<string>()}</span> },
      { id: 'schools', accessorFn: (r) => r.schoolIds.length, header: t('marketers.fields.schools'), meta: { align: 'end' }, cell: ({ getValue }) => fmtNumber(getValue<number>()) },
      { accessorKey: 'paidStudents', header: t('marketers.fields.paid'), meta: { align: 'end' }, cell: ({ getValue }) => <span className="font-semibold">{fmtNumber(getValue<number>())}</span> },
      {
        accessorKey: 'milestonesHit',
        header: t('marketers.fields.milestones'),
        meta: { align: 'center' },
        cell: ({ getValue }) => {
          const n = getValue<number>();
          return n ? <Badge tone="accent" icon={<Award className="h-3 w-3" />}>{fmtNumber(n)}</Badge> : <span className="text-muted">0</span>;
        },
      },
      { accessorKey: 'pendingReward', header: t('marketers.fields.pendingReward'), meta: { align: 'end' }, cell: ({ getValue }) => fmtMoney(getValue<number>()) },
      { accessorKey: 'status', header: t('common.status'), cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
      { accessorKey: 'joinedAt', header: t('marketers.fields.joined'), cell: ({ getValue }) => <span className="whitespace-nowrap text-muted">{fmtDate(getValue<string>())}</span> },
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

  const active = marketers.filter((m) => m.status === 'active');

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
        <StatCard loading={loading} label={t('marketers.kpi.active')} value={fmtNumber(active.length)} hint={`${fmtNumber(marketers.length)} ${t('common.total')}`} icon={<Megaphone />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('marketers.kpi.schools')} value={fmtNumber(marketers.reduce((a, m) => a + m.schoolIds.length, 0))} icon={<School />} color="#7C3AED" />
        <StatCard loading={loading} label={t('marketers.kpi.paid')} value={fmtNumber(marketers.reduce((a, m) => a + m.paidStudents, 0))} icon={<GraduationCap />} color="#2563EB" />
        <StatCard
          loading={loading}
          label={t('marketers.kpi.pending')}
          value={fmtMoney(marketers.reduce((a, m) => a + m.pendingReward, 0), 'IQD', true)}
          icon={<Wallet />}
          color="#C9A24A"
          onClick={() => navigate('/marketers/settlements')}
        />
      </div>
      <DataTable
        data={rows}
        columns={columns}
        loading={loading}
        onRowClick={(m) => navigate(`/marketers/${m.id}`)}
        searchText={(m) => `${m.name_en} ${m.name_ar} ${m.mobile} ${m.email}`}
        exportName={can('marketers', 'export') ? 'marketers' : undefined}
        initialSort={[{ id: 'paidStudents', desc: true }]}
        initialHidden={['email', 'joinedAt']}
        toolbar={
          <>
            <FilterSelect label={t('common.status')} value={status} onChange={setStatus} options={(['active', 'inactive'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />
            <FilterSelect
              label={t('common.governorate')}
              value={gov}
              onChange={setGov}
              options={governorates.filter((g) => marketers.some((m) => m.governorateId === g.id)).map((g) => ({ value: g.id, label: L(g, 'name') }))}
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
                    onClick={() => {
                      updateMany(sel.map((m) => m.id), { status: 'active' }, { action: 'marketer.bulk_activate', summary: `Activated ${sel.length} marketers` });
                      toast.success(t('toast.bulkDone', { count: sel.length }));
                      clear();
                    }}
                  >
                    {t('actions.activate')}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      if (!(await confirm({ title: `${t('actions.deactivate')} (${sel.length})`, body: t('confirm.title'), confirmText: t('actions.deactivate') }))) return;
                      updateMany(sel.map((m) => m.id), { status: 'inactive' }, { action: 'marketer.bulk_deactivate', summary: `Deactivated ${sel.length} marketers` });
                      toast.success(t('toast.bulkDone', { count: sel.length }));
                      clear();
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
