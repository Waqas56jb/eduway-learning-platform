import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, BookX, Crown, Lock, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage, isApiError, type ApiError } from '@/api/client';
import { useAnswerQuiz, useStartQuiz, useSubmitQuiz } from '@/api/quizzes';
import type { AnswerFeedback, QuizResultDto, QuizStartDto } from '@/api/types';
import type { Lesson } from '@/types';
import { QuizCard } from '@/components/student/QuizCard';
import { Button, Modal, ProgressBar, ProgressRing, Skeleton } from '@/components/ui';
import { useLang } from '@/hooks/useLang';
import { lockedPlansPath } from '@/lib/plans';

async function celebrate() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const { default: confetti } = await import('canvas-confetti');
  const colors = ['#C9A24A', '#E6C77A', '#0B1F3A', '#15325C', '#FFFFFF'];
  const base = { colors, zIndex: 200, disableForReducedMotion: true };
  confetti({ ...base, particleCount: 120, spread: 80, origin: { y: 0.6 } });
  window.setTimeout(() => {
    confetti({ ...base, particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } });
    confetti({ ...base, particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } });
  }, 250);
}

interface LessonQuizProps {
  lesson: Lesson;
  open: boolean;
  onClose: () => void;
  /** Navigate to the next lesson (hidden when there is none). */
  onNextLesson?: () => void;
  onReviewMistakes: () => void;
}

/** Post-video 5-question quiz shown in a large modal. */
export function LessonQuiz({ lesson, open, onClose, onNextLesson, onReviewMistakes }: LessonQuizProps) {
  const { t } = useTranslation();
  const { l } = useLang();
  const [round, setRound] = useState(0);

  // Fresh questions every time the quiz is opened. Bumped during render (not in an effect): an effect let
  // QuizRun mount with the stale key first, so every opening sent QUZ-01 twice and burned an extra attempt.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setRound((r) => r + 1);
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" title={t('learn.quiz.title')} description={l(lesson.title)}>
      <QuizRun
        key={round}
        lesson={lesson}
        onRetry={() => setRound((r) => r + 1)}
        onNextLesson={onNextLesson}
        onReviewMistakes={onReviewMistakes}
      />
    </Modal>
  );
}

