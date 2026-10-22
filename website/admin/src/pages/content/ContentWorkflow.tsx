import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Clock, Lock, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import type { ContentStatus, Teacher } from '@/types';
import { cn } from '@/utils/cn';
import { fmtDate, fmtDuration, fmtRelative } from '@/utils/format';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useDebounce } from '@/hooks/useMisc';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Button, EmptyState, FilterSelect, Skeleton } from '@/components/ui';
import { errorMessage, toastError } from '@/api/client';
import { useApiQuery } from '@/api/hooks';
import { qk } from '@/api/keys';
import { lessonsApi, toTeacherVM, useSubjectsQuery, type LessonVM, type SubjectVM } from '@/api/content';
import { APPROVAL_STATUSES, CONTENT_STATUSES, STATUS_COLOR, ScheduleModal, useLessonStatus } from './shared';

type Lesson = LessonVM;

interface CardCtx {
  subject?: SubjectVM;
  teacher?: Teacher;
  unitName: string;
}

function LessonCard({ lesson, ctx, overlay, locked }: { lesson: Lesson; ctx: CardCtx; overlay?: boolean; locked?: boolean }) {
  const { t } = useTranslation();
  const L = useLocalize();
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-line bg-surface p-3 ps-4 text-start shadow-card transition-shadow',
        overlay ? 'rotate-[1.5deg] cursor-grabbing shadow-lift ring-2 ring-accent/50' : 'hover:shadow-soft',
      )}
    >
      <span className="absolute inset-y-0 start-0 w-1" style={{ background: ctx.subject?.color }} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide rtl:tracking-normal" style={{ color: ctx.subject?.color }}>
          {L(ctx.subject, 'name')}
        </span>
        {locked && <Lock className="h-3 w-3 shrink-0 text-muted" aria-hidden />}
      </div>
      <Link to={`/content/lessons/${lesson.id}`} className="mt-1 block text-sm font-medium leading-snug text-ink hover:text-accent" draggable={false}>
        {L(lesson, 'title')}
      </Link>
      <p className="mt-0.5 truncate text-xs text-muted">{ctx.unitName}</p>
      <div className="mt-3 flex items-center gap-2">
        {ctx.teacher && <Avatar name={ctx.teacher.name_en} src={ctx.teacher.avatar} size="xs" />}
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{t('content.workflow.updated', { time: fmtRelative(lesson.updatedAt) })}</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted num">
          <Clock className="h-3 w-3" />
          {fmtDuration(lesson.durationSec)}
        </span>
      </div>
      {lesson.status === 'scheduled' && lesson.publishAt && (
        <div className="mt-2 rounded-md bg-[#7C3AED]/10 px-2 py-1 text-[11px] font-medium text-[#7C3AED] dark:text-[#A78BFA]">{fmtDate(lesson.publishAt, 'd MMM yyyy, HH:mm')}</div>
      )}
    </div>
  );
}

function DraggableCard({ lesson, ctx, locked }: { lesson: Lesson; ctx: CardCtx; locked: boolean }) {
  const L = useLocalize();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lesson.id, data: { status: lesson.status } });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      aria-roledescription="draggable lesson"
      aria-label={L(lesson, 'title')}
      className={cn('group relative cursor-grab touch-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', isDragging && 'opacity-30')}
    >
      <LessonCard lesson={lesson} ctx={ctx} locked={locked} />
    </div>
  );
}

function Column({ status, count, children, state }: { status: ContentStatus; count: number; children: ReactNode; state: 'idle' | 'ok' | 'blocked' }) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={t(`status.${status}`)}
      className={cn(
        'flex min-h-[60vh] flex-col rounded-xl border bg-surface-2/70 transition-colors duration-150',
        isOver && state === 'ok' ? 'border-accent bg-accent/[0.06]' : isOver && state === 'blocked' ? 'border-danger/50 bg-danger/[0.04]' : 'border-line',
      )}
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink rtl:tracking-normal">{t(`status.${status}`)}</h2>
        {APPROVAL_STATUSES.has(status) && <Lock className="h-3 w-3 text-muted" aria-hidden />}
        <span className="ms-auto rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-line num">{count}</span>
      </header>
      <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: '70vh' }}>
        {children}
        {count === 0 && <div className="grid h-24 place-items-center rounded-lg border-2 border-dashed border-line text-xs text-muted">{t('content.workflow.empty')}</div>}
      </div>
    </section>
  );
}

