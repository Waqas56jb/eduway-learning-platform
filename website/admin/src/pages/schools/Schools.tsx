import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CheckCircle2, GraduationCap, Pencil, Plus, School as SchoolIcon, Trash2, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { qk } from '@/api/keys';
import { exportRequest, useApiMutation, useExport, usePagedList } from '@/api/hooks';
import { useLookups } from '@/api/lookups';
import { partnerKeys, schoolsApi, useSchoolStats, type SchoolVM } from '@/api/partners';
import type { BulkResult } from '@/api/types';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { fmtDate, fmtMoney, fmtNumber } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { SchoolForm } from '@/components/forms/SchoolForm';
import { Avatar, Button, DataTable, FilterSelect, StatCard, StatusBadge, Tooltip, useConfirm } from '@/components/ui';
import { TierBadge } from './TierBadge';

export default function Schools() {
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const can = useCan();
  const lookups = useLookups();
  const stats = useSchoolStats();

  const [status, setStatus] = useState('');
  const [gov, setGov] = useState('');
  const [mkt, setMkt] = useState('');
  const [tier, setTier] = useState('');
  const [editing, setEditing] = useState<SchoolVM | null>(null);
  const [drawer, setDrawer] = useState(false);

  const list = usePagedList({
    key: qk.schools.list,
    fetcher: schoolsApi.list,
    filters: { status, governorateId: gov, marketerId: mkt, tier },
    initialSort: '-verifiedPaidStudents',
  });
  const exp = useExport('/admin/schools/export', 'schools');

  const bulkToast = (r: BulkResult) => {
    if (r.succeeded.length) toast.success(t('toast.bulkDone', { count: r.succeeded.length }));
    if (r.failed.length) toast.error(t('schools.bulkFailed', { count: r.failed.length, reason: r.failed[0]?.message ?? '' }));
  };
  const bulkStatus = useApiMutation((v: { ids: string[]; status: 'active' | 'suspended' }) => schoolsApi.bulkStatus(v), {
    invalidate: [...partnerKeys],
    onSuccess: bulkToast,
  });
  const removeM = useApiMutation((id: string) => schoolsApi.remove(id), {
    invalidate: [...partnerKeys],
    success: () => t('toast.deleted', { entity: t('schools.entity') }),
  });

  const openEdit = (s: SchoolVM | null) => {
    setEditing(s);
    setDrawer(true);
  };

  const del = async (s: SchoolVM) => {
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: L(s, 'name') }), body: t('schools.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    removeM.mutate(s.id);
  };

  const columns = useMemo<ColumnDef<SchoolVM>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (r) => L(r, 'name'),
        header: t('schools.fields.name'),
        meta: { label: t('schools.fields.name') },
        cell: ({ row }) => (
          <div className="flex min-w-[220px] items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/[0.07] text-primary">
              <SchoolIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold text-ink">{L(row.original, 'name')}</div>
              <div className="text-xs text-muted">{row.original.contactName}</div>
            </div>
          </div>
        ),
      },
      { id: 'code', accessorKey: 'code', header: t('schools.fields.code'), cell: ({ getValue }) => <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs font-semibold" dir="ltr">{getValue<string>()}</code> },
      {
        id: 'location',
        accessorFn: (r) => `${L(r, 'city')} · ${L(r, 'governorateName')}`,
        header: t('schools.fields.location'),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <div>{L(row.original, 'city')}</div>
            <div className="text-xs text-muted">{L(row.original, 'governorateName')}</div>
          </div>
        ),
      },
      { id: 'contactMobile', accessorKey: 'contactMobile', header: t('schools.fields.contactMobile'), enableSorting: false, cell: ({ getValue }) => <span className="whitespace-nowrap text-muted num" dir="ltr">{getValue<string>()}</span> },
      {
        id: 'marketer',
        accessorFn: (r) => (r.marketer ? L(r.marketer, 'name') : ''),
        header: t('schools.fields.marketer'),
        enableSorting: false,
        cell: ({ row }) => {
          const m = row.original.marketer;
          return m ? (
            <span className="flex items-center gap-2 whitespace-nowrap">
              <Avatar name={m.name_en} src={m.avatarUrl ?? undefined} size="xs" />
              {L(m, 'name')}
            </span>
          ) : (
            <span className="text-muted">{t('schools.unassigned')}</span>
          );
        },
      },
      {
        id: 'contractEnd',
        accessorFn: (r) => r.contractEnd,
        header: t('schools.fields.contract'),
        meta: { exportValue: (r: SchoolVM) => `${r.contractStart.slice(0, 10)} → ${r.contractEnd.slice(0, 10)}` },
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted">
            {fmtDate(row.original.contractStart, 'MMM yyyy')} – {fmtDate(row.original.contractEnd, 'MMM yyyy')}
          </span>
        ),
      },
      { id: 'status', accessorKey: 'status', header: t('common.status'), cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
      { id: 'verifiedPaidStudents', accessorKey: 'verifiedPaidStudents', header: t('schools.fields.paidStudents'), meta: { align: 'end' }, cell: ({ getValue }) => <span className="font-semibold">{fmtNumber(getValue<number>())}</span> },
      { id: 'tier', accessorKey: 'tier', header: t('schools.fields.tier'), enableSorting: false, cell: ({ getValue }) => (getValue<string>() ? <TierBadge tier={getValue<string>()} /> : <span className="text-muted">—</span>) },
      { id: 'pendingSettlement', accessorKey: 'pendingSettlement', header: t('schools.fields.pendingSettlement'), meta: { align: 'end' }, cell: ({ getValue }) => fmtMoney(getValue<number>()) },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {can('schools', 'edit') && (
              <Tooltip content={t('actions.edit')}>
                <Button size="icon-sm" variant="ghost" aria-label={t('actions.edit')} onClick={() => openEdit(row.original)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </Tooltip>
            )}
            {can('schools', 'delete') && (
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
        title={t('schools.title')}
        subtitle={t('schools.subtitle')}
        actions={
          can('schools', 'create') && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => openEdit(null)}>
              {t('schools.add')}
            </Button>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={stats.isLoading} label={t('schools.kpi.total')} value={fmtNumber(st?.total ?? 0)} icon={<SchoolIcon />} color="#0B1F3A" />
        <StatCard
          loading={stats.isLoading}
          label={t('schools.kpi.active')}
          value={fmtNumber(st?.active ?? 0)}
          icon={<CheckCircle2 />}
          color="#16A34A"
          hint={`${fmtNumber((st?.pending ?? 0) + (st?.suspended ?? 0))} ${t('status.pending')} / ${t('status.suspended')}`}
        />
        <StatCard loading={stats.isLoading} label={t('schools.kpi.paid')} value={fmtNumber(st?.verifiedPaidStudents ?? 0)} icon={<GraduationCap />} color="#2563EB" />
        <StatCard loading={stats.isLoading} label={t('schools.kpi.pending')} value={fmtMoney(st?.pendingSettlement ?? 0, 'IQD', true)} icon={<Wallet />} color="#C9A24A" onClick={() => navigate('/schools/settlements')} />
      </div>

      <DataTable
        data={list.items}
        columns={columns}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        server={list.server}
        onRowClick={(s) => navigate(`/schools/${s.id}`)}
        onExport={can('schools', 'export') ? (ids) => exp.mutate(exportRequest('csv', list.exportFilters, ids)) : undefined}
        exporting={exp.isPending}
        initialHidden={['contactMobile']}
        emptyAction={
          can('schools', 'create') ? (
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => openEdit(null)}>
              {t('schools.add')}
            </Button>
          ) : undefined
        }
        toolbar={
          <>
            <FilterSelect label={t('schools.filters.status')} value={status} onChange={setStatus} options={(['active', 'pending', 'suspended'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />
            <FilterSelect label={t('schools.filters.governorate')} value={gov} onChange={setGov} options={lookups.governorates.map((g) => ({ value: g.id, label: L(g, 'name') }))} />
            <FilterSelect
              label={t('schools.filters.marketer')}
              value={mkt}
              onChange={setMkt}
              options={[{ value: '__none', label: t('schools.unassigned') }, ...lookups.marketers.map((m) => ({ value: m.id, label: L(m, 'name') }))]}
            />
            <FilterSelect label={t('schools.filters.tier')} value={tier} onChange={setTier} options={(st?.tiers ?? []).map((x) => ({ value: x, label: x }))} />
          </>
        }
        bulkActions={
          can('schools', 'edit')
            ? (sel, clear) => (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    loading={bulkStatus.isPending && bulkStatus.variables?.status === 'active'}
                    onClick={() => bulkStatus.mutate({ ids: sel.map((s) => s.id), status: 'active' }, { onSuccess: clear })}
                  >
                    {t('schools.bulk.activate')}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Ban className="h-4 w-4" />}
                    loading={bulkStatus.isPending && bulkStatus.variables?.status === 'suspended'}
                    onClick={async () => {
                      if (!(await confirm({ title: t('schools.bulk.suspendTitle', { count: sel.length }), body: t('schools.bulk.suspendBody'), confirmText: t('schools.bulk.suspend') }))) return;
                      bulkStatus.mutate({ ids: sel.map((s) => s.id), status: 'suspended' }, { onSuccess: clear });
                    }}
                  >
                    {t('schools.bulk.suspend')}
                  </Button>
                </>
              )
            : undefined
        }
      />

      <SchoolForm open={drawer} onClose={() => setDrawer(false)} school={editing} />
    </>
  );
}
