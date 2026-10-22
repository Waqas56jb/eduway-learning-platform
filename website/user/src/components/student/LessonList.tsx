import { Check, Clock3, Lock, Play } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AccordionItem, ProgressBar, ProgressRing, SmartImage } from '@/components/ui';
import type { SubjectDetail } from '@/api/types';
import { useLang } from '@/hooks/useLang';
import { cn, formatClock, toMinutes } from '@/lib/utils';
import type { Lesson, LessonStatus } from '@/types';

const getLessonProgress = (l: Lesson) => ({ status: l.status, progress: l.progress });

interface LessonListProps {
  /** Subject detail (CAT-02): units/chapters + ordered lessons with the caller's progress and lock state. */
  subject: SubjectDetail;
  /** Subject not included in the student's package. */
  locked?: boolean;
  /** Restrict to these lessons (defaults to all of the subject's lessons). */
  lessons?: Lesson[];
  /** Highlights the lesson being watched. */
  currentLessonId?: string;
  /** Flat, dense list for the lesson page sidebar. */
  compact?: boolean;
  className?: string;
}

/** Curriculum list: Units (accordion) → Chapters → Lesson rows, or a flat compact list. */
export function LessonList({ subject, locked, lessons, currentLessonId, compact, className }: LessonListProps) {
  const items = lessons ?? subject.lessons;

  if (compact) {
    return (
      <ol className={cn('space-y-1.5', className)}>
        {items.map((lesson) => (
          <li key={lesson.id}>
            <LessonRow lesson={lesson} color={subject.color} locked={locked || lesson.locked} current={lesson.id === currentLessonId} compact />
          </li>
        ))}
      </ol>
    );
  }
  return <UnitAccordion subject={subject} lessons={items} locked={locked} currentLessonId={currentLessonId} className={className} />;
}

function UnitAccordion({
  subject,
  lessons,
  locked,
  currentLessonId,
  className,
}: {
  subject: SubjectDetail;
  lessons: Lesson[];
  locked?: boolean;
  currentLessonId?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { l, fmtNumber } = useLang();

  const [open, setOpen] = useState<Set<string>>(() => {
    const byStatus = (s: LessonStatus) => lessons.find((x) => getLessonProgress(x).status === s);
    const first = (currentLessonId && lessons.find((x) => x.id === currentLessonId)) || byStatus('in-progress') || byStatus('not-started');
    return new Set([first?.unitId ?? subject.units[0]?.id ?? '']);
  });

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={cn('space-y-4', className)}>
      {subject.units.map((unit, ui) => {
        const unitLessons = lessons.filter((x) => x.unitId === unit.id);
        if (!unitLessons.length) return null;
        const done = unitLessons.filter((x) => getLessonProgress(x).status === 'completed').length;
        const pct = Math.round((done / unitLessons.length) * 100);
        const totalMin = unitLessons.reduce((sum, x) => sum + toMinutes(x.duration), 0);
        return (
          <AccordionItem
            key={unit.id}
            open={open.has(unit.id)}
            onToggle={() => toggle(unit.id)}
            className="card"
            headerClassName="p-4 sm:p-5 transition-colors hover:bg-primary/[0.02]"
            title={
              <span className="flex items-center gap-3 sm:gap-4">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold num"
                  style={{ backgroundColor: `${subject.color}14`, color: subject.color }}
                >
                  {fmtNumber(ui + 1)}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-accent">
                    {t('learn.list.unit', { n: ui + 1 })}
                  </span>
                  <span className="mt-0.5 block truncate text-base font-bold text-primary sm:text-lg">{l(unit.title)}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {t('common.lessons', { count: unitLessons.length })} · {t('common.minutes', { count: totalMin })}
                  </span>
                </span>
              </span>
            }
            meta={
              <span className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
                <span className={cn('text-xs font-semibold num', done === unitLessons.length ? 'text-success' : 'text-muted')}>
                  {t('learn.list.unitDone', { done, total: unitLessons.length })}
                </span>
                <ProgressBar value={pct} color={subject.color} size="xs" className="w-28" label={l(unit.title)} />
              </span>
            }
          >
            <div className="border-t border-primary/5 px-3 pb-4 pt-2 sm:px-5">
              <p className="mb-2 px-1 text-xs font-semibold text-muted num sm:hidden">
                {t('learn.list.unitDone', { done, total: unitLessons.length })}
              </p>
              {unit.chapters.map((ch) => {
                const chLessons = unitLessons.filter((x) => x.chapterId === ch.id);
                if (!chLessons.length) return null;
                return (
                  <section key={ch.id} className="mt-3 first:mt-1">
                    <h4 className="mb-2 flex items-center gap-2 px-1 font-sans text-xs font-bold uppercase tracking-wider text-primary/60">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: subject.color }} aria-hidden />
                      {l(ch.title)}
                    </h4>
                    <ol className="space-y-1.5">
                      {chLessons.map((lesson) => (
                        <li key={lesson.id}>
                          <LessonRow lesson={lesson} color={subject.color} locked={locked || lesson.locked} current={lesson.id === currentLessonId} />
                        </li>
                      ))}
                    </ol>
                  </section>
                );
              })}
            </div>
          </AccordionItem>
        );
      })}
    </div>
  );
}

