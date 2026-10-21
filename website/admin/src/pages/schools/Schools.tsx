import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CheckCircle2, GraduationCap, Pencil, Plus, School as SchoolIcon, Trash2, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { School } from '@/types';
import { governorateById, governorates, SCHOOL_TIERS } from '@/data';
import { useMarketers, useSchools } from '@/store/core';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
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
  const loading = useMockLoading();
  const schools = useSchools((s) => s.items);
  const remove = useSchools((s) => s.remove);
  const updateMany = useSchools((s) => s.updateMany);
  const marketers = useMarketers((s) => s.items);

  const [status, setStatus] = useState('');
  const [gov, setGov] = useState('');
  const [mkt, setMkt] = useState('');
  const [tier, setTier] = useState('');
  const [editing, setEditing] = useState<School | null>(null);
  const [drawer, setDrawer] = useState(false);

  const marketerName = (id: string | null) => {
    const m = marketers.find((x) => x.id === id);
    return m ? L(m, 'name') : null;
  };

  const rows = useMemo(
    () =>
      schools.filter(
        (s) =>
          (!status || s.status === status) &&
          (!gov || s.governorateId === gov) &&
          (!mkt || (mkt === '__none' ? !s.marketerId : s.marketerId === mkt)) &&
          (!tier || s.tier === tier),
      ),
    [schools, status, gov, mkt, tier],
  );

  const openEdit = (s: School | null) => {
    setEditing(s);
    setDrawer(true);
  };

  const del = async (s: School) => {
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: L(s, 'name') }), body: t('schools.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    remove(s.id);
    toast.success(t('toast.deleted', { entity: t('schools.entity') }));
  };

  const columns = useMemo<ColumnDef<School>[]>(
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
      { accessorKey: 'code', header: t('schools.fields.code'), cell: ({ getValue }) => <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs font-semibold" dir="ltr">{getValue<string>()}</code> },
      {
        id: 'location',
        accessorFn: (r) => `${L(r, 'city')} · ${L(governorateById(r.governorateId), 'name')}`,
        header: t('schools.fields.location'),
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <div>{L(row.original, 'city')}</div>
            <div className="text-xs text-muted">{L(governorateById(row.original.governorateId), 'name')}</div>
          </div>
        ),
      },
      { accessorKey: 'contactMobile', header: t('schools.fields.contactMobile'), cell: ({ getValue }) => <span className="whitespace-nowrap text-muted num" dir="ltr">{getValue<string>()}</span> },
      {
        id: 'marketer',
        accessorFn: (r) => marketerName(r.marketerId) ?? '',
        header: t('schools.fields.marketer'),
        cell: ({ row }) => {
          const m = marketers.find((x) => x.id === row.original.marketerId);
          return m ? (
            <span className="flex items-center gap-2 whitespace-nowrap">
              <Avatar name={m.name_en} src={m.avatar} size="xs" />
              {L(m, 'name')}
            </span>
          ) : (
            <span className="text-muted">{t('schools.unassigned')}</span>
          );
        },
      },
      {
        id: 'contract',
        accessorFn: (r) => r.contractEnd,
        header: t('schools.fields.contract'),
        meta: { exportValue: (r: School) => `${r.contractStart.slice(0, 10)} → ${r.contractEnd.slice(0, 10)}` },
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted">
            {fmtDate(row.original.contractStart, 'MMM yyyy')} – {fmtDate(row.original.contractEnd, 'MMM yyyy')}
          </span>
        ),
      },
      { accessorKey: 'status', header: t('common.status'), cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
      { accessorKey: 'verifiedPaidStudents', header: t('schools.fields.paidStudents'), meta: { align: 'end' }, cell: ({ getValue }) => <span className="font-semibold">{fmtNumber(getValue<number>())}</span> },
      { accessorKey: 'tier', header: t('schools.fields.tier'), cell: ({ getValue }) => <TierBadge tier={getValue<string>()} /> },
      { accessorKey: 'pendingSettlement', header: t('schools.fields.pendingSettlement'), meta: { align: 'end' }, cell: ({ getValue }) => fmtMoney(getValue<number>()) },
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
    [t, L, marketers, can],
  );

  const active = schools.filter((s) => s.status === 'active').length;
  const paid = schools.reduce((a, s) => a + s.verifiedPaidStudents, 0);
  const pending = schools.reduce((a, s) => a + s.pendingSettlement, 0);

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
        <StatCard loading={loading} label={t('schools.kpi.total')} value={fmtNumber(schools.length)} icon={<SchoolIcon />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('schools.kpi.active')} value={fmtNumber(active)} icon={<CheckCircle2 />} color="#16A34A" hint={`${fmtNumber(schools.length - active)} ${t('status.pending')} / ${t('status.suspended')}`} />
        <StatCard loading={loading} label={t('schools.kpi.paid')} value={fmtNumber(paid)} icon={<GraduationCap />} color="#2563EB" />
        <StatCard loading={loading} label={t('schools.kpi.pending')} value={fmtMoney(pending, 'IQD', true)} icon={<Wallet />} color="#C9A24A" onClick={() => navigate('/schools/settlements')} />
      </div>

      <DataTable
        data={rows}
        columns={columns}
        loading={loading}
        onRowClick={(s) => navigate(`/schools/${s.id}`)}
        searchText={(s) => `${s.name_en} ${s.name_ar} ${s.code} ${s.city_en} ${s.city_ar} ${s.contactName} ${s.contactMobile}`}
        exportName={can('schools', 'export') ? 'schools' : undefined}
        initialSort={[{ id: 'verifiedPaidStudents', desc: true }]}
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
            <FilterSelect
              label={t('schools.filters.governorate')}
              value={gov}
              onChange={setGov}
              options={governorates.filter((g) => schools.some((s) => s.governorateId === g.id)).map((g) => ({ value: g.id, label: L(g, 'name') }))}
            />
            <FilterSelect
              label={t('schools.filters.marketer')}
              value={mkt}
              onChange={setMkt}
              options={[{ value: '__none', label: t('schools.unassigned') }, ...marketers.map((m) => ({ value: m.id, label: L(m, 'name') }))]}
            />
            <FilterSelect label={t('schools.filters.tier')} value={tier} onChange={setTier} options={SCHOOL_TIERS.map((x) => ({ value: x.name, label: x.name }))} />
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
                    onClick={() => {
                      updateMany(sel.map((s) => s.id), { status: 'active' }, { action: 'school.bulk_activate', summary: `Activated ${sel.length} schools` });
                      toast.success(t('toast.bulkDone', { count: sel.length }));
                      clear();
                    }}
                  >
                    {t('schools.bulk.activate')}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Ban className="h-4 w-4" />}
                    onClick={async () => {
                      if (!(await confirm({ title: t('schools.bulk.suspendTitle', { count: sel.length }), body: t('schools.bulk.suspendBody'), confirmText: t('schools.bulk.suspend') }))) return;
                      updateMany(sel.map((s) => s.id), { status: 'suspended' }, { action: 'school.bulk_suspend', summary: `Suspended ${sel.length} schools` });
                      toast.success(t('toast.bulkDone', { count: sel.length }));
                      clear();
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
