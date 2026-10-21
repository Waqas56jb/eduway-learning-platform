import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, Clock, Copy, FileStack, MoreHorizontal, Pencil, Plus, Trash2, UploadCloud, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { ExamBlueprint } from '@/types';
import { fmtDate, fmtNumber } from '@/utils/format';
import { uid } from '@/utils/id';
import { useBlueprints } from '@/store/assessments';
import { useSubjects } from '@/store/core';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, ButtonLink, DataTable, FilterSelect, MenuDivider, MenuItem, Popover, StatCard, StatusBadge, useConfirm } from '@/components/ui';

export const blueprintTotal = (b: Pick<ExamBlueprint, 'rows'>) => b.rows.reduce((s, r) => s + r.count, 0);

export default function ExamBlueprints() {
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const can = useCan();
  const confirm = useConfirm();
  const loading = useMockLoading();
  const items = useBlueprints((s) => s.items);
  const add = useBlueprints((s) => s.add);
  const update = useBlueprints((s) => s.update);
  const remove = useBlueprints((s) => s.remove);
  const subjects = useSubjects((s) => s.items);
  const [status, setStatus] = useState('');

  const data = useMemo(() => items.filter((b) => !status || b.status === status), [items, status]);

  const duplicate = (b: ExamBlueprint) => {
    const id = uid('bp');
    add(
      { ...b, id, name_en: `${b.name_en} (copy)`, name_ar: `${b.name_ar} (نسخة)`, status: 'draft', attempts: 0, rows: b.rows.map((r) => ({ ...r, id: uid('bpr') })), updatedAt: new Date().toISOString() },
      { action: 'exam_blueprint.duplicate', summary: `Duplicated blueprint “${b.name_en}”` },
    );
    toast.success(t('toast.created', { entity: t('assessments.blueprints.entity') }));
    navigate(`/assessments/blueprints/${id}`);
  };

  const setStatusOf = async (b: ExamBlueprint, to: ExamBlueprint['status']) => {
    const ok = await confirm({
      title: t(to === 'published' ? 'assessments.blueprints.publishTitle' : 'assessments.blueprints.archiveTitle', { name: L(b, 'name') }),
      body: t(to === 'published' ? 'assessments.blueprints.publishBody' : 'assessments.blueprints.archiveBody'),
      tone: to === 'published' ? 'primary' : 'warning',
      confirmText: to === 'published' ? t('actions.publish') : t('actions.archive'),
    });
    if (!ok) return;
    update(b.id, { status: to, updatedAt: new Date().toISOString() }, { action: `exam_blueprint.${to === 'published' ? 'publish' : 'archive'}` });
    toast.success(t('toast.updated', { entity: L(b, 'name') }));
  };

  const columns = useMemo<ColumnDef<ExamBlueprint, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (b) => L(b, 'name'),
        header: t('common.name'),
        meta: { label: t('common.name') },
        cell: ({ row }) => (
          <div className="min-w-[14rem]">
            <div className="font-semibold text-ink">{L(row.original, 'name')}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {[...new Set(row.original.rows.map((r) => r.subjectId))].map((sid) => {
                const s = subjects.find((x) => x.id === sid);
                return (
                  <span key={sid} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${s?.color}1A`, color: s?.color }}>
                    {L(s, 'name')}
                  </span>
                );
              })}
            </div>
          </div>
        ),
      },
      { id: 'questions', accessorFn: blueprintTotal, header: t('assessments.blueprints.questions'), meta: { label: t('assessments.blueprints.questions'), align: 'end' } },
      { id: 'duration', accessorKey: 'durationMin', header: t('assessments.blueprints.duration'), meta: { label: t('assessments.blueprints.duration'), align: 'end' }, cell: ({ row }) => `${row.original.durationMin} ${t('common.minutes')}` },
      { id: 'scoring', accessorKey: 'scoring', header: t('assessments.blueprints.scoring'), meta: { label: t('assessments.blueprints.scoring') }, cell: ({ row }) => <span className="text-xs">{t(`assessments.scoring.${row.original.scoring}`)}</span> },
      { id: 'limit', accessorKey: 'attemptLimit', header: t('assessments.blueprints.attemptLimit'), meta: { label: t('assessments.blueprints.attemptLimit'), align: 'end' } },
      {
        id: 'window',
        accessorKey: 'availableFrom',
        header: t('assessments.blueprints.window'),
        meta: { label: t('assessments.blueprints.window') },
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted">
            {fmtDate(row.original.availableFrom, 'd MMM')} – {fmtDate(row.original.availableTo, 'd MMM yyyy')}
          </span>
        ),
      },
      { id: 'status', accessorKey: 'status', header: t('common.status'), meta: { label: t('common.status') }, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: 'attempts', accessorKey: 'attempts', header: t('nav.attempts'), meta: { label: t('nav.attempts'), align: 'end' }, cell: ({ row }) => fmtNumber(row.original.attempts) },
      { id: 'updated', accessorKey: 'updatedAt', header: t('common.updated'), meta: { label: t('common.updated') }, cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted">{fmtDate(row.original.updatedAt)}</span> },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row }) => {
          const b = row.original;
          return (
            <span onClick={(e) => e.stopPropagation()} className="inline-flex">
              <Popover
                trigger={({ toggle, open }) => (
                  <Button variant="ghost" size="icon-sm" onClick={toggle} aria-expanded={open} aria-label={t('actions.more')}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                )}
              >
                {(close) => (
                  <div role="menu">
                    <MenuItem icon={<Pencil />} onClick={() => { close(); navigate(`/assessments/blueprints/${b.id}`); }}>
                      {can('assessments', 'edit') ? t('actions.edit') : t('actions.view')}
                    </MenuItem>
                    {can('assessments', 'create') && (
                      <MenuItem icon={<Copy />} onClick={() => { close(); duplicate(b); }}>
                        {t('actions.duplicate')}
                      </MenuItem>
                    )}
                    {can('assessments', 'approve') && b.status !== 'published' && (
                      <MenuItem icon={<UploadCloud />} onClick={() => { close(); setStatusOf(b, 'published'); }}>
                        {t('actions.publish')}
                      </MenuItem>
                    )}
                    {can('assessments', 'edit') && b.status !== 'archived' && (
                      <MenuItem icon={<Archive />} onClick={() => { close(); setStatusOf(b, 'archived'); }}>
                        {t('actions.archive')}
                      </MenuItem>
                    )}
                    {can('assessments', 'delete') && (
                      <>
                        <MenuDivider />
                        <MenuItem
                          danger
                          icon={<Trash2 />}
                          disabled={b.attempts > 0}
                          hint={b.attempts > 0 ? t('assessments.blueprints.hasAttempts') : undefined}
                          onClick={async () => {
                            close();
                            const ok = await confirm({ title: t('confirm.deleteTitle', { entity: L(b, 'name') }), body: t('confirm.deleteBody'), confirmText: t('actions.delete') });
                            if (!ok) return;
                            remove(b.id);
                            toast.success(t('toast.deleted', { entity: L(b, 'name') }));
                          }}
                        >
                          {t('actions.delete')}
                        </MenuItem>
                      </>
                    )}
                  </div>
                )}
              </Popover>
            </span>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, subjects, can],
  );

  const published = items.filter((b) => b.status === 'published');
  const avgDuration = items.length ? Math.round(items.reduce((s, b) => s + b.durationMin, 0) / items.length) : 0;

  return (
    <>
      <PageHeader
        title={t('assessments.blueprints.title')}
        subtitle={t('assessments.blueprints.subtitle')}
        actions={
          can('assessments', 'create') && (
            <ButtonLink to="/assessments/blueprints/new" icon={<Plus className="h-4 w-4" />}>
              {t('assessments.blueprints.new')}
            </ButtonLink>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('assessments.blueprints.statTotal')} value={fmtNumber(items.length)} icon={<FileStack />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('assessments.blueprints.statPublished')} value={fmtNumber(published.length)} icon={<UploadCloud />} color="#16A34A" />
        <StatCard loading={loading} label={t('assessments.blueprints.statAttempts')} value={fmtNumber(items.reduce((s, b) => s + b.attempts, 0))} icon={<Users />} color="#2563EB" />
        <StatCard loading={loading} label={t('assessments.blueprints.statDuration')} value={`${avgDuration} ${t('common.minutes')}`} icon={<Clock />} color="#C9A24A" />
      </div>
      <DataTable
        data={data}
        columns={columns}
        loading={loading}
        onRowClick={(b) => navigate(`/assessments/blueprints/${b.id}`)}
        exportName={can('assessments', 'export') ? 'exam-blueprints' : undefined}
        searchText={(b) => `${b.name_en} ${b.name_ar}`}
        toolbar={<FilterSelect label={t('common.status')} value={status} onChange={setStatus} options={(['draft', 'published', 'archived'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />}
        emptyAction={
          can('assessments', 'create') && (
            <ButtonLink to="/assessments/blueprints/new" size="sm" icon={<Plus className="h-4 w-4" />}>
              {t('assessments.blueprints.new')}
            </ButtonLink>
          )
        }
      />
    </>
  );
}
