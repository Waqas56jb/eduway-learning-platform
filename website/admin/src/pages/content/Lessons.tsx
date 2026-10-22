import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, Plus, Send, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { fmtDate, fmtDuration, fmtNumber } from '@/utils/format';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Button, ButtonLink, DataTable, FilterSelect, Img, StatusBadge, useConfirm } from '@/components/ui';
import { exportRequest, useApiMutation, useExport, usePagedList } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useLookups } from '@/api/lookups';
import { lessonsApi, useTeachersQuery, type LessonVM } from '@/api/content';
import type { BulkResult } from '@/api/types';
import { CONTENT_STATUSES } from './shared';

export default function Lessons() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const lookups = useLookups();
  const subjects = lookups.subjects;
  const units = lookups.units;
  const teachersQ = useTeachersQuery();
  const teachers = useMemo(() => teachersQ.data ?? [], [teachersQ.data]);

  const [subject, setSubject] = useState((location.state as { subjectId?: string } | null)?.subjectId ?? '');
  const [unit, setUnit] = useState('');
  const [status, setStatus] = useState('');
  const [teacher, setTeacher] = useState('');

  const byId = useMemo(
    () => ({
      subject: new Map(subjects.map((s) => [s.id, s])),
      teacher: new Map(teachers.map((x) => [x.id, x])),
    }),
    [subjects, teachers],
  );

  const list = usePagedList<LessonVM>({
    key: qk.lessons.list,
    fetcher: lessonsApi.list,
    filters: { subjectId: subject, unitId: unit, status, teacherId: teacher },
  });
  const data = list.items;

  const columns = useMemo<ColumnDef<LessonVM>[]>(
    () => [
      {
        id: 'title',
        header: t('common.lesson'),
        meta: { label: t('common.lesson'), exportValue: (l) => l.title_en },
        accessorFn: (l) => L(l, 'title'),
        cell: ({ row }) => {
          const l = row.original;
          const s = l.subject ?? byId.subject.get(l.subjectId);
          return (
            <div className="flex min-w-[260px] items-center gap-3">
              <div className="relative h-11 w-[4.5rem] shrink-0 overflow-hidden rounded-md">
                <Img src={l.thumbnail} alt="" className="h-full w-full" />
                <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: s?.color }} />
                <span className="absolute bottom-1 end-1 rounded bg-black/65 px-1 text-[9px] font-semibold text-white num">{fmtDuration(l.durationSec)}</span>
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{L(l, 'title')}</div>
                <div className="truncate text-xs text-muted">{l.topic ? L({ name_en: l.topic.name.en, name_ar: l.topic.name.ar }, 'name') : '—'}</div>
              </div>
            </div>
          );
        },
      },
      {
        id: 'subject',
        header: t('common.subject'),
        meta: { label: t('common.subject') },
        accessorFn: (l) => L(byId.subject.get(l.subjectId), 'name'),
        cell: ({ row }) => {
          const s = byId.subject.get(row.original.subjectId) ?? (row.original.subject ? { ...row.original.subject, name_en: row.original.subject.name.en, name_ar: row.original.subject.name.ar } : undefined);
          return (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium">
              <span className="h-2 w-2 rounded-full" style={{ background: s?.color }} />
              {L(s, 'name')}
            </span>
          );
        },
      },
      {
        id: 'unit',
        header: t('common.unit'),
        meta: { label: t('common.unit') },
        enableSorting: false,
        accessorFn: (l) => (l.unit ? L({ name_en: l.unit.name.en, name_ar: l.unit.name.ar }, 'name') : '—'),
        cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-ink/80">{String(getValue())}</span>,
      },
      {
        id: 'topic',
        header: t('common.topic'),
        meta: { label: t('common.topic') },
        enableSorting: false,
        accessorFn: (l) => (l.topic ? L({ name_en: l.topic.name.en, name_ar: l.topic.name.ar }, 'name') : '—'),
        cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-ink/80">{String(getValue())}</span>,
      },
      {
        id: 'teacher',
        header: t('common.teacher'),
        meta: { label: t('common.teacher') },
        enableSorting: false,
        accessorFn: (l) => L(byId.teacher.get(l.teacherId), 'name'),
        cell: ({ row }) => {
          const tr = row.original.teacher;
          const tc = byId.teacher.get(row.original.teacherId) ?? (tr ? { id: tr.id, name_en: tr.name.en, name_ar: tr.name.ar, avatar: tr.avatarUrl ?? '', subjectId: '' } : undefined);
          return tc ? (
            <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs">
              <Avatar name={tc.name_en} src={tc.avatar} size="xs" />
              {L(tc, 'name')}
            </span>
          ) : (
            '—'
          );
        },
      },
      {
        id: 'durationSec',
        header: t('content.lessons.duration'),
        meta: { label: t('content.lessons.duration'), align: 'end', exportValue: (l) => fmtDuration(l.durationSec) },
        accessorKey: 'durationSec',
        cell: ({ row }) => fmtDuration(row.original.durationSec),
      },
      {
        id: 'views',
        header: t('content.lessons.views'),
        meta: { label: t('content.lessons.views'), align: 'end' },
        accessorKey: 'views',
        cell: ({ row }) => fmtNumber(row.original.views),
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: { label: t('common.status') },
        accessorKey: 'status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'publishAt',
        header: t('content.lessons.publishDate'),
        meta: { label: t('content.lessons.publishDate') },
        accessorFn: (l) => l.publishAt ?? '',
        cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted num">{fmtDate(row.original.publishAt)}</span>,
      },
    ],
    [t, L, byId],
  );

  const partial = (r: BulkResult) => {
    if (r.failed.length) toast.error(t('api.bulkPartial', { count: r.failed.length }));
  };
  const bulkMut = useApiMutation((v: { ids: string[]; to: 'in_review' | 'archived' }) => lessonsApi.bulkTransition(v.ids, v.to), {
    invalidate: [qk.lessons.all, qk.dashboard.all],
    onSuccess: (r, v) => {
      toast.success(t(v.to === 'archived' ? 'content.lessons.bulkArchived' : 'content.lessons.bulkSubmitted', { count: r.succeeded.length }));
      partial(r);
    },
  });
  const deleteMut = useApiMutation((ids: string[]) => lessonsApi.bulkDelete(ids), {
    invalidate: [qk.lessons.all, qk.subjects.all, qk.units.all, qk.lookups],
    onSuccess: (r) => {
      toast.success(t('content.lessons.bulkDeleted', { count: r.succeeded.length }));
      partial(r);
    },
  });
  const exp = useExport('/admin/lessons/export', 'lessons');
  const bulkStatus = async (rows: LessonVM[], to: 'in_review' | 'archived', clear: () => void) => {
    await bulkMut.mutateAsync({ ids: rows.map((r) => r.id), to }).catch(() => undefined);
    clear();
  };

  const canBulk = can('content', 'edit') || can('content', 'approve') || can('content', 'delete');

  return (
    <div>
      <PageHeader
        title={t('content.lessons.title')}
        subtitle={t('content.lessons.subtitle')}
        actions={
          can('content', 'create') && (
            <ButtonLink to="/content/lessons/new" icon={<Plus className="h-4 w-4" />}>
              {t('content.lessons.new')}
            </ButtonLink>
          )
        }
      />
      <DataTable
        data={data}
        columns={columns}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        server={list.server}
        onExport={can('content', 'export') ? (ids) => exp.mutate(exportRequest('csv', list.exportFilters, ids)) : undefined}
        exporting={exp.isPending}
        onRowClick={(l) => navigate(`/content/lessons/${l.id}`)}
        initialHidden={['topic', 'views']}
        toolbar={
          <>
            <FilterSelect
              label={t('common.subject')}
              value={subject}
              onChange={(v) => {
                setSubject(v);
                setUnit('');
              }}
              options={subjects.map((s) => ({ value: s.id, label: L(s, 'name') }))}
            />
            <FilterSelect
              label={t('common.unit')}
              value={unit}
              onChange={setUnit}
              options={units.filter((u) => !subject || u.subjectId === subject).map((u) => ({ value: u.id, label: L(u, 'name') }))}
              className="max-w-[14rem]"
            />
            <FilterSelect label={t('common.status')} value={status} onChange={setStatus} options={CONTENT_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} />
            <FilterSelect label={t('common.teacher')} value={teacher} onChange={setTeacher} options={teachers.map((x) => ({ value: x.id, label: L(x, 'name') }))} />
          </>
        }
        bulkActions={
          canBulk
            ? (rows, clear) => (
                <>
                  {can('content', 'edit') && (
                    <Button size="sm" variant="secondary" icon={<Send className="h-3.5 w-3.5" />} onClick={() => bulkStatus(rows, 'in_review', clear)}>
                      {t('content.lessons.bulkSubmit')}
                    </Button>
                  )}
                  {can('content', 'approve') && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Archive className="h-3.5 w-3.5" />}
                      onClick={async () => {
                        const ok = await confirm({ title: t('content.editor.archiveTitle'), body: t('content.editor.archiveBody'), tone: 'warning', confirmText: t('actions.archive') });
                        if (ok) bulkStatus(rows, 'archived', clear);
                      }}
                    >
                      {t('content.lessons.bulkArchive')}
                    </Button>
                  )}
                  {can('content', 'delete') && (
                    <Button
                      size="sm"
                      variant="danger"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={async () => {
                        const ok = await confirm({ title: t('content.lessons.deleteManyTitle', { count: rows.length }), body: t('confirm.deleteBody'), confirmText: t('actions.delete') });
                        if (!ok) return;
                        await deleteMut.mutateAsync(rows.map((r) => r.id)).catch(() => undefined);
                        clear();
                      }}
                    >
                      {t('content.lessons.bulkDelete')}
                    </Button>
                  )}
                </>
              )
            : undefined
        }
      />
    </div>
  );
}
