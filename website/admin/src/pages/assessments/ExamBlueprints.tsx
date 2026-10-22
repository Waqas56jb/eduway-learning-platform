import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, Clock, Copy, FileStack, MoreHorizontal, Pencil, Plus, Trash2, UploadCloud, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { fmtDate, fmtNumber } from '@/utils/format';
import { useCan } from '@/store/auth';
import { useLang, useLocalize } from '@/hooks/useLocale';
import { errorMessage, isApiError } from '@/api/client';
import { exportRequest, useApiQuery, useExport, usePagedList } from '@/api/hooks';
import { qk } from '@/api/keys';
import { blueprintsApi, type BlueprintVM } from '@/api/assessments';

type ExamBlueprint = BlueprintVM;
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, ButtonLink, DataTable, FilterSelect, MenuDivider, MenuItem, Popover, StatCard, StatusBadge, useConfirm } from '@/components/ui';

export const blueprintTotal = (b: Pick<ExamBlueprint, 'rows'>) => b.rows.reduce((s, r) => s + r.count, 0);

export default function ExamBlueprints() {
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const can = useCan();
  const confirm = useConfirm();
  const lang = useLang();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const list = usePagedList<ExamBlueprint>({ key: qk.blueprints.list, fetcher: blueprintsApi.list, filters: { status }, initialSort: '-updatedAt' });
  const data = list.items;
  const statsQ = useApiQuery(qk.blueprints.sub('stats'), blueprintsApi.stats);
  const loading = statsQ.isLoading;
  const exp = useExport('/admin/exam-blueprints/export', 'exam-blueprints');
  const refresh = () => qc.invalidateQueries({ queryKey: qk.blueprints.all });

  const duplicate = async (b: ExamBlueprint) => {
    try {
      const copy = await blueprintsApi.duplicate(b.id);
      await refresh();
      toast.success(t('toast.created', { entity: t('assessments.blueprints.entity') }));
      navigate(`/assessments/blueprints/${copy.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const setStatusOf = async (b: ExamBlueprint, to: ExamBlueprint['status']) => {
    const ok = await confirm({
      title: t(to === 'published' ? 'assessments.blueprints.publishTitle' : 'assessments.blueprints.archiveTitle', { name: L(b, 'name') }),
      body: t(to === 'published' ? 'assessments.blueprints.publishBody' : 'assessments.blueprints.archiveBody'),
      tone: to === 'published' ? 'primary' : 'warning',
      confirmText: to === 'published' ? t('actions.publish') : t('actions.archive'),
    });
    if (!ok) return;
    try {
      if (to === 'published') {
        try {
          await blueprintsApi.publish(b.id);
        } catch (e) {
          if (!(isApiError(e) && e.reason === 'POOL_SHORT')) throw e;
          const sr = e.details.shortRows;
          const force = await confirm({ title: t('assessments.editor.shortTitle'), body: t('assessments.editor.shortBody', { count: Array.isArray(sr) ? sr.length : Number(sr ?? 1) }), tone: 'warning', confirmText: t('actions.publish') });
          if (!force) return;
          await blueprintsApi.publish(b.id, true);
        }
      } else await blueprintsApi.archive(b.id);
      await refresh();
      toast.success(t('toast.updated', { entity: L(b, 'name') }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
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
              {row.original.subjects.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${s.color}1A`, color: s.color }}>
                  {s.name[lang]}
                </span>
              ))}
            </div>
          </div>
        ),
      },
      { id: 'questionCount', accessorFn: (b) => b.questionCount, header: t('assessments.blueprints.questions'), meta: { label: t('assessments.blueprints.questions'), align: 'end' } },
      { id: 'durationMin', accessorKey: 'durationMin', header: t('assessments.blueprints.duration'), meta: { label: t('assessments.blueprints.duration'), align: 'end' }, cell: ({ row }) => `${row.original.durationMin} ${t('common.minutes')}` },
      { id: 'scoring', accessorKey: 'scoring', enableSorting: false, header: t('assessments.blueprints.scoring'), meta: { label: t('assessments.blueprints.scoring') }, cell: ({ row }) => <span className="text-xs">{t(`assessments.scoring.${row.original.scoring}`)}</span> },
      { id: 'attemptLimit', accessorKey: 'attemptLimit', header: t('assessments.blueprints.attemptLimit'), meta: { label: t('assessments.blueprints.attemptLimit'), align: 'end' } },
      {
        id: 'availableFrom',
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
      { id: 'updatedAt', accessorKey: 'updatedAt', header: t('common.updated'), meta: { label: t('common.updated') }, cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted">{fmtDate(row.original.updatedAt)}</span> },
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
                            try {
                              await blueprintsApi.remove(b.id);
                              await refresh();
                              toast.success(t('toast.deleted', { entity: L(b, 'name') }));
                            } catch (e) {
                              toast.error(isApiError(e) && e.reason === 'HAS_DEPENDENTS' ? t('assessments.blueprints.hasAttempts') : errorMessage(e));
                            }
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
    [t, L, lang, can],
  );

  const st = statsQ.data;

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
        <StatCard loading={loading} label={t('assessments.blueprints.statTotal')} value={fmtNumber(st?.total ?? 0)} icon={<FileStack />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('assessments.blueprints.statPublished')} value={fmtNumber(st?.published ?? 0)} icon={<UploadCloud />} color="#16A34A" />
        <StatCard loading={loading} label={t('assessments.blueprints.statAttempts')} value={fmtNumber(st?.totalAttempts ?? 0)} icon={<Users />} color="#2563EB" />
        <StatCard loading={loading} label={t('assessments.blueprints.statDuration')} value={`${Math.round(st?.avgDurationMin ?? 0)} ${t('common.minutes')}`} icon={<Clock />} color="#C9A24A" />
      </div>
      <DataTable
        data={data}
        columns={columns}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        server={list.server}
        onRowClick={(b) => navigate(`/assessments/blueprints/${b.id}`)}
        onExport={can('assessments', 'export') ? (ids) => exp.mutate(exportRequest('csv', list.exportFilters, ids)) : undefined}
        exporting={exp.isPending}
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
