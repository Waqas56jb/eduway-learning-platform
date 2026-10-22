import { ArrowLeft, BookOpen, ClipboardList, Clock3, Crown, FileQuestion, Lock, PlayCircle, SearchX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { LessonList } from '@/components/student/LessonList';
import { teacherAvatar } from '@/components/student/lesson/access';
import { ExamsPanel, QuestionBankPanel } from '@/components/student/lesson/SubjectPanels';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  ProgressRing,
  Seo,
  Skeleton,
  SkeletonList,
  SmartImage,
  SubjectIcon,
  Tabs,
} from '@/components/ui';
import { useSubject } from '@/api/catalog';
import { isApiError } from '@/api/client';
import { useLang } from '@/hooks/useLang';

type Tab = 'lessons' | 'bank' | 'exams';

export default function SubjectDetail() {
  const { subjectId } = useParams();
  const { t } = useTranslation();
  const { l, fmtNumber } = useLang();
  const [tab, setTab] = useState<Tab>('lessons');
  // CAT-02: units/chapters, ordered lessons with progress + lock, next lesson.
  const { data: subject, isLoading, isError, error, refetch } = useSubject(subjectId);
  const ready = !isLoading;

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-80 rounded-3xl" />
        <Skeleton className="h-12 w-80 rounded-2xl" />
        <SkeletonList rows={4} />
      </div>
    );
  }

  if (isError && !(isApiError(error) && error.status === 404)) {
    return <ErrorState className="mt-10" onRetry={() => void refetch()} />;
  }

  if (!subject) {
    return (
      <>
        <Seo title={t('learn.subject.notFoundTitle')} />
        <EmptyState
          className="mt-10"
          icon={<SearchX className="h-7 w-7" />}
          title={t('learn.subject.notFoundTitle')}
          body={t('learn.subject.notFoundBody')}
          action={
            <Button to="/student/subjects" leftIcon={<ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />}>
              {t('learn.subject.back')}
            </Button>
          }
        />
      </>
    );
  }

  const locked = !!subject.locked;
  const subjectLessons = subject.lessons;
  const progress = subject.progress ?? {
    completed: subjectLessons.filter((x) => x.status === 'completed').length,
    total: subjectLessons.length,
    pct: 0,
    avgPct: 0,
  };
  const nextLesson = subjectLessons.find((x) => x.id === subject.nextLessonId);
  const examCount = subject.examsCount;

  const stats = [
    { icon: BookOpen, value: fmtNumber(subject.lessonsCount), label: t('learn.subject.stats.lessons') },
    { icon: Clock3, value: fmtNumber(subject.hours), label: t('learn.subject.stats.hours') },
    { icon: FileQuestion, value: fmtNumber(subject.questionsCount), label: t('learn.subject.stats.questions') },
  ];

  return (
    <>
      <Seo title={l(subject.name)} description={l(subject.description)} />

      <nav aria-label={t('learn.lesson.breadcrumb')} className="mb-4">
        <Link
          to="/student/subjects"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
          {t('learn.subject.back')}
        </Link>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl text-white shadow-lift">
        <div className="absolute inset-0">
          <SmartImage src={subject.image} alt="" priority wrapperClassName="h-full w-full" />
        </div>
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(115deg, rgba(11,31,58,0.96) 0%, rgba(11,31,58,0.86) 45%, ${subject.color}B3 100%)`,
          }}
          aria-hidden
        />
        <span className="pointer-events-none absolute -end-10 -top-16 h-64 w-64 rounded-full bg-accent/25 blur-3xl" aria-hidden />

        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:p-10">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-soft"
                style={{ color: subject.color }}
              >
                <SubjectIcon id={subject.slug} icon={subject.icon} className="h-7 w-7" />
              </span>
              {locked ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/25">
                  <Lock className="h-3.5 w-3.5 text-accent-light" aria-hidden />
                  {t('common.locked')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold text-accent-light ring-1 ring-accent/40">
                  <Crown className="h-3.5 w-3.5" aria-hidden />
                  {t('learn.subject.included')}
                </span>
              )}
            </div>
            <h1 className="mt-5 text-3xl font-bold text-white sm:text-4xl lg:text-5xl">{l(subject.name)}</h1>
            <p className="mt-3 max-w-2xl leading-relaxed text-white/75">{l(subject.description)}</p>

            <div className="mt-6 flex items-center gap-3">
              <Avatar src={teacherAvatar(subject.slug, subject.teacherRef)} alt={l(subject.teacher)} size={44} ring />
              <div>
                <p className="text-xs text-white/60">{t('learn.subject.teacher')}</p>
                <p className="font-semibold">{l(subject.teacher)}</p>
              </div>
            </div>

            <ul className="mt-7 grid max-w-xl grid-cols-3 gap-3">
              {stats.map(({ icon: Icon, value, label }) => (
                <li key={label} className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10 backdrop-blur-sm sm:p-4">
                  <Icon className="h-4 w-4 text-accent-light" aria-hidden />
                  <p className="mt-2 text-lg font-bold num sm:text-2xl">{value}</p>
                  <p className="text-[11px] text-white/65 sm:text-xs">{label}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-navy flex flex-row items-center gap-5 rounded-3xl p-5 lg:flex-col lg:p-7 lg:text-center">
            <ProgressRing value={progress.pct} size={116} stroke={10} color="#C9A24A" trackColor="rgba(255,255,255,0.12)" label={t('learn.subject.completion')}>
              <span className="flex flex-col items-center">
                <span className="text-2xl font-bold num">{progress.pct}%</span>
                <span className="text-[11px] text-white/60">{t('learn.subject.completion')}</span>
              </span>
            </ProgressRing>
            <div className="min-w-0">
              <p className="text-sm text-white/70 num">
                {t('learn.card.lessonsDone', { done: progress.completed, total: progress.total })}
              </p>
              {locked ? (
                <Button to="/student/subscription" variant="gold" size="sm" className="mt-3" leftIcon={<Crown className="h-4 w-4" />}>
                  {t('learn.subject.upgrade')}
                </Button>
              ) : (
                nextLesson && (
                  <Button
                    to={`/student/lesson/${nextLesson.id}`}
                    variant="gold"
                    size="sm"
                    className="mt-3"
                    leftIcon={<PlayCircle className="h-4 w-4" />}
                  >
                    {nextLesson.status === 'in-progress' ? t('common.resume') : t('learn.subject.startNext')}
                  </Button>
                )
              )}
            </div>
          </div>
        </div>
      </section>

      {locked && (
        <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-accent/30 bg-accent/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
            <div>
              <p className="font-semibold text-primary">{t('learn.subject.lockedTitle')}</p>
              <p className="mt-0.5 text-sm text-muted">{t('learn.subject.lockedBody')}</p>
            </div>
          </div>
          <Button to="/student/subscription" variant="primary" className="shrink-0">
            {t('learn.subject.upgrade')}
          </Button>
        </div>
      )}

      <div className="mt-8">
        <Tabs<Tab>
          ariaLabel={l(subject.name)}
          value={tab}
          onChange={setTab}
          className="w-full sm:w-fit"
          stretch
          items={[
            { id: 'lessons', label: t('learn.subject.tabs.lessons'), icon: <PlayCircle className="hidden h-4 w-4 min-[400px]:block" />, count: subjectLessons.length },
            { id: 'bank', label: t('learn.subject.tabs.bank'), icon: <FileQuestion className="hidden h-4 w-4 min-[400px]:block" /> },
            { id: 'exams', label: t('learn.subject.tabs.exams'), icon: <ClipboardList className="hidden h-4 w-4 min-[400px]:block" />, count: examCount },
          ]}
        />
      </div>

      <div className="mt-6">
        {!ready ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-24 rounded-2xl" />
            <SkeletonList rows={4} />
          </div>
        ) : tab === 'lessons' ? (
          <LessonList key={subject.id} subject={subject} locked={locked} />
        ) : tab === 'bank' ? (
          <QuestionBankPanel subject={subject} />
        ) : (
          <ExamsPanel subject={subject} />
        )}
      </div>
    </>
  );
}