function StatusIcon({ status, progress, locked, color }: { status: LessonStatus; progress: number; locked?: boolean; color: string }) {
  const { t } = useTranslation();
  if (locked) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/5 text-muted" title={t('common.locked')}>
        <Lock className="h-4 w-4" aria-hidden />
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success text-white shadow-[0_6px_16px_-6px_rgba(5,150,105,0.7)]">
        <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (status === 'in-progress') {
    return (
      <ProgressRing value={progress} size={36} stroke={3.5} color={color}>
        <span className="text-[10px] font-bold text-primary num">{progress}</span>
      </ProgressRing>
    );
  }
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/5 text-primary transition-colors group-hover:bg-accent group-hover:text-primary">
      <Play className="h-4 w-4 fill-current ltr:translate-x-px" aria-hidden />
    </span>
  );
}

function LessonRow({
  lesson,
  color,
  locked,
  current,
  compact,
}: {
  lesson: Lesson;
  color: string;
  locked?: boolean;
  current?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { l, fmtNumber } = useLang();
  const prog = getLessonProgress(lesson);
  const statusLabel = locked
    ? t('common.locked')
    : prog.status === 'completed'
      ? t('common.completed')
      : prog.status === 'in-progress'
        ? t('learn.list.inProgressPct', { pct: prog.progress })
        : t('common.notStarted');

  const body = (
    <>
      <span className="hidden w-6 shrink-0 text-center text-xs font-bold text-muted num sm:block">
        {fmtNumber(lesson.order).padStart(2, '0')}
      </span>
      <span className="relative shrink-0">
        <SmartImage
          src={lesson.thumbnail}
          alt=""
          wrapperClassName={cn('aspect-video rounded-lg', compact ? 'w-20' : 'w-24 sm:w-28')}
          className={cn(!locked && 'group-hover:scale-105', locked && 'grayscale')}
        />
        <span className="absolute bottom-1 end-1 rounded bg-primary/80 px-1 py-px text-[10px] font-semibold text-white num" dir="ltr">
          {formatClock(lesson.duration)}
        </span>
        {current && (
          <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-primary/55">
            <span className="flex items-end gap-0.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1 animate-pulse rounded-full bg-accent" style={{ height: 6 + i * 4, animationDelay: `${i * 150}ms` }} />
              ))}
            </span>
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('line-clamp-2 text-sm font-semibold leading-snug', locked ? 'text-muted' : 'text-primary')}>
          {l(lesson.title)}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          {!compact && <span className="truncate">{l(lesson.teacher)}</span>}
          <span className="flex items-center gap-1 num">
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            {t('common.minutes', { count: toMinutes(lesson.duration) })}
          </span>
          {current && <span className="font-semibold text-accent">{t('learn.list.nowPlaying')}</span>}
        </span>
      </span>
      <span className="shrink-0">
        <StatusIcon status={prog.status} progress={prog.progress} locked={locked} color={color} />
      </span>
      <span className="sr-only">{statusLabel}</span>
    </>
  );

  const cls = cn(
    'group relative flex items-center gap-3 rounded-xl p-2 transition-all duration-200 sm:gap-4',
    current ? 'bg-accent/10 ring-1 ring-accent/40' : !locked && 'hover:bg-primary/[0.03]',
  );

  if (locked) {
    return (
      <div className={cn(cls, 'cursor-not-allowed')} aria-disabled="true">
        {body}
        <span
          aria-hidden
          className="pointer-events-none absolute end-14 top-1/2 z-20 max-w-[70%] -translate-y-1/2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-lift transition-opacity duration-200 group-hover:opacity-100"
        >
          {t('learn.list.lockedTip')}
        </span>
        <span className="sr-only">{t('learn.list.lockedTip')}</span>
      </div>
    );
  }

  return (
    <Link to={`/student/lesson/${lesson.id}`} className={cls} aria-current={current ? 'page' : undefined}>
      {body}
    </Link>
  );
}
