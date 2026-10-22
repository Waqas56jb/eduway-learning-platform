import { BookOpenCheck, Bot, Target, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ContinueCard,
  RecentActivity,
  StatTile,
  SubjectProgressGrid,
  TodayGoal,
  UpcomingExams,
  WelcomeHero,
} from '@/components/student/dashboard/DashboardWidgets';
import { WeeklyStudyChart } from '@/components/student/dashboard/WeeklyStudyChart';
import { useDashboard } from '@/api/progress';
import { Card, CardHeader, ErrorState, ProgressBar, Reveal, RevealItem, Seo, Skeleton, SkeletonList } from '@/components/ui';

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      <Skeleton className="h-52 rounded-3xl" />
      <Skeleton className="h-48 rounded-2xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
        <SkeletonList rows={3} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  // PRG-04: one composite call drives every widget on this page.
  const { data: dash, isLoading, isError, refetch } = useDashboard();

  if (isError && !dash) {
    return (
      <>
        <Seo title={t('learn.dashboard.seoTitle')} description={t('learn.dashboard.seoDescription')} />
        <ErrorState onRetry={() => void refetch()} />
      </>
    );
  }

  const completedLessons = dash?.lessons.completed ?? 0;
  const totalLessons = dash?.lessons.total ?? 0;
  const overallPct = dash?.lessons.pct ?? 0;
  const unresolved = dash?.unresolvedMistakes ?? 0;
  const aiQuota = dash?.aiAllowance.quota ?? 0;
  const aiUsed = dash?.aiAllowance.used ?? 0;
  const aiLeft = dash?.aiAllowance.remaining ?? Math.max(0, aiQuota - aiUsed);
  const weekMinutes = dash?.weeklyStudy.totalMinutes ?? 0;
  const quizAvg = dash ? (dash.latestWeekQuizAverage ?? dash.quizAverage) : null;
  const lastLesson = dash?.continueLesson ?? null;

  return (
    <>
      <Seo title={t('learn.dashboard.seoTitle')} description={t('learn.dashboard.seoDescription')} />
      {isLoading || !dash ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-8">
          <WelcomeHero name={dash.greetingName} streak={dash.streak.current} subscription={dash.subscription} />

          {lastLesson && (
            <Reveal>
              <ContinueCard lesson={lastLesson} progress={lastLesson.progress} />
            </Reveal>
          )}

          <section aria-labelledby="dash-stats">
            <h2 id="dash-stats" className="sr-only">
              {t('learn.dashboard.stats.title')}
            </h2>
            <Reveal staggerChildren={0.08} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <RevealItem>
                <StatTile
                  icon={BookOpenCheck}
                  tint="#0B1F3A"
                  label={t('learn.dashboard.stats.lessons')}
                  value={completedLessons}
                  sub={t('learn.dashboard.stats.lessonsSub', { total: totalLessons, pct: overallPct })}
                >
                  <ProgressBar value={overallPct} size="xs" className="mt-3" label={t('learn.dashboard.stats.lessons')} />
                </StatTile>
              </RevealItem>
              <RevealItem>
                <StatTile
                  icon={Target}
                  tint="#059669"
                  label={t('learn.dashboard.stats.quiz')}
                  value={quizAvg === null ? null : Math.round(quizAvg)}
                  suffix="%"
                  sub={t('learn.dashboard.stats.quizSub')}
                />
              </RevealItem>
              <RevealItem>
                <Link to="/student/mistakes" className="block h-full rounded-2xl">
                  <StatTile
                    icon={TriangleAlert}
                    tint="#DC2626"
                    label={t('learn.dashboard.stats.mistakes')}
                    value={unresolved}
                    sub={t('learn.dashboard.stats.mistakesSub')}
                  />
                </Link>
              </RevealItem>
              <RevealItem>
                <StatTile
                  icon={Bot}
                  tint="#C9A24A"
                  label={t('learn.dashboard.stats.ai')}
                  value={aiLeft}
                  suffix={` / ${aiQuota}`}
                  sub={t('learn.dashboard.stats.aiSub', { used: aiUsed, quota: aiQuota })}
                >
                  <ProgressBar value={(aiLeft / Math.max(1, aiQuota)) * 100} gold size="xs" className="mt-3" label={t('learn.dashboard.stats.ai')} />
                </StatTile>
              </RevealItem>
            </Reveal>
          </section>

          <section aria-labelledby="dash-subjects">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 id="dash-subjects" className="text-2xl font-bold text-primary">
                  {t('learn.dashboard.subjects.title')}
                </h2>
                <p className="mt-1 text-sm text-muted">{t('learn.dashboard.subjects.subtitle')}</p>
              </div>
              <Link to="/student/subjects" className="shrink-0 text-sm font-semibold text-accent hover:text-primary">
                {t('common.viewAll')}
              </Link>
            </div>
            <SubjectProgressGrid items={dash.subjects} />
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="min-w-0 p-5 sm:p-6 lg:col-span-2">
              <CardHeader
                title={t('learn.dashboard.weekly.title')}
                subtitle={t('learn.dashboard.weekly.subtitle')}
                action={
                  <div className="shrink-0 text-end">
                    <p className="text-xl font-bold text-primary num">
                      {t('learn.dashboard.weekly.total', { hours: Math.floor(weekMinutes / 60), minutes: weekMinutes % 60 })}
                    </p>
                    <p className="text-xs text-muted num">
                      {t('learn.dashboard.weekly.avg', { count: Math.round(dash.weeklyStudy.dailyAverageMinutes) })}
                    </p>
                  </div>
                }
              />
              <div className="mt-6">
                <WeeklyStudyChart days={dash.weeklyStudy.days} />
              </div>
            </Card>
            <UpcomingExams items={dash.upcomingExams} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <RecentActivity items={dash.recentActivity} />
            </div>
            <TodayGoal todayMinutes={dash.todayMinutes} goalMinutes={dash.dailyGoalMinutes} />
          </div>
        </div>
      )}
    </>
  );
}
