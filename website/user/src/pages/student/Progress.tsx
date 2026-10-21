import { ArrowRight, BookOpenCheck, CalendarDays, Clock3, Flame, Target, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  PageHeader,
  ProgressBar,
  ProgressRing,
  Reveal,
  RevealItem,
  Seo,
  Skeleton,
  SkeletonList,
  SubjectBadgeIcon,
  useMockLoading,
} from '@/components/ui';
import { ActivityHeatmap } from '@/components/student/account/ActivityHeatmap';
import { QuizTrendChart } from '@/components/student/account/QuizTrendChart';
import { getLesson, getSubject, lessons, quizTrend, subjects, weakTopics } from '@/data';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { useProgress } from '@/hooks/useProgress';
import type { SubjectId } from '@/types';

const quizAverage = (id: SubjectId) => Math.round(quizTrend.reduce((sum, r) => sum + r[id], 0) / quizTrend.length);

function ProgressSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <Skeleton className="h-56 rounded-3xl" />
      <div className="grid gap-6 lg:grid-cols-5">
        <SkeletonList rows={5} className="lg:col-span-2" />
        <Skeleton className="h-[26rem] rounded-2xl lg:col-span-3" />
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

export default function Progress() {
  const { t } = useTranslation();
  const { l, fmtNumber } = useLang();
  const { user } = useAuth();
  const { overallPct, completedLessons, totalLessons, bySubject, lessonProgress } = useProgress();
  const ready = useMockLoading(650);

  const studySeconds = lessons.reduce(
    (sum, ls) => sum + (ls.duration * (lessonProgress[ls.id]?.progress ?? 0)) / 100,
    0,
  );
  const hours = Math.round(studySeconds / 3600);

  const stats = [
    {
      icon: BookOpenCheck,
      label: t('account.progress.lessonsDone'),
      value: `${fmtNumber(completedLessons)} / ${fmtNumber(totalLessons)}`,
    },
    { icon: Flame, label: t('account.progress.streak'), value: t('account.progress.daysValue', { count: user?.streak ?? 0 }) },
    { icon: Clock3, label: t('account.progress.studyHours'), value: t('account.progress.hoursValue', { n: fmtNumber(hours) }) },
  ];

  return (
    <>
      <Seo title={t('account.progress.seoTitle')} description={t('account.progress.seoDescription')} />
      <PageHeader title={t('account.progress.title')} subtitle={t('account.progress.subtitle')} />

      {!ready ? (
        <ProgressSkeleton />
      ) : (
        <div className="space-y-6">
          {/* Hero */}
          <Reveal>
            <section className="relative overflow-hidden rounded-3xl bg-navy-grad p-6 text-white shadow-lift sm:p-8">
              <div className="pointer-events-none absolute -top-24 end-0 h-64 w-64 rounded-full bg-accent/25 blur-3xl" aria-hidden />
              <div className="pointer-events-none absolute -bottom-24 start-10 h-48 w-48 rounded-full bg-accent/10 blur-3xl" aria-hidden />
              <div className="relative flex flex-col gap-8 md:flex-row md:items-center">
                <div className="flex items-center gap-5">
                  <ProgressRing
                    value={overallPct}
                    size={128}
                    stroke={11}
                    trackColor="rgba(255,255,255,0.12)"
                    label={t('account.progress.overall')}
                  >
                    <span className="text-center">
                      <span className="block text-3xl font-bold num">{overallPct}%</span>
                    </span>
                  </ProgressRing>
                  <div>
                    <p className="text-sm text-white/60">{t('account.progress.overallHint')}</p>
                    <h2 className="mt-1 text-2xl font-bold text-white">{t('account.progress.overall')}</h2>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-accent-light">
                      <TrendingUp className="h-4 w-4" aria-hidden />
                      {t('account.progress.keepGoing')}
                    </p>
                  </div>
                </div>
                <dl className="grid flex-1 grid-cols-3 gap-2 sm:gap-3 md:ms-auto md:max-w-xl">
                  {stats.map(({ icon: Icon, label, value }) => (
                    <div key={label} className="glass flex flex-col rounded-2xl p-3 sm:p-4">
                      <Icon className="h-5 w-5 text-accent-light" aria-hidden />
                      <dt className="mt-2 text-[11px] leading-snug text-white/60 sm:mt-3 sm:text-xs">{label}</dt>
                      <dd className="mt-auto pt-0.5 text-base font-bold num sm:text-xl">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </section>
          </Reveal>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* Subject completion */}
            <Card className="p-5 sm:p-6 lg:col-span-2">
              <CardHeader title={t('account.progress.bySubject')} subtitle={t('account.progress.bySubjectSub')} />
              <Reveal as="ul" staggerChildren={0.07} className="mt-5 space-y-3">
                {subjects.map((s) => {
                  const p = bySubject[s.id];
                  return (
                    <RevealItem as="li" key={s.id}>
                      <Link
                        to={`/student/subjects/${s.id}`}
                        aria-label={`${l(s.name)} — ${t('account.progress.open')}`}
                        className="group block rounded-2xl border border-primary/5 p-3.5 transition hover:border-primary/10 hover:bg-cream/60"
                      >
                        <div className="flex items-center gap-3">
                          <SubjectBadgeIcon id={s.id} color={s.color} size={40} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate font-semibold text-primary">{l(s.name)}</p>
                              <span className="text-sm font-bold num" style={{ color: s.color }}>
                                {p.pct}%
                              </span>
                            </div>
                            <ProgressBar value={p.pct} color={s.color} className="mt-2" label={l(s.name)} />
                            <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                              <span className="num">{t('account.progress.lessonsOf', { done: p.completed, total: p.total })}</span>
                              <span className="num">
                                {t('account.progress.quizAvg')} <b className="text-primary">{quizAverage(s.id)}%</b>
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </RevealItem>
                  );
                })}
              </Reveal>
            </Card>

            {/* Trend */}
            <Card className="p-5 sm:p-6 lg:col-span-3">
              <CardHeader title={t('account.progress.trendTitle')} subtitle={t('account.progress.trendSub')} />
              <div className="mt-5">
                <QuizTrendChart />
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* Weak topics */}
            <Card className="p-5 sm:p-6 lg:col-span-2">
              <CardHeader
                title={t('account.progress.weakTitle')}
                subtitle={t('account.progress.weakSub')}
                action={
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger/10 text-danger">
                    <Target className="h-4 w-4" aria-hidden />
                  </span>
                }
              />
              <Reveal as="ul" staggerChildren={0.07} className="mt-5 divide-y divide-primary/5">
                {weakTopics.map((w) => {
                  const s = getSubject(w.subjectId);
                  const lesson = getLesson(w.lessonId);
                  const color = w.accuracy < 55 ? '#DC2626' : '#D97706';
                  return (
                    <RevealItem as="li" key={w.lessonId} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-primary">{l(w.topic)}</p>
                          <p className="mt-0.5 truncate text-xs text-muted">
                            <span style={{ color: s?.color }} className="font-semibold">
                              {l(s?.name)}
                            </span>
                            {lesson && <> · {l(lesson.title)}</>}
                          </p>
                        </div>
                        <Link
                          to={`/student/lesson/${w.lessonId}`}
                          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-accent transition hover:bg-accent/10"
                        >
                          {t('account.progress.review')}
                          <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
                        </Link>
                      </div>
                      <div className="mt-2.5 flex items-center gap-3">
                        <ProgressBar value={w.accuracy} color={color} size="xs" label={l(w.topic)} />
                        <span className="shrink-0 text-xs font-semibold num" style={{ color }}>
                          {t('account.progress.accuracy', { pct: w.accuracy })}
                        </span>
                      </div>
                    </RevealItem>
                  );
                })}
              </Reveal>
            </Card>

            {/* Heatmap */}
            <Card className="min-w-0 p-5 sm:p-6 lg:col-span-3">
              <CardHeader
                title={t('account.progress.heatTitle')}
                subtitle={t('account.progress.heatSub')}
                action={
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                    <CalendarDays className="h-4 w-4" aria-hidden />
                  </span>
                }
              />
              <div className="mt-5">
                <ActivityHeatmap />
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