export default function ContentWorkflow() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const qc = useQueryClient();
  const subjectsQ = useSubjectsQuery();
  const subjects = useMemo(() => subjectsQ.data ?? [], [subjectsQ.data]);
  const { move } = useLessonStatus();
  const [subject, setSubject] = useState('');
  const [query, setQuery] = useState('');
  const q = useDebounce(query.trim(), 300);
  const boardKey = qk.lessons.list({ view: 'board', subjectId: subject, q });
  const board = useApiQuery(boardKey, () => lessonsApi.list({ view: 'board', pageSize: 1000, subjectId: subject, q, sort: '-updatedAt' }), {
    placeholderData: (prev) => prev,
  });
  const lessons = useMemo(() => board.data?.items ?? [], [board.data]);
  const loading = board.isLoading;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingSchedule, setPendingSchedule] = useState<Lesson | null>(null);

  const canApprove = can('content', 'approve');
  const canMoveAny = canApprove || can('content', 'edit');

  const maps = useMemo(() => ({ subject: new Map(subjects.map((s) => [s.id, s])) }), [subjects]);

  const filtered = useMemo(() => [...lessons].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [lessons]);

  const ctxFor = (l: Lesson): CardCtx => ({
    subject: maps.subject.get(l.subjectId),
    teacher: l.teacher ? toTeacherVM(l.teacher) : undefined,
    unitName: l.unit ? L({ name_en: l.unit.name.en, name_ar: l.unit.name.ar }, 'name') : '',
  });

  /** Optimistic move on the board; the server confirms (or rejects) the transition. */
  const transition = async (lesson: Lesson, to: ContentStatus, publishAt?: string) => {
    const prev = qc.getQueryData(boardKey);
    qc.setQueryData(boardKey, (old: typeof board.data) =>
      old ? { ...old, items: old.items.map((x) => (x.id === lesson.id ? { ...x, status: to, publishAt: publishAt ?? x.publishAt, updatedAt: new Date().toISOString() } : x)) } : old,
    );
    try {
      await move(lesson, to, publishAt);
      toast.success(t('content.workflow.moved', { title: L(lesson, 'title'), status: t(`status.${to}`) }));
    } catch (e) {
      qc.setQueryData(boardKey, prev);
      toastError(e);
    }
  };

  /** Supervisor permission is required to move into or out of approval stages. */
  const permitted = (from: ContentStatus, to: ContentStatus) =>
    canMoveAny && (canApprove || (!APPROVAL_STATUSES.has(to) && !APPROVAL_STATUSES.has(from)));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const active = activeId ? lessons.find((l) => l.id === activeId) : undefined;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const lesson = lessons.find((l) => l.id === e.active.id);
    const to = e.over?.id as ContentStatus | undefined;
    if (!lesson || !to || lesson.status === to) return;
    if (!permitted(lesson.status, to)) {
      toast.error(t('content.workflow.noPermission', { status: t(`status.${APPROVAL_STATUSES.has(to) ? to : lesson.status}`) }));
      return;
    }
    if (to === 'scheduled') {
      setPendingSchedule(lesson);
      return;
    }
    transition(lesson, to);
  };

  return (
    <div>
      <PageHeader title={t('content.workflow.title')} subtitle={t('content.workflow.subtitle')} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('table.search')} aria-label={t('actions.search')} className="field h-9 ps-9" />
        </div>
        <FilterSelect label={t('content.workflow.filterSubject')} value={subject} onChange={setSubject} options={subjects.map((s) => ({ value: s.id, label: L(s, 'name') }))} />
      </div>

      {loading ? (
        <div className="grid auto-cols-[minmax(250px,1fr)] grid-flow-col gap-3 overflow-hidden">
          {CONTENT_STATUSES.map((s) => (
            <Skeleton key={s} className="h-[60vh] rounded-xl" />
          ))}
        </div>
      ) : board.isError ? (
        <div className="card">
          <EmptyState title={t('api.loadFailed')} hint={errorMessage(board.error)} action={<Button variant="secondary" onClick={() => board.refetch()}>{t('api.retry')}</Button>} />
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
          <div className="scrollbar-thin grid auto-cols-[minmax(250px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-3">
            {CONTENT_STATUSES.map((status) => {
              const items = filtered.filter((l) => l.status === status);
              const state = !active ? 'idle' : permitted(active.status, status) ? 'ok' : 'blocked';
              return (
                <Column key={status} status={status} count={items.length} state={state}>
                  {items.map((l) => (
                    <DraggableCard key={l.id} lesson={l} ctx={ctxFor(l)} locked={!canMoveAny || (!canApprove && APPROVAL_STATUSES.has(l.status))} />
                  ))}
                </Column>
              );
            })}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>{active ? <LessonCard lesson={active} ctx={ctxFor(active)} overlay /> : null}</DragOverlay>
        </DndContext>
      )}

      <ScheduleModal
        open={!!pendingSchedule}
        title={pendingSchedule ? t('content.workflow.scheduleTitle', { title: L(pendingSchedule, 'title') }) : ''}
        initial={pendingSchedule?.publishAt}
        onClose={() => setPendingSchedule(null)}
        onConfirm={(iso) => {
          if (pendingSchedule) transition(pendingSchedule, 'scheduled', iso);
          setPendingSchedule(null);
        }}
      />
    </div>
  );
}
