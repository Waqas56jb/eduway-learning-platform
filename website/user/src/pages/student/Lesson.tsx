import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Crown,
  FileText,
  Info,
  ListChecks,
  Lock,
  NotebookPen,
  PartyPopper,
  SearchX,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LessonList } from '@/components/student/LessonList';
import { LessonQuiz } from '@/components/student/LessonQuiz';
import { VideoPlayer } from '@/components/student/VideoPlayer';
import { teacherAvatar } from '@/components/student/lesson/access';
import { NotesPanel, ResourcesPanel } from '@/components/student/lesson/LessonPanels';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  ProgressBar,
  Seo,
  Skeleton,
  SkeletonList,
  SmartImage,
  Tabs,
  useToast,
} from '@/components/ui';
import { useSubject } from '@/api/catalog';
import { errorMessage, isApiError } from '@/api/client';
import { useLesson } from '@/api/lessons';
import { useCompleteLesson } from '@/api/progress';
import { useLang } from '@/hooks/useLang';
import { toMinutes } from '@/lib/utils';
import { plansPath } from '@/lib/plans';

type Tab = 'overview' | 'resources' | 'notes';

function LessonSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-hidden>
      <div className="space-y-5">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="aspect-video rounded-2xl" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <SkeletonList rows={5} />
    </div>
  );
}

