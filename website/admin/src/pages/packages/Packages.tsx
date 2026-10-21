import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import toast from 'react-hot-toast';
import { Archive, ArchiveRestore, CalendarClock, Copy, LayoutGrid, MoreHorizontal, Pencil, Plus, Receipt, RefreshCcw, Sparkles, Star, Table2, Trash2, Users } from 'lucide-react';
import type { Package, Subject } from '@/types';
import { cn } from '@/utils/cn';
import { uid } from '@/utils/id';
import { fmtDate, fmtMoney, fmtNumber } from '@/utils/format';
import { usePackages, useStudents, useSubjects } from '@/store/core';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, DataTable, EmptyState, FilterSelect, MenuDivider, MenuItem, Popover, Segmented, SkeletonCard, StatusBadge, useConfirm } from '@/components/ui';
import { PackageEditor } from './PackageEditor';

export function validityLabel(p: Package, t: TFunction) {
  if (p.validityType === 'until_date') return t('packages.validityUntil', { date: fmtDate(p.validUntil) });
  if (p.validityType === 'days') return t('packages.validityDays', { count: p.validityValue });
  return t('packages.validityMonths', { count: p.validityValue });
}

export function SubjectChips({ ids, subjects, max = 5 }: { ids: string[]; subjects: Subject[]; max?: number }) {
  const L = useLocalize();
  const list = subjects.filter((s) => ids.includes(s.id));
  return (
    <div className="flex flex-wrap gap-1">
      {list.slice(0, max).map((s) => (
        <span key={s.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${s.color}17`, color: s.color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
          {L(s, 'name')}
        </span>
      ))}
      {list.length > max && <Badge>+{list.length - max}</Badge>}
    </div>
  );
}

type View = 'cards' | 'table';

export default function Packages() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const loading = useMockLoading();
  const packages = usePackages((s) => s.items);
  const add = usePackages((s) => s.add);
  const update = usePackages((s) => s.update);
  const remove = usePackages((s) => s.remove);
  const students = useStudents((s) => s.items);
  const subjects = useSubjects((s) => s.items);
  const [view, setView] = useState<View>('cards');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Package | null>(null);
  const [drawer, setDrawer] = useState(false);

  // Live subscriber counts from the students store.
  const subs = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of students) if (s.packageId && s.subscriptionStatus === 'active') m[s.packageId] = (m[s.packageId] ?? 0) + 1;
    return m;
  }, [students]);

  const rows = useMemo(() => packages.map((p) => ({ ...p, subscribers: subs[p.id] ?? 0 })).filter((p) => !status || p.status === status), [packages, subs, status]);

  const openNew = () => {
    setEditing(null);
    setDrawer(true);
  };
  const openEdit = (p: Package) => {
    setEditing(p);
    setDrawer(true);
  };

  const duplicate = (p: Package) => {
    add({
      ...p,
      id: uid('pkg'),
      name_en: `${p.name_en} ${t('packages.copySuffix')}`,
      name_ar: `${p.name_ar} ${t('packages.copySuffixAr')}`,
      status: 'draft',
      featured: false,
      subscribers: 0,
    });
    toast.success(t('packages.duplicated'));
  };

  const archive = async (p: Package) => {
    const n = subs[p.id] ?? 0;
    const ok = await confirm({
      title: t('packages.archiveTitle', { name: L(p, 'name') }),
      body: (
        <>
          {t('packages.archiveBody')}
          {n > 0 && <span className="mt-2 block font-semibold text-warning">{t('packages.archiveWarn', { count: n })}</span>}
        </>
      ),
      tone: 'warning',
      confirmText: t('actions.archive'),
    });
    if (!ok) return;
    update(p.id, { status: 'archived', featured: false }, { action: 'package.archive', summary: `Archived package “${p.name_en}”` });
    toast.success(t('packages.archived'));
  };

  const restore = (p: Package) => {
    update(p.id, { status: 'active' }, { action: 'package.restore', summary: `Restored package “${p.name_en}”` });
    toast.success(t('packages.restored'));
  };

  const del = async (p: Package) => {
    if ((subs[p.id] ?? 0) > 0) {
      toast.error(t('packages.deleteBlocked'));
      return;
    }
    const ok = await confirm({
      title: t('confirm.deleteTitle', { entity: L(p, 'name') }),
      body: t('confirm.deleteBody'),
      confirmText: t('actions.delete'),
      typeToConfirm: 'DELETE',
    });
    if (!ok) return;
    remove(p.id);
    toast.success(t('toast.deleted', { entity: t('packages.entity') }));
  };

  const actionsMenu = (p: Package) => (
    <Popover
      panelClassName="w-48"
      trigger={({ toggle, open }) => (
        <Button variant="ghost" size="icon-sm" onClick={toggle} aria-expanded={open} aria-label={t('actions.more')}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      )}
    >
      {(close) => (
        <div role="menu">
          <MenuItem icon={<Pencil />} disabled={!can('packages', 'edit')} onClick={() => { close(); openEdit(p); }}>
            {t('actions.edit')}
          </MenuItem>
          <MenuItem icon={<Copy />} disabled={!can('packages', 'create')} onClick={() => { close(); duplicate(p); }}>
            {t('actions.duplicate')}
          </MenuItem>
          {p.status === 'archived' ? (
            <MenuItem icon={<ArchiveRestore />} disabled={!can('packages', 'edit')} onClick={() => { close(); restore(p); }}>
              {t('actions.restore')}
            </MenuItem>
          ) : (
            <MenuItem icon={<Archive />} disabled={!can('packages', 'edit')} onClick={() => { close(); archive(p); }}>
              {t('actions.archive')}
            </MenuItem>
          )}
          <MenuDivider />
          <MenuItem danger icon={<Trash2 />} disabled={!can('packages', 'delete')} onClick={() => { close(); del(p); }}>
            {t('actions.delete')}
          </MenuItem>
        </div>
      )}
    </Popover>
  );

  const columns = useMemo<ColumnDef<Package>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (p) => L(p, 'name'),
        header: t('common.name'),
        meta: { label: t('common.name') },
        cell: ({ row }) => (
          <div className="flex min-w-[12rem] items-center gap-2">
            <span className="font-semibold text-ink">{L(row.original, 'name')}</span>
            {row.original.featured && <Star className="h-3.5 w-3.5 fill-accent text-accent" aria-label={t('packages.featured')} />}
          </div>
        ),
      },
      {
        id: 'subjects',
        accessorFn: (p) => p.subjectIds.length,
        header: t('common.subjects'),
        meta: { label: t('common.subjects'), exportValue: (p) => p.subjectIds.map((id) => subjects.find((s) => s.id === id)?.name_en).join(' | ') },
        cell: ({ row }) => <SubjectChips ids={row.original.subjectIds} subjects={subjects} max={3} />,
      },
      {
        id: 'price',
        accessorKey: 'price',
        header: t('packages.price'),
        meta: { align: 'end', label: t('packages.price') },
        cell: ({ row }) => <span className="font-semibold">{fmtMoney(row.original.price, row.original.currency)}</span>,
      },
      {
        id: 'tax',
        accessorKey: 'taxBehavior',
        header: t('packages.taxBehavior'),
        meta: { label: t('packages.taxBehavior') },
        cell: ({ row }) => <span className="text-muted">{t(`packages.tax.${row.original.taxBehavior}`)}</span>,
      },
      {
        id: 'validity',
        accessorFn: (p) => validityLabel(p, t),
        header: t('packages.validity'),
        meta: { label: t('packages.validity') },
      },
      {
        id: 'renewal',
        accessorFn: (p) => t(`packages.renewals.${p.renewal}`),
        header: t('packages.renewal'),
        meta: { label: t('packages.renewal') },
      },
      {
        id: 'access',
        accessorFn: (p) => (p.accessStart === 'immediate' ? t('packages.accessStarts.immediate') : t('packages.accessFrom', { date: fmtDate(p.accessStartDate) })),
        header: t('packages.accessStart'),
        meta: { label: t('packages.accessStart') },
      },
      {
        id: 'subscribers',
        accessorKey: 'subscribers',
        header: t('packages.subscribers'),
        meta: { align: 'end', label: t('packages.subscribers') },
        cell: ({ row }) => fmtNumber(row.original.subscribers),
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
        meta: { noExport: true, align: 'end', className: 'w-12' },
        cell: ({ row }) => <span onClick={(e) => e.stopPropagation()}>{actionsMenu(row.original)}</span>,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, subjects, subs, can],
  );

  const statusOptions = (['active', 'draft', 'archived'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }));

  return (
    <div>
      <PageHeader
        title={t('packages.title')}
        subtitle={t('packages.subtitle')}
        actions={
          can('packages', 'create') && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
              {t('packages.new')}
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented<View>
          aria-label={t('actions.view')}
          value={view}
          onChange={setView}
          options={[
            { value: 'cards', label: <span className="inline-flex items-center gap-1.5"><LayoutGrid className="h-4 w-4" />{t('packages.viewCards')}</span> },
            { value: 'table', label: <span className="inline-flex items-center gap-1.5"><Table2 className="h-4 w-4" />{t('packages.viewTable')}</span> },
          ]}
        />
        {view === 'cards' && <FilterSelect label={t('common.status')} value={status} onChange={setStatus} options={statusOptions} className="w-44" />}
        <span className="ms-auto text-xs text-muted num">{t('common.results', { count: rows.length })}</span>
      </div>

      {view === 'table' ? (
        <DataTable
          data={rows}
          columns={columns}
          loading={loading}
          onRowClick={can('packages', 'edit') ? openEdit : undefined}
          exportName={can('packages', 'export') ? 'packages' : undefined}
          searchText={(p) => `${p.name_en} ${p.name_ar}`}
          toolbar={<FilterSelect label={t('common.status')} value={status} onChange={setStatus} options={statusOptions} />}
        />
      ) : loading ? (
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={6} className="h-[26rem]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState action={can('packages', 'create') && <Button size="sm" onClick={openNew}>{t('packages.new')}</Button>} />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
          {rows.map((p) => (
            <article
              key={p.id}
              className={cn(
                'card group relative flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft',
                p.featured && 'ring-1 ring-accent/60',
                p.status === 'archived' && 'opacity-70',
              )}
            >
              <div className="relative overflow-hidden bg-navy-grad px-5 pb-5 pt-4 text-white">
                <div className="absolute -end-10 -top-10 h-32 w-32 rounded-full bg-accent/20 blur-2xl" aria-hidden />
                <div className="relative flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={p.status} className="bg-white/90" />
                    {p.featured && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold-grad px-2 py-0.5 text-[11px] font-bold text-[#0B1F3A]">
                        <Sparkles className="h-3 w-3" /> {t('packages.featured')}
                      </span>
                    )}
                  </div>
                  <div className="-me-2 -mt-1 text-white [&_button]:text-white/80 [&_button:hover]:bg-white/10 [&_button:hover]:text-white">{actionsMenu(p)}</div>
                </div>
                <h3 className="relative mt-3 font-display text-lg font-bold leading-snug">{L(p, 'name')}</h3>
                <div className="relative mt-3 flex items-baseline gap-1.5">
                  <span className="kpi-num bg-gold-grad bg-clip-text text-3xl text-transparent">{fmtMoney(p.price, p.currency)}</span>
                </div>
                <p className="relative mt-1 text-[11px] text-white/60">{t(`packages.tax.${p.taxBehavior}`)}</p>
              </div>

              <div className="flex flex-1 flex-col gap-4 p-5">
                <p className="line-clamp-3 text-sm text-muted">{L(p, 'description')}</p>
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted rtl:tracking-normal">{t('packages.subjectsIncluded')}</div>
                  <SubjectChips ids={p.subjectIds} subjects={subjects} />
                </div>
                <dl className="space-y-2 text-sm">
                  {[
                    { icon: CalendarClock, label: t('packages.validity'), value: validityLabel(p, t) },
                    { icon: RefreshCcw, label: t('packages.renewal'), value: t(`packages.renewals.${p.renewal}`) },
                    {
                      icon: Receipt,
                      label: t('packages.accessStart'),
                      value: p.accessStart === 'immediate' ? t('packages.accessStarts.immediate') : t('packages.accessFrom', { date: fmtDate(p.accessStartDate) }),
                    },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-start gap-2">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <dt className="sr-only">{label}</dt>
                      <dd className="text-ink/80">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-auto flex items-center justify-between border-t border-line pt-4">
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <Users className="h-4 w-4 text-muted" />
                    <span className="font-semibold text-ink num">{fmtNumber(p.subscribers)}</span>
                    <span className="text-muted">{t('packages.subscribers')}</span>
                  </span>
                  {can('packages', 'edit') && (
                    <Button variant="secondary" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(p)}>
                      {t('actions.edit')}
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <PackageEditor open={drawer} onClose={() => setDrawer(false)} pkg={editing ? packages.find((p) => p.id === editing.id) : null} />
    </div>
  );
}