function QuizRun({
  lesson,
  onRetry,
  onNextLesson,
  onReviewMistakes,
}: {
  lesson: Lesson;
  onRetry: () => void;
  onNextLesson?: () => void;
  onReviewMistakes: () => void;
}) {
  const { t } = useTranslation();
  const { isRtl } = useLang();
  const slide = isRtl ? -24 : 24;
  // QUZ-01 start (server draws the questions + shuffles options) → QUZ-02 per answer → QUZ-03 submit.
  const start = useStartQuiz();
  const answer = useAnswerQuiz();
  const submit = useSubmitQuiz();
  const [quiz, setQuiz] = useState<QuizStartDto | null>(null);
  const [startError, setStartError] = useState<ApiError | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { index: number; feedback: AnswerFeedback | null }>>({});
  const [result, setResult] = useState<QuizResultDto | null>(null);
  const finished = !!result;
  const startedAt = useRef(Date.now());
  const nextRef = useRef<HTMLButtonElement>(null);

  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    // StrictMode re-runs effects in dev; QUZ-01 creates an attempt, so start once per mounted run.
    if (startedFor.current === lesson.id) return;
    startedFor.current = lesson.id;
    start.mutate(lesson.id, {
      onSuccess: (q) => {
        setQuiz(q);
        startedAt.current = Date.now();
      },
      onError: (e) => setStartError(e),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  const items = quiz?.questions ?? [];
  const item = items[idx];
  const entry = item ? answers[item.id] : undefined;
  const selected = entry ? entry.index : null;
  const feedback = entry?.feedback ?? null;
  const correct = result ? result.correct : Object.values(answers).filter((a) => a.feedback?.correct).length;
  const passThreshold = result?.passThreshold ?? quiz?.rule.passThreshold ?? 60;
  const pct = result ? Math.round(result.score) : 0;
  const passed = result ? result.passed : false;
  const wrong = result ? result.mistakesAdded : 0;
  const total = result?.total ?? items.length;
  const canRetry = quiz?.rule.retriesLeft === null || (quiz?.rule.retriesLeft ?? 1) > 1;

  const onSelect = useCallback(
    (choice: number) => {
      if (!item || !quiz || answers[item.id]) return;
      const option = item.options[choice];
      setAnswers((a) => ({ ...a, [item.id]: { index: choice, feedback: null } }));
      answer.mutate(
        { attemptId: quiz.attemptId, body: { questionId: item.id, optionId: option?.id } },
        {
          onSuccess: (fb) => setAnswers((a) => ({ ...a, [item.id]: { index: choice, feedback: fb } })),
          // Let the student pick again if the answer couldn't be recorded.
          onError: () =>
            setAnswers((a) => {
              const next = { ...a };
              delete next[item.id];
              return next;
            }),
        },
      );
    },
    [item, quiz, answers, answer],
  );

  const next = useCallback(() => {
    if (selected === null || !feedback || !quiz) return;
    if (idx < items.length - 1) {
      setIdx((i) => i + 1);
      return;
    }
    submit.mutate(
      { attemptId: quiz.attemptId, timeSpentSec: Math.round((Date.now() - startedAt.current) / 1000) },
      { onSuccess: setResult },
    );
  }, [selected, feedback, idx, items.length, quiz, submit]);

  // Move focus to "Next" once answered so Enter continues.
  useEffect(() => {
    if (selected === null) return;
    nextRef.current?.focus({ preventScroll: true });
    // Keep "Next" in view on short screens — the feedback strip can push it below the modal fold.
    nextRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  // Celebrate once the (server-scored) result screen shows.
  useEffect(() => {
    if (finished && passed) void celebrate();
  }, [finished, passed]);

  // Enter → next question.
  useEffect(() => {
    if (finished) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const el = e.target as HTMLElement;
      // Let focused (enabled) buttons and links handle Enter natively.
      if ((el.tagName === 'BUTTON' && !(el as HTMLButtonElement).disabled) || el.tagName === 'A' || el.tagName === 'TEXTAREA') return;
      e.preventDefault();
      next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finished, next]);

  if (startError) {
    const lockedErr = isApiError(startError) && startError.isLocked;
    return (
      <div className="flex flex-col items-center py-6 text-center" role="alert">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Lock className="h-6 w-6" aria-hidden />
        </span>
        <p className="mt-4 max-w-md font-semibold text-primary">{errorMessage(startError)}</p>
        {startError.reason === 'QUIZ_COOLDOWN' && typeof startError.details.retryAt === 'string' && (
          <p className="mt-1 text-sm text-muted num">{new Date(startError.details.retryAt).toLocaleTimeString()}</p>
        )}
        {lockedErr && (
          <Button to={lockedPlansPath(startError.locked)} variant="gold" className="mt-5" leftIcon={<Crown className="h-4 w-4" />}>
            {t('learn.subject.upgrade')}
          </Button>
        )}
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!items.length) {
    return <p className="text-muted">{t('learn.quiz.empty')}</p>;
  }

  if (finished) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center"
        aria-live="polite"
      >
        <div className="relative">
          <span className="absolute inset-0 -z-10 rounded-full bg-accent/25 blur-3xl" aria-hidden />
          <ProgressRing value={pct} size={168} stroke={12} color={passed ? '#C9A24A' : '#0B1F3A'} label={t('learn.quiz.score')}>
            <span className="flex flex-col items-center">
              <span className="text-4xl font-bold text-primary num">{pct}%</span>
              <span className="text-sm font-semibold text-muted num">
                {t('learn.quiz.outOf', { correct, total })}
              </span>
            </span>
          </ProgressRing>
        </div>
        <span
          className={`mt-6 flex h-12 w-12 items-center justify-center rounded-2xl ${passed ? 'bg-accent/15 text-accent' : 'bg-primary/5 text-primary'}`}
        >
          {passed ? <Trophy className="h-6 w-6" aria-hidden /> : <Sparkles className="h-6 w-6" aria-hidden />}
        </span>
        <h3 className="mt-4 text-2xl font-bold text-primary">{passed ? t('learn.quiz.passTitle') : pct >= passThreshold - 20 ? t('learn.quiz.failTitle') : t('learn.quiz.failTitleLow')}</h3>
        <p className="mt-2 max-w-md text-muted">
          {passed ? t('learn.quiz.passBody') : t('learn.quiz.failBody', { pass: passThreshold })}
        </p>
        {wrong > 0 && (
          <p className="mt-3 rounded-full bg-danger/10 px-3 py-1 text-xs font-semibold text-danger">
            {t('learn.quiz.addedToMistakes', { count: wrong })}
          </p>
        )}
        <div className="mt-8 flex w-full flex-col-reverse gap-3 sm:w-auto sm:flex-row">
          {wrong > 0 && (
            <Button variant="outline" leftIcon={<BookX className="h-4 w-4" />} onClick={onReviewMistakes}>
              {t('learn.quiz.reviewMistakes')}
            </Button>
          )}
          {canRetry && (
            <Button variant="subtle" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={onRetry}>
              {t('learn.quiz.retry')}
            </Button>
          )}
          {onNextLesson && (
            <Button
              variant={passed ? 'gold' : 'primary'}
              rightIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}
              onClick={onNextLesson}
            >
              {t('learn.quiz.nextLesson')}
            </Button>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4 text-sm font-semibold">
        <span className="text-primary num" aria-live="polite">
          {t('common.questionOf', { current: idx + 1, total: items.length })}
        </span>
        <span className="text-muted num">{t('learn.quiz.correctSoFar', { count: correct })}</span>
      </div>
      <ProgressBar
        value={((idx + (selected !== null ? 1 : 0)) / items.length) * 100}
        gold
        className="mb-6"
        label={t('learn.quiz.progress')}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={item.id}
          initial={{ opacity: 0, x: slide }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -slide }}
          transition={{ duration: 0.25 }}
        >
          <QuizCard
            question={item}
            selected={selected}
            onSelect={onSelect}
            mode="instant"
            correctIndex={feedback?.correctIndex ?? null}
            explanation={feedback ? feedback.explanation : undefined}
            pending={selected !== null && !feedback}
            showBookmark
            className="!p-4 !shadow-none ring-1 ring-primary/5 sm:!p-6"
          />
        </motion.div>
      </AnimatePresence>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="hidden text-xs text-muted sm:block">{t('learn.quiz.keyboardHint')}</p>
        <Button
          ref={nextRef}
          variant={selected !== null ? 'gold' : 'primary'}
          disabled={selected === null || !feedback}
          loading={submit.isPending}
          onClick={next}
          className="ms-auto"
          rightIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}
        >
          {idx < items.length - 1 ? t('common.next') : t('learn.quiz.finish')}
        </Button>
      </div>
    </div>
  );
}