export default function Lesson() {
  const { lessonId } = useParams();
  const { t } = useTranslation();
  const { l } = useLang();
  const navigate = useNavigate();
  const toast = useToast();
  const completeLesson = useCompleteLesson();

  const [tab, setTab] = useState<Tab>('overview');
  const [finishedOpen, setFinishedOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);

  // CAT-05 lesson detail (+ caller progress, prev/next, unit progress, best quiz score, resources);
  // CAT-02 for the subject's units/lessons in the "Up next" list.
  const lessonQ = useLesson(lessonId);
  const lesson = lessonQ.data;
  const subjectQ = useSubject(lesson?.subjectSlug);
  const subject = subjectQ.data;
  const ready = !lessonQ.isLoading && !subjectQ.isLoading;

  const closeQuiz = useCallback(() => setQuizOpen(false), []);
  const closeFinished = useCallback(() => setFinishedOpen(false), []);

  if (!ready) {
    return (
      <>
        <Seo title={t('common.loading')} />
        <LessonSkeleton />
      </>
    );
  }

  if (lessonQ.isError && !(isApiError(lessonQ.error) && lessonQ.error.status === 404)) {
    return <ErrorState className="mt-10" onRetry={() => void lessonQ.refetch()} />;
  }

  if (!lesson || !subject) {
    return (
      <>
        <Seo title={t('learn.lesson.notFoundTitle')} />
        <EmptyState
          className="mt-10"
          icon={<SearchX className="h-7 w-7" />}
          title={t('learn.lesson.notFoundTitle')}
          body={t('learn.lesson.notFoundBody')}
          action={
            <Button to="/student/subjects" leftIcon={<ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />}>
              {t('learn.subject.back')}
            </Button>
          }
        />
      </>
    );
  }

  const locked = lesson.locked;
  // Entitlement locks go to the paywall; sequential / prerequisite locks point back to the lesson to finish.
  const accessLock = locked && (lesson.lockReason === 'PREREQUISITE' || lesson.lockReason === 'SEQUENTIAL');
  const unit = { title: lesson.unitTitle };
  // 1-based unit number; derived from the subject's ordered units (contract leaves unitIndex's base unspecified).
  const unitPos = subject.units.findIndex((u) => u.id === lesson.unitId);
  const unitIndex = unitPos >= 0 ? unitPos + 1 : lesson.unitIndex;
  const prev = lesson.prevLessonId ? { id: lesson.prevLessonId } : undefined;
  const next = lesson.nextLessonId ? { id: lesson.nextLessonId } : undefined;
  const unitLessons = subject.lessons.filter((x) => x.unitId === lesson.unitId);
  const unitDone = lesson.unitProgress.done;
  const unitTotal = lesson.unitProgress.total || unitLessons.length;
  const progress = { status: lesson.status, progress: lesson.progress };
  const isDone = progress.status === 'completed';
  const best = lesson.bestQuizScore;

  const goNext = () => {
    setQuizOpen(false);
    if (next) navigate(`/student/lesson/${next.id}`);
  };

  const markDone = () => {
    completeLesson.mutate(lesson.id, {
      onSuccess: () => toast.success(t('learn.lesson.markedToast'), l(lesson.title)),
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  const statusBadge = isDone ? (
    <Badge tone="success">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
      {t('common.completed')}
    </Badge>
  ) : progress.status === 'in-progress' ? (
    <Badge tone="gold">{t('learn.list.inProgressPct', { pct: progress.progress })}</Badge>
  ) : (
    <Badge tone="muted">{t('common.notStarted')}</Badge>
  );

  return (
    <>
      <Seo title={l(lesson.title)} description={l(lesson.description)} />

      {!ready ? (
        <LessonSkeleton />
      ) : (
        <>
          <nav aria-label={t('learn.lesson.breadcrumb')} className="mb-5">
            <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
              <li>
                <Link to="/student/subjects" className="font-medium transition hover:text-primary">
                  {t('student.nav.subjects')}
                </Link>
              </li>
              <li aria-hidden>
                <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
              </li>
              <li>
                <Link to={`/student/subjects/${subject.slug}`} className="font-medium transition hover:text-primary">
                  {l(subject.name)}
                </Link>
              </li>
              {unit && (
                <>
                  <li aria-hidden>
                    <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
                  </li>
                  <li aria-current="page" className="font-semibold text-primary">
                    {l(unit.title)}
                  </li>
                </>
              )}
            </ol>
          </nav>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
            {/* Video + info */}
            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
              {locked ? (
                <div className="relative aspect-video overflow-hidden rounded-2xl shadow-lift">
                  <div className="absolute inset-0">
                    <SmartImage src={lesson.thumbnail} alt="" wrapperClassName="h-full w-full" className="scale-105 blur-sm" />
                  </div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-primary/80 p-6 text-center text-white">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/25">
                      <Lock className="h-6 w-6 text-accent-light" aria-hidden />
                    </span>
                    {accessLock ? (
                      <>
                        <p className="text-lg font-bold">{t('common.locked')}</p>
                        <p className="max-w-md text-sm text-white/70">
                          {t(`errors.reasons.${lesson.lockReason === 'PREREQUISITE' ? 'PREREQUISITE_NOT_MET' : 'SEQUENTIAL_LOCK'}`)}
                        </p>
                        {(lesson.prerequisiteId || prev) && (
                          <Button
                            to={`/student/lesson/${lesson.lockReason === 'PREREQUISITE' && lesson.prerequisiteId ? lesson.prerequisiteId : prev?.id}`}
                            variant="gold"
                            size="sm"
                            leftIcon={<ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />}
                          >
                            {t('learn.lesson.prev')}
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-lg font-bold">{t('learn.subject.lockedTitle')}</p>
                        <p className="max-w-md text-sm text-white/70">{t('learn.subject.lockedBody')}</p>
                        <Button to={plansPath({ subjectSlug: subject.slug })} variant="gold" size="sm" leftIcon={<Crown className="h-4 w-4" />}>
                          {t('learn.subject.upgrade')}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <VideoPlayer
                  key={lesson.id}
                  lessonId={lesson.id}
                  poster={lesson.thumbnail}
                  title={l(lesson.title)}
                  durationHint={lesson.duration}
                  resumePositionSec={lesson.status === 'completed' ? 0 : lesson.positionSec}
                  onEnded={() => {
                    if (!isDone) completeLesson.mutate(lesson.id);
                    // Never stack the "finished" prompt on top of a quiz that is already running.
                    if (!quizOpen) setFinishedOpen(true);
                  }}
                />
              )}

              <div className="mt-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={subject.color}>{l(subject.name)}</Badge>
                  {statusBadge}
                  {typeof best === 'number' && best !== null && (
                    <Badge tone="navy">
                      <ListChecks className="h-3.5 w-3.5" aria-hidden />
                      {t('learn.lesson.bestScore', { pct: best })}
                    </Badge>
                  )}
                </div>
                <h1 className="mt-3 text-2xl font-bold leading-snug text-primary sm:text-3xl">{l(lesson.title)}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
                  <span className="flex items-center gap-2">
                    <Avatar src={teacherAvatar(subject.slug, lesson.teacherRef)} alt="" size={28} />
                    <span className="font-medium text-ink">{l(lesson.teacher)}</span>
                  </span>
                  <span className="flex items-center gap-1.5 num">
                    <Clock3 className="h-4 w-4" aria-hidden />
                    {t('common.minutesLong', { count: toMinutes(lesson.duration) })}
                  </span>
                  {unit && (
                    <span>
                      {t('learn.list.unit', { n: unitIndex })} · {l(unit.title)}
                    </span>
                  )}
                </div>

                <div className="mt-6 flex flex-col gap-3 border-y border-primary/5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
                    {isDone ? (
                      <span className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-success/10 px-3 text-sm font-semibold text-success sm:px-4">
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                        {t('learn.lesson.completedState')}
                      </span>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={markDone}
                        loading={completeLesson.isPending}
                        disabled={locked}
                        className="px-3 sm:px-5"
                        leftIcon={<CheckCircle2 className="h-4 w-4" />}
                      >
                        {t('learn.lesson.markComplete')}
                      </Button>
                    )}
                    <Button
                      variant="gold"
                      onClick={() => setQuizOpen(true)}
                      disabled={locked || !lesson.quiz.available}
                      className="px-3 sm:px-5"
                      leftIcon={<ListChecks className="h-4 w-4" />}
                    >
                      {t('learn.lesson.takeQuiz')}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:flex">
                    <Button
                      variant="subtle"
                      to={prev ? `/student/lesson/${prev.id}` : undefined}
                      disabled={!prev}
                      className="px-3 sm:px-5"
                      leftIcon={<ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />}
                    >
                      {t('learn.lesson.prev')}
                    </Button>
                    <Button
                      variant="outline"
                      to={next ? `/student/lesson/${next.id}` : undefined}
                      disabled={!next}
                      className="px-3 sm:px-5"
                      rightIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}
                    >
                      {t('learn.lesson.next')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Up next */}
            <aside className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-labelledby="up-next">
              <Card className="p-4 lg:sticky lg:top-24">
                <div className="px-1 pb-3">
                  <h2 id="up-next" className="font-sans text-base font-bold tracking-normal text-primary rtl:font-display">
                    {t('learn.lesson.upNext')}
                  </h2>
                  {unit && <p className="mt-0.5 truncate text-xs text-muted">{l(unit.title)}</p>}
                  <div className="mt-3 flex items-center gap-3">
                    <ProgressBar value={(unitDone / Math.max(1, unitTotal)) * 100} color={subject.color} size="xs" label={l(unit?.title)} />
                    <span className="shrink-0 text-xs font-semibold text-muted num">
                      {t('learn.list.unitDone', { done: unitDone, total: unitTotal })}
                    </span>
                  </div>
                </div>
                <div className="max-h-[32rem] overflow-y-auto pe-1">
                  <LessonList subject={subject} lessons={unitLessons} locked={!!subject.locked} currentLessonId={lesson.id} compact />
                </div>
              </Card>
            </aside>

            {/* Tabs */}
            <section className="min-w-0 lg:col-start-1 lg:row-start-2">
              <Tabs<Tab>
                variant="line"
                ariaLabel={l(lesson.title)}
                value={tab}
                onChange={setTab}
                items={[
                  { id: 'overview', label: t('learn.lesson.tabs.overview'), icon: <Info className="h-4 w-4" /> },
                  {
                    id: 'resources',
                    label: t('learn.lesson.tabs.resources'),
                    icon: <FileText className="h-4 w-4" />,
                    count: lesson.resources.length,
                  },
                  { id: 'notes', label: t('learn.lesson.tabs.notes'), icon: <NotebookPen className="h-4 w-4" /> },
                ]}
              />
              <div className="pt-6">
                {tab === 'overview' && (
                  <div>
                    <h3 className="font-sans text-lg font-bold tracking-normal text-primary rtl:font-display">
                      {t('learn.lesson.aboutTitle')}
                    </h3>
                    <p className="mt-2 leading-relaxed text-ink/80">{l(lesson.description)}</p>
                    <ul className="mt-5 grid gap-3 sm:grid-cols-3">
                      {(['point1', 'point2', 'point3'] as const).map((k) => (
                        <li key={k} className="flex items-start gap-2.5 rounded-2xl bg-primary/[0.03] p-4 text-sm text-ink">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                          {t(`learn.lesson.${k}`)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {tab === 'resources' && <ResourcesPanel lesson={lesson} />}
                {tab === 'notes' && <NotesPanel key={lesson.id} lessonId={lesson.id} />}
              </div>
            </section>
          </div>
        </>
      )}

      <Modal
        open={finishedOpen}
        onClose={closeFinished}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={closeFinished}>
              {t('learn.lesson.finished.later')}
            </Button>
            <Button
              variant="gold"
              leftIcon={<ListChecks className="h-4 w-4" />}
              onClick={() => {
                setFinishedOpen(false);
                setQuizOpen(true);
              }}
            >
              {t('learn.lesson.finished.cta')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <PartyPopper className="h-8 w-8" aria-hidden />
          </span>
          <h2 className="mt-5 text-2xl font-bold text-primary">{t('learn.lesson.finished.title')}</h2>
          <p className="mt-2 text-muted">{t('learn.lesson.finished.body')}</p>
        </div>
      </Modal>

      <LessonQuiz
        lesson={lesson}
        open={quizOpen}
        onClose={closeQuiz}
        onNextLesson={next ? goNext : undefined}
        onReviewMistakes={() => {
          setQuizOpen(false);
          navigate('/student/mistakes');
        }}
      />
    </>
  );
}
