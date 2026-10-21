import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  CalendarClock,
  ClipboardCheck,
  Clock3,
  Crown,
  Flame,
  BookOpen,
  ListChecks,
  NotebookPen,
  PlayCircle,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  AnimatedCounter,
  Badge,
  Button,
  Card,
  CardHeader,
  ProgressBar,
  ProgressRing,
  SmartImage,
  SubjectIcon,
} from '@/components/ui';
import { getSubject, recentActivity, subjects, upcomingExams, weeklyStudy } from '@/data';
import { useLang } from '@/hooks/useLang';
import { useProgress } from '@/hooks/useProgress';
import { cn, dayPart, formatClock } from '@/lib/utils';
import type { Lesson, Package, User } from '@/types';

/* --------------------------------------------------------------- Hero */

export function WelcomeHero({ user, pkg }: { user: User; pkg?: Package }) {
  const { t } = useTranslation();
  const { l, fmtDate } = useLang();
  const today = fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <section className="relative overflow-hidden rounded-3xl bg-navy-grad p-6 text-white shadow-lift sm:p-8 lg:p-10">
      <span className="pointer-events-none absolute -end-16 -top-24 h-72 w-72 rounded-full bg-accent/30 blur-3xl" aria-hidden />
      <span className="pointer-events-none absolute -bottom-28 start-1/3 h-64 w-64 rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <span
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] [background-size:22px_22px]"
        aria-hidden
      />

      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white/60">{today}</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight text-white sm:text-4xl">
            {t(`learn.dashboard.greeting.${dayPart()}`, { name: l(user.firstName) })}
          </h1>
          <p className="mt-2 max-w-xl text-white/70">{t('learn.dashboard.subtitle')}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {pkg && (
              <Badge className="bg-gold-grad px-3 py-1.5 text-primary ring-0">
                <Crown className="h-3.5 w-3.5" aria-hidden />
                {l(pkg.name)}
              </Badge>
            )}
            <Badge tone="white" dot className="px-3 py-1.5">
              {t('student.plan.active')} · {t('student.plan.daysLeft', { count: user.daysRemaining })}
            </Badge>
          </div>
        </div>

        <div className="glass-navy flex shrink-0 items-center gap-4 self-start rounded-2xl p-4 pe-6 md:self-auto">
          <motion.span
            className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F59E0B] to-[#C9A24A] shadow-glow"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Flame className="h-7 w-7 fill-white/30 text-white" aria-hidden />
          </motion.span>
          <div>
            <p className="text-2xl font-bold text-white num">
              <AnimatedCounter to={user.streak} duration={1.2} />
            </p>
            <p className="text-sm text-white/70">{t('learn.dashboard.streak', { count: user.streak })}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------- Continue learning */

export function ContinueCard({ lesson, progress }: { lesson: Lesson; progress: number }) {
  const { t } = useTranslation();
  const { l } = useLang();
  const subject = getSubject(lesson.subjectId);
  return (
    <Card className="group overflow-hidden">
      <div className="grid gap-0 sm:grid-cols-[minmax(0,15rem)_1fr] lg:grid-cols-[minmax(0,18rem)_1fr]">
        <Link to={`/student/lesson/${lesson.id}`} className="relative block" tabIndex={-1} aria-hidden>
          <SmartImage
            src={lesson.thumbnail}
            alt=""
            wrapperClassName="aspect-video h-full sm:aspect-auto sm:min-h-[11rem]"
            className="group-hover:scale-105"
            overlay="bg-gradient-to-t from-primary/60 to-transparent"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-primary shadow-lift transition group-hover:scale-110 group-hover:bg-accent">
              <PlayCircle className="h-7 w-7" />
            </span>
          </span>
          <span className="absolute bottom-2 end-2 rounded-md bg-primary/80 px-1.5 py-0.5 text-xs font-semibold text-white num" dir="ltr">
            {formatClock(lesson.duration)}
          </span>
        </Link>
        <div className="flex flex-col justify-center p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-accent">{t('learn.dashboard.continue.title')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {subject && <Badge color={subject.color}>{l(subject.name)}</Badge>}
          </div>
          <h2 className="mt-2 font-sans text-xl font-bold tracking-normal text-primary rtl:font-display">{l(lesson.title)}</h2>
          <p className="mt-1 text-sm text-muted">{l(lesson.teacher)}</p>
          <div className="mt-4 flex items-center gap-3">
            <ProgressBar value={progress} gold className="flex-1" label={t('learn.dashboard.continue.progress', { pct: progress })} />
            <span className="text-sm font-bold text-primary num">{progress}%</span>
          </div>
          <div className="mt-5">
            <Button
              to={`/student/lesson/${lesson.id}`}
              variant="gold"
              rightIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}
            >
              {t('common.resume')}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------- Stat tiles */

export function StatTile({
  icon: Icon,
  label,
  value,
  suffix,
  sub,
  tint,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix?: string;
  sub?: ReactNode;
  tint: string;
  children?: ReactNode;
}) {
  return (
    <Card className="relative h-full overflow-hidden p-4 transition-shadow duration-300 hover:shadow-lift sm:p-5">
      <span
        className="pointer-events-none absolute -end-8 -top-8 h-24 w-24 rounded-full opacity-10 blur-2xl"
        style={{ backgroundColor: tint }}
        aria-hidden
      />
      <span
        className="flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${tint}17`, color: tint }}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-4 text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-primary sm:text-3xl">
        {/* Isolated LTR run so "73 / 100" and "84%" never get re-ordered by the RTL paragraph. */}
        <span dir="ltr" className="inline-block num">
          <AnimatedCounter to={value} suffix={suffix} duration={1.4} />
        </span>
      </p>
      {sub && <p className="mt-1 text-xs text-muted num">{sub}</p>}
      {children}
    </Card>
  );
}

/* ---------------------------------------------------- Subject progress */

export function SubjectProgressGrid() {
  const { t } = useTranslation();
  const { l } = useLang();
  const { bySubject } = useProgress();
  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {subjects.map((s) => {
        const p = bySubject[s.id];
        return (
          <li key={s.id} className="last:col-span-2 md:last:col-span-1">
            <Link
              to={`/student/subjects/${s.id}`}
              className="card group flex h-full flex-col items-center p-5 text-center transition duration-300 hover:-translate-y-1 hover:shadow-lift"
            >
              <ProgressRing value={p.pct} size={84} stroke={7} color={s.color} label={l(s.name)}>
                <span className="flex flex-col items-center" style={{ color: s.color }}>
                  <SubjectIcon id={s.id} className="h-5 w-5" />
                  <span className="mt-0.5 text-xs font-bold text-primary num">{p.pct}%</span>
                </span>
              </ProgressRing>
              <span className="mt-3 font-bold text-primary transition-colors group-hover:text-accent">{l(s.name)}</span>
              <span className="mt-0.5 text-xs text-muted num">
                {t('learn.card.lessonsDone', { done: p.completed, total: p.total })}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------ Recent activity */

const activityIcon: Record<(typeof recentActivity)[number]['kind'], { icon: LucideIcon; cls: string }> = {
  lesson: { icon: PlayCircle, cls: 'bg-math/10 text-math' },
  quiz: { icon: ListChecks, cls: 'bg-success/10 text-success' },
  exam: { icon: ClipboardCheck, cls: 'bg-accent/15 text-[#8A6A1F]' },
  ai: { icon: Bot, cls: 'bg-physics/10 text-physics' },
};

/** Mock activity carries fixed timestamps — re-anchor them so the newest item is always "35 minutes ago". */
function anchoredActivity() {
  const latest = Math.max(...recentActivity.map((a) => new Date(a.date).getTime()));
  const shift = Date.now() - 35 * 60_000 - latest;
  return recentActivity.map((a) => ({ ...a, date: new Date(new Date(a.date).getTime() + shift).toISOString() }));
}

export function RecentActivity() {
  const { t } = useTranslation();
  const { l, fmtRelative } = useLang();
  const items = useMemo(anchoredActivity, []);
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader title={t('learn.dashboard.activity.title')} subtitle={t('learn.dashboard.activity.subtitle')} />
      <ol className="relative mt-5 space-y-1">
        {items.map((a, i) => {
          const { icon: Icon, cls } = activityIcon[a.kind];
          return (
            <li key={a.id} className="relative flex gap-3.5 rounded-xl p-2 transition-colors hover:bg-primary/[0.02]">
              {i < items.length - 1 && (
                <span className="absolute start-[1.65rem] top-12 h-[calc(100%-2.5rem)] w-px bg-primary/10" aria-hidden />
              )}
              <span className={cn('relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', cls)}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-primary">{l(a.title)}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span>{l(a.meta)}</span>
                  <span aria-hidden>·</span>
                  <time dateTime={a.date}>{fmtRelative(a.date)}</time>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ------------------------------------------------------- Upcoming exams */

export function UpcomingExams() {
  const { t } = useTranslation();
  const { l, fmtDate, fmtRelative } = useLang();
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        title={t('learn.dashboard.exams.title')}
        subtitle={t('learn.dashboard.exams.subtitle')}
        action={
          <Link to="/student/exams" className="shrink-0 text-sm font-semibold text-accent hover:text-primary">
            {t('common.viewAll')}
          </Link>
        }
      />
      <ul className="mt-5 space-y-3">
        {upcomingExams.map((e, i) => (
          <li key={e.id}>
            <Link
              to="/student/exams"
              className="group flex items-center gap-4 rounded-2xl border border-primary/5 p-3 transition hover:border-accent/40 hover:bg-accent/5"
            >
              <span
                className={cn(
                  'flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl px-1 text-center leading-none',
                  i === 0 ? 'bg-primary text-white' : 'bg-primary/5 text-primary',
                )}
              >
                <span className="text-lg font-bold num">{fmtDate(e.date, { day: 'numeric' })}</span>
                <span
                  className={cn(
                    'mt-1 line-clamp-2 text-[10px] font-semibold leading-tight',
                    i === 0 ? 'text-accent-light' : 'text-muted',
                  )}
                >
                  {fmtDate(e.date, { month: 'short' })}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-primary">{l(e.title)}</span>
                <span className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                  <time dateTime={e.date}>{fmtRelative(e.date)}</time>
                  <span aria-hidden>·</span>
                  <span className="num">{fmtDate(e.date, { hour: 'numeric', minute: '2-digit' })}</span>
                </span>
              </span>
              <ArrowRight
                className="h-4 w-4 shrink-0 text-muted transition group-hover:text-accent rtl:-scale-x-100"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ----------------------------------------------------------- Today's goal */

const DAILY_GOAL = 120;

/** Today's study goal ring + quick shortcuts into practice tools. */
export function TodayGoal() {
  const { t } = useTranslation();
  // weeklyStudy starts on Saturday (Iraqi week); JS getDay() starts on Sunday.
  const today = weeklyStudy[(new Date().getDay() + 1) % 7] ?? weeklyStudy[0];
  const pct = Math.min(100, Math.round((today.minutes / DAILY_GOAL) * 100));
  const shortcuts = [
    { to: '/student/question-bank', icon: BookOpen, label: t('student.nav.questionBank'), cls: 'bg-math/10 text-math' },
    { to: '/student/mistakes', icon: NotebookPen, label: t('student.nav.mistakes'), cls: 'bg-danger/10 text-danger' },
    { to: '/student/ai-tutor', icon: Bot, label: t('student.nav.aiTutor'), cls: 'bg-physics/10 text-physics' },
  ];
  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <CardHeader title={t('learn.dashboard.goal.title')} subtitle={t('learn.dashboard.goal.subtitle')} />
      <div className="mt-5 flex items-center gap-5">
        <ProgressRing value={pct} size={104} stroke={9} label={t('learn.dashboard.goal.title')}>
          <span className="flex flex-col items-center">
            <span className="text-xl font-bold text-primary num">{pct}%</span>
            <Clock3 className="mt-0.5 h-3.5 w-3.5 text-accent" aria-hidden />
          </span>
        </ProgressRing>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-primary num">{t('common.minutes', { count: today.minutes })}</p>
          <p className="mt-0.5 text-sm text-muted">{t('learn.dashboard.goal.of', { count: DAILY_GOAL })}</p>
          <p className="mt-2 text-xs font-semibold text-success">
            {pct >= 100 ? t('learn.dashboard.goal.done') : t('learn.dashboard.goal.left', { count: DAILY_GOAL - today.minutes })}
          </p>
        </div>
      </div>
      <p className="mt-6 text-xs font-bold uppercase tracking-wider text-muted">{t('learn.dashboard.goal.shortcuts')}</p>
      <ul className="mt-3 space-y-2">
        {shortcuts.map(({ to, icon: Icon, label, cls }) => (
          <li key={to}>
            <Link
              to={to}
              className="group flex items-center gap-3 rounded-xl border border-primary/5 p-2.5 text-sm font-semibold text-primary transition hover:border-accent/40 hover:bg-accent/5"
            >
              <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', cls)}>
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="flex-1">{label}</span>
              <ArrowRight className="h-4 w-4 text-muted transition group-hover:text-accent rtl:-scale-x-100" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
