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
import { Card, CardHeader, ProgressBar, Reveal, RevealItem, Seo, Skeleton, SkeletonList, useMockLoading } from '@/components/ui';
import { demoUser, getLesson, getPackage, quizTrend, weeklyStudy } from '@/data';
import { useAuth } from '@/hooks/useAuth';
import { useProgress } from '@/hooks/useProgress';

/** Average of all subjects in the most recent quiz-trend week. */
function latestQuizAverage() {
  const last = quizTrend[quizTrend.length - 1];
  if (!last) return 84;
  const vals = [last.math, last.physics, last.chemistry, last.biology, last.english];
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

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
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
        <SkeletonList rows={3} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const ready = useMockLoading();
  const { user: authUser } = useAuth();
  const user = authUser ?? demoUser;
  const pkg = getPackage(user.packageId);
  const { completedLessons, totalLessons, overallPct, mistakes, aiUsed, aiQuota, getLessonProgress } = useProgress();

  const lastLesson = getLesson(user.lastLessonId) ?? getLesson(demoUser.lastLessonId);
  const unresolved = mistakes.filter((m) => m.status === 'unresolved').length;
  const aiLeft = Math.max(0, aiQuota - aiUsed);
  const weekMinutes = weeklyStudy.reduce((s, d) => s + d.minutes, 0);

  return (
    <>
      <Seo title={t('learn.dashboard.seoTitle')} description={t('learn.dashboard.seoDescription')} />
      {!ready ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-8">
          <WelcomeHero user={user} pkg={pkg} />

          {lastLesson && (
            <Reveal>
              <ContinueCard lesson={lastLesson} progress={getLessonProgress(lastLesson.id).progress} />
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
                  value={latestQuizAverage()}
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
            <SubjectProgressGrid />
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
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
                      {t('learn.dashboard.weekly.avg', { count: Math.round(weekMinutes / weeklyStudy.length) })}
                    </p>
                  </div>
                }
              />
              <div className="mt-6">
                <WeeklyStudyChart />
              </div>
            </Card>
            <UpcomingExams />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <RecentActivity />
            </div>
            <TodayGoal />
          </div>
        </div>
      )}
    </>
  );
}
