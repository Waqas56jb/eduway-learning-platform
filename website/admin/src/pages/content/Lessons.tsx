import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, Plus, Send, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Lesson } from '@/types';
import { teachers } from '@/data/curriculum';
import { fmtDate, fmtDuration, fmtNumber } from '@/utils/format';
import { useLessons, useSubjects, useTopics, useUnits } from '@/store/core';
import { useCan, useCurrentAdmin } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Button, ButtonLink, DataTable, FilterSelect, Img, StatusBadge, useConfirm } from '@/components/ui';
import { CONTENT_STATUSES, nextVersion } from './shared';

export default function Lessons() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const admin = useCurrentAdmin();
  const loading = useMockLoading();
  const lessons = useLessons((s) => s.items);
  const subjects = useSubjects((s) => s.items);
  const units = useUnits((s) => s.items);
  const topics = useTopics((s) => s.items);

  const [subject, setSubject] = useState((location.state as { subjectId?: string } | null)?.subjectId ?? '');
  const [unit, setUnit] = useState('');
  const [status, setStatus] = useState('');
  const [teacher, setTeacher] = useState('');

  const byId = useMemo(
    () => ({
      subject: new Map(subjects.map((s) => [s.id, s])),
      unit: new Map(units.map((u) => [u.id, u])),
      topic: new Map(topics.map((x) => [x.id, x])),
      teacher: new Map(teachers.map((x) => [x.id, x])),
    }),
    [subjects, units, topics],
  );

  const data = useMemo(
    () =>
      lessons
        .filter((l) => (!subject || l.subjectId === subject) && (!unit || l.unitId === unit) && (!status || l.status === status) && (!teacher || l.teacherId === teacher))
        .sort((a, b) => (a.subjectId === b.subjectId ? a.order - b.order : (byId.subject.get(a.subjectId)?.order ?? 0) - (byId.subject.get(b.subjectId)?.order ?? 0))),
    [lessons, subject, unit, status, teacher, byId],
  );

  const columns = useMemo<ColumnDef<Lesson>[]>(
    () => [
      {
        id: 'title',
        header: t('common.lesson'),
        meta: { label: t('common.lesson'), exportValue: (l) => l.title_en },
        accessorFn: (l) => L(l, 'title'),
        cell: ({ row }) => {
          const l = row.original;
          const s = byId.subject.get(l.subjectId);
          return (
            <div className="flex min-w-[260px] items-center gap-3">
              <div className="relative h-11 w-[4.5rem] shrink-0 overflow-hidden rounded-md">
                <Img src={l.thumbnail} alt="" className="h-full w-full" />
                <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: s?.color }} />
                <span className="absolute bottom-1 end-1 rounded bg-black/65 px-1 text-[9px] font-semibold text-white num">{fmtDuration(l.durationSec)}</span>
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{L(l, 'title')}</div>
                <div className="truncate text-xs text-muted">{L(byId.topic.get(l.topicId), 'name')}</div>
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
          const s = byId.subject.get(row.original.subjectId);
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
        accessorFn: (l) => L(byId.unit.get(l.unitId), 'name'),
        cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-ink/80">{String(getValue())}</span>,
      },
      {
        id: 'topic',
        header: t('common.topic'),
        meta: { label: t('common.topic') },
        accessorFn: (l) => L(byId.topic.get(l.topicId), 'name'),
        cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-ink/80">{String(getValue())}</span>,
      },
      {
        id: 'teacher',
        header: t('common.teacher'),
        meta: { label: t('common.teacher') },
        accessorFn: (l) => L(byId.teacher.get(l.teacherId), 'name'),
        cell: ({ row }) => {
          const tc = byId.teacher.get(row.original.teacherId);
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
        id: 'duration',
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

  const bulkStatus = (rows: Lesson[], to: 'in_review' | 'archived', clear: () => void) => {
    const author = admin?.name ?? 'System';
    const ids = rows.map((r) => r.id);
    useLessons.getState().updateMany(
      ids,
      (l) => ({ status: to, updatedAt: new Date().toISOString(), versions: nextVersion(l, to, t(`content.editor.versionNote.${to}`, { lng: 'en' }), author) }),
      { action: to === 'archived' ? 'lesson.bulk_archive' : 'lesson.bulk_submit', summary: `${to === 'archived' ? 'Archived' : 'Submitted for review'} ${ids.length} lessons` },
    );
    toast.success(t(to === 'archived' ? 'content.lessons.bulkArchived' : 'content.lessons.bulkSubmitted', { count: ids.length }));
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
        loading={loading}
        exportName={can('content', 'export') ? 'lessons' : undefined}
        onRowClick={(l) => navigate(`/content/lessons/${l.id}`)}
        searchText={(l) => `${l.title_en} ${l.title_ar} ${l.id}`}
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
                        useLessons.getState().removeMany(rows.map((r) => r.id), { action: 'lesson.bulk_delete', summary: `Deleted ${rows.length} lessons` });
                        toast.success(t('content.lessons.bulkDeleted', { count: rows.length }));
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
