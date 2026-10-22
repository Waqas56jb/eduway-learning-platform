import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Flag,
  RotateCcw,
  Target,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnswerPractice, useFinishPractice } from '@/api/practice';
import type { AnswerFeedback, PracticeResultDto, PracticeStartDto } from '@/api/types';
import { AccordionItem, Badge, Button, Modal, ProgressBar, ProgressRing, Tabs } from '@/components/ui';
import { QuizCard } from '@/components/student/QuizCard';
import { useLang } from '@/hooks/useLang';
import { cn, formatClock } from '@/lib/utils';

interface PracticeSessionProps {
  /** Server-created session (PRA-01): questions are shuffled server-side, answers revealed per answer. */
  session: PracticeStartDto;
  /** Leave the session and return to the question bank. */
  onExit: () => void;
  /** Start a fresh session with a new sample. */
  onRestart: () => void;
}

type ReviewFilter = 'all' | 'incorrect' | 'skipped';

/** In-page practice runner: one question at a time with instant feedback, then a results summary. */
export function PracticeSession({ session, onExit, onRestart }: PracticeSessionProps) {
  const { t } = useTranslation();
  const { l } = useLang();
  const questions = session.questions;
  // PRA-02 per answer (instant reveal + mistake upsert), PRA-03 to finish.
  const answerMutation = useAnswerPractice();
  const finishMutation = useFinishPractice();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { index: number; feedback: AnswerFeedback | null }>>({});
  const [startedAt] = useState(() => Date.now());
  const [result, setResult] = useState<PracticeResultDto | null>(null);
  const finishedAt = !!result;
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const total = questions.length;
  const q = questions[index];
  const answeredCount = Object.keys(answers).length;
  const entry = q ? answers[q.id] : undefined;

  useEffect(() => {
    if (finishedAt) return;
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [startedAt, finishedAt]);

  const onSelect = useCallback(
    (choice: number) => {
      if (!q || answers[q.id] !== undefined) return;
      setAnswers((a) => ({ ...a, [q.id]: { index: choice, feedback: null } }));
      answerMutation.mutate(
        { sessionId: session.sessionId, body: { questionId: q.id, optionId: q.options[choice]?.id } },
        {
          onSuccess: (fb) => setAnswers((a) => ({ ...a, [q.id]: { index: choice, feedback: fb } })),
          onError: () =>
            setAnswers((a) => {
              const next = { ...a };
              delete next[q.id];
              return next;
            }),
        },
      );
    },
    [q, answers, answerMutation, session.sessionId],
  );

  const finish = useCallback(() => {
    setConfirmFinish(false);
    finishMutation.mutate(
      { sessionId: session.sessionId, timeSpentSec: Math.round((Date.now() - startedAt) / 1000) },
      {
        onSuccess: (res) => {
          setResult(res);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      },
    );
  }, [finishMutation, session.sessionId, startedAt]);

  const requestFinish = () => (answeredCount < total ? setConfirmFinish(true) : finish());

  // N / P shortcuts while practicing.
  useEffect(() => {
    if (finishedAt) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'n') setIndex((i) => Math.min(total - 1, i + 1));
      if (k === 'p') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finishedAt, total]);

  if (result) {
    return <PracticeResults result={result} onExit={onExit} onRestart={onRestart} />;
  }

  if (!q) return null;
  const isLast = index === total - 1;

  return (
    <section aria-labelledby="practice-session-title" className="mx-auto max-w-3xl">
      <div className="card mb-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="practice-session-title" className="font-sans text-lg font-bold tracking-normal text-primary">
              {l(session.title) || t('practice.session.title')}
            </h2>
            <p className="text-sm text-muted num">
              {t('practice.session.answered', { done: answeredCount, total })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary/5 px-3 py-2 text-sm font-semibold text-primary num">
              <Clock className="h-4 w-4 text-accent" aria-hidden />
              <span className="sr-only">{t('practice.session.elapsed')}</span>
              {formatClock(elapsed)}
            </span>
            <Button variant="ghost" size="sm" onClick={onExit} leftIcon={<X className="h-4 w-4" />}>
              {t('practice.session.quit')}
            </Button>
          </div>
        </div>
        <ProgressBar
          className="mt-4"
          value={(answeredCount / total) * 100}
          gold
          label={t('practice.session.progressLabel')}
        />
        <nav aria-label={t('practice.session.navigator')} className="mt-4">
          <ol className="scrollbar-none flex gap-1.5 overflow-x-auto pb-1">
            {questions.map((qq, i) => {
              const a = answers[qq.id];
              const state = !a?.feedback ? 'idle' : a.feedback.correct ? 'correct' : 'wrong';
              return (
                <li key={qq.id}>
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-current={i === index ? 'step' : undefined}
                    aria-label={t('practice.session.goTo', { n: i + 1 })}
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition num',
                      state === 'idle' && 'bg-primary/5 text-primary hover:bg-primary/10',
                      state === 'correct' && 'bg-success/15 text-success',
                      state === 'wrong' && 'bg-danger/15 text-danger',
                      i === index && 'ring-2 ring-accent ring-offset-2',
                    )}
                  >
                    {i + 1}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={q.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          <QuizCard
            question={q}
            selected={entry?.index ?? null}
            onSelect={onSelect}
            mode="instant"
            correctIndex={entry?.feedback?.correctIndex ?? null}
            explanation={entry?.feedback ? entry.feedback.explanation : undefined}
            pending={!!entry && !entry.feedback}
            index={index}
            total={total}
          />
        </motion.div>
      </AnimatePresence>

      <div className="mt-5 flex items-center justify-between gap-3">
        <Button
          variant="subtle"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          leftIcon={<ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />}
          aria-label={t('common.previous')}
          className="px-3 sm:px-4"
        >
          <span className="hidden sm:inline">{t('common.previous')}</span>
        </Button>
        <div className="flex items-center gap-2">
          {!isLast && (
            <Button variant="ghost" onClick={requestFinish} loading={finishMutation.isPending} leftIcon={<Flag className="h-4 w-4" />} className="px-3 sm:px-4">
              {t('practice.session.finish')}
            </Button>
          )}
          {isLast ? (
            <Button variant="gold" onClick={requestFinish} loading={finishMutation.isPending} leftIcon={<Flag className="h-4 w-4" />}>
              {t('practice.session.finish')}
            </Button>
          ) : (
            <Button onClick={() => setIndex((i) => i + 1)} rightIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}>
              {t('common.next')}
            </Button>
          )}
        </div>
      </div>
      <p className="mt-4 hidden text-center text-xs text-muted sm:block">{t('practice.session.shortcuts')}</p>

      <Modal
        open={confirmFinish}
        onClose={() => setConfirmFinish(false)}
        size="sm"
        title={t('practice.session.confirmTitle')}
        description={t('practice.session.confirmBody', { count: total - answeredCount })}
        footer={
          <>
            <Button variant="subtle" onClick={() => setConfirmFinish(false)}>
              {t('practice.session.keepGoing')}
            </Button>
            <Button variant="gold" onClick={finish} loading={finishMutation.isPending}>
              {t('practice.session.finishNow')}
            </Button>
          </>
        }
      />
    </section>
  );
}

/** PRA-03 result: server-scored summary + per-question review (QuestionReview with answers/explanations). */
function PracticeResults({ result, onExit, onRestart }: { result: PracticeResultDto; onExit: () => void; onRestart: () => void }) {
  const { t } = useTranslation();
  const { l } = useLang();
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [open, setOpen] = useState<string | null>(null);

  const stats = { correct: result.correct, incorrect: result.incorrect, skipped: result.skipped, pct: Math.round(result.score) };
  const timeSec = result.timeSpentSec;
  const records = result.answers;
  const questions = records;
  const isSkipped = (r: (typeof records)[number]) => r.chosenIndex < 0 && !r.textAnswer;

  const list = records.filter((r) => {
    if (filter === 'incorrect') return !isSkipped(r) && !r.correct;
    if (filter === 'skipped') return isSkipped(r);
    return true;
  });

  const ringColor = stats.pct >= 75 ? '#059669' : stats.pct >= 50 ? '#C9A24A' : '#DC2626';
  const headline = result.band;

  return (
    <section aria-labelledby="practice-results-title" className="mx-auto max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-navy-grad p-6 text-white shadow-lift sm:p-8"
      >
        <div className="pointer-events-none absolute -end-16 -top-16 h-56 w-56 rounded-full bg-accent/25 blur-3xl" aria-hidden />
        <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <ProgressRing
            value={stats.pct}
            size={148}
            stroke={11}
            color={ringColor}
            trackColor="rgba(255,255,255,0.12)"
            label={t('practice.results.scoreLabel')}
          >
            <div className="text-center">
              <span className="block text-4xl font-bold num">{stats.pct}%</span>
              <span className="text-xs text-white/60">{t('practice.results.score')}</span>
            </div>
          </ProgressRing>
          <div className="text-center sm:text-start">
            <span className="eyebrow">{t('practice.results.eyebrow')}</span>
            <h2 id="practice-results-title" className="mt-3 text-2xl font-bold text-white sm:text-3xl">
              {t(`practice.results.headline.${headline}`)}
            </h2>
            <p className="mt-2 text-white/70">
              {t('practice.results.summary', { correct: stats.correct, total: questions.length })}
              {stats.incorrect > 0 && ` ${t('practice.results.summaryMistakes')}`}
            </p>
          </div>
        </div>
        <dl className="relative mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: 'correct', v: stats.correct, icon: CheckCircle2, c: 'text-emerald-300' },
            { k: 'incorrect', v: stats.incorrect, icon: XCircle, c: 'text-rose-300' },
            { k: 'skipped', v: stats.skipped, icon: Target, c: 'text-accent-light' },
            { k: 'time', v: formatClock(timeSec), icon: Clock, c: 'text-accent-light' },
          ].map((s) => (
            <div key={s.k} className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
              <dt className="flex items-center gap-1.5 text-xs text-white/60">
                <s.icon className={cn('h-4 w-4', s.c)} aria-hidden />
                {t(`practice.results.stats.${s.k}`)}
              </dt>
              <dd className="mt-1 text-xl font-bold num">{s.v}</dd>
            </div>
          ))}
        </dl>
        <div className="relative mt-7 flex flex-col gap-3 sm:flex-row">
          <Button variant="gold" onClick={onRestart} leftIcon={<RotateCcw className="h-4 w-4" />}>
            {t('practice.results.again')}
          </Button>
          <Button variant="glass" onClick={onExit} leftIcon={<ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />}>
            {t('practice.results.backToBank')}
          </Button>
          {stats.incorrect > 0 && (
            <Button variant="glass" to="/student/mistakes">
              {t('practice.results.reviewMistakes')}
            </Button>
          )}
        </div>
      </motion.div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-bold text-primary">{t('practice.results.reviewTitle')}</h3>
        <Tabs<ReviewFilter>
          ariaLabel={t('practice.results.reviewFilter')}
          value={filter}
          onChange={setFilter}
          items={[
            { id: 'all', label: t('common.all'), count: questions.length },
            { id: 'incorrect', label: t('common.incorrect'), count: stats.incorrect },
            { id: 'skipped', label: t('practice.results.stats.skipped'), count: stats.skipped },
          ]}
        />
      </div>

      <ul className="mt-5 space-y-3">
        {list.map((r) => {
          const q = r.question;
          const i = questions.indexOf(r);
          const state = isSkipped(r) ? 'skipped' : r.correct ? 'correct' : 'wrong';
          return (
            <li key={r.questionId} className="card px-4 py-3 sm:px-5">
              <AccordionItem
                open={open === r.questionId}
                onToggle={() => setOpen((o) => (o === r.questionId ? null : r.questionId))}
                headerClassName="py-2"
                title={
                  <span className="flex items-center gap-3">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        state === 'correct' && 'bg-success/15 text-success',
                        state === 'wrong' && 'bg-danger/15 text-danger',
                        state === 'skipped' && 'bg-primary/5 text-muted',
                      )}
                    >
                      {state === 'correct' ? <Check className="h-4 w-4" /> : state === 'wrong' ? <X className="h-4 w-4" /> : <span className="text-xs font-bold num">{i + 1}</span>}
                    </span>
                    <span dir="auto" className="line-clamp-2 font-medium text-ink sm:line-clamp-1">{l(q.text)}</span>
                  </span>
                }
                meta={
                  <Badge tone={state === 'correct' ? 'success' : state === 'wrong' ? 'danger' : 'muted'} className="hidden sm:inline-flex">
                    {state === 'correct' ? t('common.correct') : state === 'wrong' ? t('common.incorrect') : t('practice.results.stats.skipped')}
                  </Badge>
                }
              >
                <div className="pb-2 pt-3">
                  <QuizCard
                    question={q}
                    selected={r.chosenIndex >= 0 ? r.chosenIndex : null}
                    onSelect={() => undefined}
                    mode="review"
                    className="!shadow-none"
                  />
                </div>
              </AccordionItem>
            </li>
          );
        })}
        {list.length === 0 && (
          <li className="card p-8 text-center text-muted">{t('practice.results.nothingHere')}</li>
        )}
      </ul>
    </section>
  );
}
