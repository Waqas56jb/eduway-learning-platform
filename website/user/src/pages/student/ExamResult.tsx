import confetti from 'canvas-confetti';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Clock,
  Crosshair,
  Flag,
  RotateCcw,
  Sparkles,
  Timer,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useSubjectLookup } from '@/api/catalog';
import { useExamResult } from '@/api/exams';
import { TopicBreakdown, barColor, type TopicStat } from '@/components/student/exam/TopicBreakdown';
import { QuizCard } from '@/components/student/QuizCard';
import { MathText } from '@/components/ui/MathText';
import {
  AccordionItem,
  AnimatedCounter,
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  ProgressRing,
  Reveal,
  Seo,
  Skeleton,
  SkeletonList,
  SubjectBadgeIcon,
  Tabs,
} from '@/components/ui';
import { useLang } from '@/hooks/useLang';
import { cn, formatClock } from '@/lib/utils';

type ReviewFilter = 'all' | 'incorrect' | 'unanswered';

export default function ExamResult() {
  const { attemptId = '' } = useParams();
  const { t } = useTranslation();
  const { l, fmtDate } = useLang();
  const reduceMotion = useReducedMotion();
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const subjectOf = useSubjectLookup();

  // EXM-08: server-scored result (score, grade, topic breakdown, recommendations, full review).
  const resultQ = useExamResult(attemptId);
  const result = resultQ.data;
  const ready = !!result;

  const exam = result?.exam ?? { id: '', title: { en: '', ar: '' }, passMark: 0, durationMin: 0, subjectId: '', subjectSlug: '', scoring: '' };
  const subject = subjectOf(exam.subjectSlug);
  const score = result?.score ?? { total: 0, correct: 0, incorrect: 0, unanswered: 0, pct: 0, rawScore: 0, maxScore: 0 };
  const pass = !!result?.passed;
  const grade = result?.grade ?? 'needsWork';
  const answered = score.correct + score.incorrect;
  const accuracy = Math.round(result?.accuracy ?? 0);
  const attemptsLeft = result?.attemptsLeft ?? 0;
  const attempt = {
    id: result?.attemptId ?? attemptId,
    timeSpentSec: result?.timeSpentSec ?? 0,
    autoSubmitted: !!result?.autoSubmitted,
    finishedAt: result?.finishedAt ?? new Date().toISOString(),
    flagged: (result?.answers ?? []).filter((a) => a.flagged).map((a) => a.questionId),
  };

  const items = useMemo(
    () =>
      (result?.answers ?? []).map((a) => {
        const ans = a.chosenIndex >= 0 ? a.chosenIndex : null;
        const state = ans === null && !a.textAnswer ? 'unanswered' : a.correct ? 'correct' : 'incorrect';
        return { q: a.question, ans, state: state as 'correct' | 'incorrect' | 'unanswered' };
      }),
    [result],
  );

  const topics = useMemo<TopicStat[]>(
    () => (result?.topicBreakdown ?? []).map((tp) => ({ key: tp.key, topic: l(tp.topic), correct: tp.correct, total: tp.total, pct: Math.round(tp.pct) })),
    [result, l],
  );

  // Weakest topics → lessons to revisit (server recommendations, worst topics first).
  const revision = useMemo(
    () =>
      (result?.recommendations ?? []).map((r) => ({
        lessonId: r.lessonId,
        title: r.title,
        topic: l(r.topic),
        misses: r.missed,
        pct: Math.round(r.topicPct),
      })),
    [result, l],
  );

  useEffect(() => {
    // Celebrate a passing attempt.
    if (!pass || reduceMotion || !ready) return;
    const id = window.setTimeout(() => {
      const opts = { particleCount: 90, spread: 70, startVelocity: 42, ticks: 220, colors: ['#C9A24A', '#E6C77A', '#0B1F3A', '#FFFFFF'] };
      void confetti({ ...opts, origin: { x: 0.25, y: 0.35 }, angle: 60 });
      void confetti({ ...opts, origin: { x: 0.75, y: 0.35 }, angle: 120 });
    }, 500);
    return () => window.clearTimeout(id);
  }, [pass, reduceMotion, ready, attempt.id]);

  if (resultQ.isError) {
    return (
      <>
        <Seo title={t('practice.result.seoDescription')} />
        <ErrorState className="mt-10" onRetry={() => void resultQ.refetch()} />
      </>
    );
  }

  const list = items.filter((it) => filter === 'all' || it.state === filter);
  const counts = {
    all: items.length,
    incorrect: items.filter((i) => i.state === 'incorrect').length,
    unanswered: items.filter((i) => i.state === 'unanswered').length,
  };
  const ringColor = pass ? (score.pct >= 80 ? '#E6C77A' : '#34D399') : '#F87171';

  const stats: { k: string; icon: LucideIcon; value: string; sub?: string; cls: string }[] = [
    { k: 'correct', icon: CheckCircle2, value: String(score.correct), cls: 'bg-success/10 text-success' },
    { k: 'incorrect', icon: XCircle, value: String(score.incorrect), cls: 'bg-danger/10 text-danger' },
    { k: 'unanswered', icon: CircleDashed, value: String(score.unanswered), cls: 'bg-primary/5 text-muted' },
    {
      k: 'time',
      icon: Clock,
      value: formatClock(attempt.timeSpentSec),
      sub: t('practice.result.stats.timeOf', { total: formatClock(exam.durationMin * 60) }),
      cls: 'bg-accent/10 text-[#8A6A1F]',
    },
    { k: 'accuracy', icon: Crosshair, value: answered ? `${accuracy}%` : '—', sub: t('practice.result.stats.accuracyHint'), cls: 'bg-primary/5 text-primary' },
  ];

  return (
    <>
      <Seo title={t('practice.result.seoTitle', { title: l(exam.title) })} description={t('practice.result.seoDescription')} />

      <Link to="/student/exams" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-primary">
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
        {t('practice.result.backToExams')}
      </Link>

      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        aria-labelledby="result-title"
        className="relative overflow-hidden rounded-3xl bg-navy-grad p-6 text-white shadow-lift sm:p-10"
      >
        <div className="pointer-events-none absolute -end-16 -top-24 h-72 w-72 rounded-full bg-accent/25 blur-3xl" aria-hidden />
        <div className="relative flex flex-col items-center gap-8 md:flex-row md:items-center">
          <ProgressRing
            value={ready ? score.pct : 0}
            size={188}
            stroke={13}
            color={ringColor}
            trackColor="rgba(255,255,255,0.1)"
            label={t('practice.result.scoreLabel')}
          >
            <div className="text-center">
              {ready ? (
                <AnimatedCounter to={score.pct} suffix="%" duration={1.2} className="block text-5xl font-bold" />
              ) : (
                <span className="block text-5xl font-bold num">0%</span>
              )}
              <span className="text-xs text-white/60 num">
                {t('practice.result.outOf', { correct: score.correct, total: score.total })}
              </span>
            </div>
          </ProgressRing>

          <div className="flex-1 text-center md:text-start">
            <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
              {subject && (
                <Badge tone="white">
                  <span style={{ color: subject.color }} className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                  {l(subject.name)}
                </Badge>
              )}
              <Badge tone={pass ? 'success' : 'danger'} className={pass ? '!bg-emerald-400/15 !text-emerald-300' : '!bg-rose-400/15 !text-rose-300'}>
                {pass ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}
                {pass ? t('practice.result.passed') : t('practice.result.failed')}
              </Badge>
              {attempt.autoSubmitted && (
                <Badge tone="white">
                  <Timer className="h-3.5 w-3.5" aria-hidden />
                  {t('practice.result.autoSubmitted')}
                </Badge>
              )}
            </div>
            <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-accent-light">
              {t(`practice.result.grade.${grade}`)}
            </p>
            <h1 id="result-title" className="mt-1 text-3xl font-bold leading-tight text-white sm:text-4xl">
              {l(exam.title)}
            </h1>
            <p className="mt-3 max-w-xl text-white/70">
              {t(`practice.result.message.${pass ? 'pass' : 'fail'}`, { mark: exam.passMark })}
            </p>
            <p className="mt-2 text-xs text-white/50">
              {t('practice.result.finishedOn', { date: fmtDate(attempt.finishedAt, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) })}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center md:justify-start">
              {attemptsLeft > 0 && (
                <Button variant="gold" to={`/student/exams/${exam.id}/room`} leftIcon={<RotateCcw className="h-4 w-4" />}>
                  {t('practice.result.retake', { count: attemptsLeft })}
                </Button>
              )}
              <Button variant="glass" to="/student/mistakes">
                {t('practice.result.reviewMistakes')}
              </Button>
              <Button variant="glass" to="/student/exams" leftIcon={<ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />}>
                {t('practice.result.backToExams')}
              </Button>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Stats */}
      <Reveal staggerChildren={0.06} as="ul" className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((s, i) => (
          <motion.li
            key={s.k}
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
            className={cn('card p-4', i === stats.length - 1 && 'col-span-2 md:col-span-1')}
          >
            <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', s.cls)}>
              <s.icon className="h-4 w-4" aria-hidden />
            </span>
            <p className="mt-3 text-2xl font-bold text-primary num">{s.value}</p>
            <p className="text-xs font-medium text-muted">{t(`practice.result.stats.${s.k}`)}</p>
            {s.sub && <p className="mt-0.5 text-[11px] text-muted/80 num">{s.sub}</p>}
          </motion.li>
        ))}
      </Reveal>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-6">
          <CardHeader title={t('practice.result.topics.title')} subtitle={t('practice.result.topics.subtitle')} className="mb-5" />
          {ready ? <TopicBreakdown data={topics} /> : <Skeleton className="h-64 w-full" />}
        </Card>

        <Card className="p-5 sm:p-6">
          <CardHeader
            title={t('practice.result.revision.title')}
            subtitle={t('practice.result.revision.subtitle')}
            className="mb-5"
            action={<Sparkles className="h-5 w-5 text-accent" aria-hidden />}
          />
          {!ready ? (
            <SkeletonList rows={3} />
          ) : revision.length === 0 ? (
            <div className="rounded-2xl bg-success/10 p-5 text-center text-sm font-medium text-success">
              {t('practice.result.revision.none')}
            </div>
          ) : (
            <ul className="space-y-3">
              {revision.map((r) => {
                const ls = subject;
                return (
                  <li key={r.lessonId}>
                    <Link
                      to={`/student/lesson/${r.lessonId}`}
                      className="group flex items-center gap-3 rounded-2xl border border-primary/5 p-3 transition hover:border-accent/40 hover:bg-accent/5"
                    >
                      {ls && <SubjectBadgeIcon id={ls.slug} color={ls.color} size={40} />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-primary">{l(r.title)}</span>
                        <span className="text-xs text-muted">{r.topic}</span>
                      </span>
                      <span className="text-end">
                        <span className="block text-sm font-bold num" style={{ color: barColor(r.pct) }}>
                          {r.pct}%
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-accent">
                          <BookOpen className="h-3 w-3" aria-hidden />
                          {t('practice.result.revision.open')}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Answer review */}
      <section aria-labelledby="review-title" className="mt-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="review-title" className="text-2xl font-bold text-primary">
            {t('practice.result.review.title')}
          </h2>
          <Tabs<ReviewFilter>
            ariaLabel={t('practice.result.review.filter')}
            value={filter}
            onChange={setFilter}
            items={[
              { id: 'all', label: t('common.all'), count: counts.all },
              { id: 'incorrect', label: t('common.incorrect'), count: counts.incorrect },
              { id: 'unanswered', label: t('practice.result.stats.unanswered'), count: counts.unanswered },
            ]}
          />
        </div>
        {!ready ? (
          <SkeletonList rows={4} className="mt-5" />
        ) : (
          <ul className="mt-5 space-y-3">
            {list.map((it) => {
              const n = items.indexOf(it) + 1;
              const flagged = attempt.flagged.includes(it.q.id);
              return (
                <li key={it.q.id} className="card px-4 py-3 sm:px-5">
                  <AccordionItem
                    open={open === it.q.id}
                    onToggle={() => setOpen((o) => (o === it.q.id ? null : it.q.id))}
                    headerClassName="py-2"
                    title={
                      <span className="flex items-center gap-3">
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold num',
                            it.state === 'correct' && 'bg-success/15 text-success',
                            it.state === 'incorrect' && 'bg-danger/15 text-danger',
                            it.state === 'unanswered' && 'bg-primary/5 text-muted',
                          )}
                        >
                          {n}
                        </span>
                        <span dir="auto" className="line-clamp-2 font-medium text-ink sm:line-clamp-1">
                          <MathText text={l(it.q.text)} />
                        </span>
                      </span>
                    }
                    meta={
                      <span className="hidden items-center gap-1.5 sm:flex">
                        {flagged && (
                          <Badge tone="gold">
                            <Flag className="h-3 w-3" aria-hidden />
                            {t('practice.room.nav.flagged')}
                          </Badge>
                        )}
                        <Badge tone={it.state === 'correct' ? 'success' : it.state === 'incorrect' ? 'danger' : 'muted'}>
                          {it.state === 'correct'
                            ? t('common.correct')
                            : it.state === 'incorrect'
                              ? t('common.incorrect')
                              : t('practice.result.stats.unanswered')}
                        </Badge>
                      </span>
                    }
                  >
                    <div className="pb-2 pt-3">
                      <QuizCard question={it.q} selected={it.ans} onSelect={() => undefined} mode="review" showBookmark className="!shadow-none" />
                    </div>
                  </AccordionItem>
                </li>
              );
            })}
            {list.length === 0 && (
              <li className="card p-8 text-center text-muted">{t('practice.result.review.empty')}</li>
            )}
          </ul>
        )}
      </section>
    </>
  );
}
