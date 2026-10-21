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
  Info,
  RotateCcw,
  Sparkles,
  Timer,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  DEMO_PREFIX,
  attemptsLeftFor,
  buildDemoAttempt,
  gradeFor,
  scoreAttempt,
} from '@/components/student/exam/examUtils';
import { TopicBreakdown, barColor, type TopicStat } from '@/components/student/exam/TopicBreakdown';
import { QuizCard } from '@/components/student/QuizCard';
import {
  AccordionItem,
  AnimatedCounter,
  Badge,
  Button,
  Card,
  CardHeader,
  ProgressRing,
  Reveal,
  Seo,
  Skeleton,
  SkeletonList,
  SubjectBadgeIcon,
  Tabs,
  useMockLoading,
} from '@/components/ui';
import { exams, getExam, getLesson, getQuestion, getSubject } from '@/data';
import { useLang } from '@/hooks/useLang';
import { useStudent } from '@/hooks/useProgress';
import { cn, formatClock } from '@/lib/utils';
import type { Question } from '@/types';

type ReviewFilter = 'all' | 'incorrect' | 'unanswered';

export default function ExamResult() {
  const { attemptId = '' } = useParams();
  const { t } = useTranslation();
  const { l, fmtDate } = useLang();
  const { getAttempt, attempts } = useStudent();
  const reduceMotion = useReducedMotion();
  const ready = useMockLoading(500);
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [open, setOpen] = useState<string | null>(null);

  // Real attempt, or a deterministic demo so the page is never broken.
  const { attempt, isDemo } = useMemo(() => {
    const found = getAttempt(attemptId);
    if (found && getExam(found.examId)) return { attempt: found, isDemo: false };
    const demoExam = attemptId.startsWith(DEMO_PREFIX) ? getExam(attemptId.slice(DEMO_PREFIX.length)) : undefined;
    return { attempt: buildDemoAttempt(demoExam ?? exams[0]), isDemo: true };
  }, [attemptId, getAttempt]);

  const exam = getExam(attempt.examId) ?? exams[0];
  const subject = getSubject(exam.subjectId);
  const score = scoreAttempt(attempt);
  const pass = score.pct >= exam.passMark;
  const grade = gradeFor(score.pct, exam.passMark);
  const answered = score.correct + score.incorrect;
  const accuracy = answered ? Math.round((score.correct / answered) * 100) : 0;
  const attemptsLeft = attemptsLeftFor(exam, attempts);

  const items = useMemo(
    () =>
      attempt.questionIds
        .map((id) => getQuestion(id))
        .filter((q): q is Question => !!q)
        .map((q) => {
          const ans = attempt.answers[q.id] ?? null;
          const state = ans === null ? 'unanswered' : ans === q.correctIndex ? 'correct' : 'incorrect';
          return { q, ans, state: state as 'correct' | 'incorrect' | 'unanswered' };
        }),
    [attempt],
  );

  const topics = useMemo<TopicStat[]>(() => {
    const map = new Map<string, TopicStat & { lessonIds: string[] }>();
    for (const it of items) {
      const key = it.q.topic.en;
      const row = map.get(key) ?? { key, topic: l(it.q.topic), correct: 0, total: 0, pct: 0, lessonIds: [] };
      row.total++;
      if (it.state === 'correct') row.correct++;
      if (it.q.lessonId && !row.lessonIds.includes(it.q.lessonId)) row.lessonIds.push(it.q.lessonId);
      map.set(key, row);
    }
    return [...map.values()].map((r) => ({ ...r, pct: Math.round((r.correct / r.total) * 100) }));
  }, [items, l]);

  // Weakest topics → lessons to revisit (wrong / skipped questions first).
  const revision = useMemo(() => {
    const missed = items.filter((it) => it.state !== 'correct' && it.q.lessonId);
    const byLesson = new Map<string, { lessonId: string; topicKey: string; topic: string; misses: number }>();
    for (const it of missed) {
      const id = it.q.lessonId as string;
      const row = byLesson.get(id) ?? { lessonId: id, topicKey: it.q.topic.en, topic: l(it.q.topic), misses: 0 };
      row.misses++;
      byLesson.set(id, row);
    }
    const topicPct = new Map(topics.map((tp) => [tp.key, tp.pct]));
    return [...byLesson.values()]
      .map((r) => ({ ...r, pct: topicPct.get(r.topicKey) ?? 0 }))
      .sort((a, b) => a.pct - b.pct || b.misses - a.misses)
      .slice(0, 4);
  }, [items, topics, l]);

  useEffect(() => {
    // Celebrate the student's own passing attempt (not the sample result).
    if (!pass || isDemo || reduceMotion || !ready) return;
    const id = window.setTimeout(() => {
      const opts = { particleCount: 90, spread: 70, startVelocity: 42, ticks: 220, colors: ['#C9A24A', '#E6C77A', '#0B1F3A', '#FFFFFF'] };
      void confetti({ ...opts, origin: { x: 0.25, y: 0.35 }, angle: 60 });
      void confetti({ ...opts, origin: { x: 0.75, y: 0.35 }, angle: 120 });
    }, 500);
    return () => window.clearTimeout(id);
  }, [pass, isDemo, reduceMotion, ready, attempt.id]);

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

      {isDemo && (
        <p className="mb-5 flex items-start gap-2 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#7A5C17]" role="note">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t('practice.result.demoNote')}
        </p>
      )}

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
                const lesson = getLesson(r.lessonId);
                if (!lesson) return null;
                const ls = getSubject(lesson.subjectId);
                return (
                  <li key={r.lessonId}>
                    <Link
                      to={`/student/lesson/${lesson.id}`}
                      className="group flex items-center gap-3 rounded-2xl border border-primary/5 p-3 transition hover:border-accent/40 hover:bg-accent/5"
                    >
                      {ls && <SubjectBadgeIcon id={ls.id} color={ls.color} size={40} />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-primary">{l(lesson.title)}</span>
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
                        <span dir="auto" className="line-clamp-2 font-medium text-ink sm:line-clamp-1">{l(it.q.text)}</span>
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
