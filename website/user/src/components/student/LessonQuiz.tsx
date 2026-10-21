import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, BookX, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QuizCard } from '@/components/student/QuizCard';
import { Button, Modal, ProgressBar, ProgressRing } from '@/components/ui';
import { questions } from '@/data';
import { useLang } from '@/hooks/useLang';
import { useStudent } from '@/hooks/useProgress';
import { shuffle } from '@/lib/utils';
import type { Lesson, Question } from '@/types';

const QUIZ_SIZE = 5;
const PASS_PCT = 60;

/** Picks up to 5 questions: this lesson's first, then same unit, then same subject. */
function pickQuestions(lesson: Lesson): { question: Question; order: number[] }[] {
  const own = questions.filter((q) => q.lessonId === lesson.id);
  const unit = questions.filter((q) => q.unitId === lesson.unitId && q.lessonId !== lesson.id);
  const subject = questions.filter((q) => q.subjectId === lesson.subjectId && q.unitId !== lesson.unitId);
  const picked = [...shuffle(own), ...shuffle(unit), ...shuffle(subject)].slice(0, QUIZ_SIZE);
  return shuffle(picked).map((question) => ({ question, order: shuffle(question.options.map((_, i) => i)) }));
}

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

  // Fresh questions every time the quiz is opened.
  useEffect(() => {
    if (open) setRound((r) => r + 1);
  }, [open]);

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
  const { addMistake, recordQuizScore } = useStudent();
  const items = useMemo(() => pickQuestions(lesson), [lesson]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  const item = items[idx];
  const selected = item ? (answers[item.question.id] ?? null) : null;
  const correct = items.filter((it) => answers[it.question.id] === it.question.correctIndex).length;
  const pct = items.length ? Math.round((correct / items.length) * 100) : 0;
  const passed = pct >= PASS_PCT;
  const wrong = items.length - correct;

  const onSelect = useCallback(
    (choice: number) => {
      if (!item || answers[item.question.id] !== undefined) return;
      setAnswers((a) => ({ ...a, [item.question.id]: choice }));
      if (choice !== item.question.correctIndex) addMistake(item.question.id, choice, 'quiz');
    },
    [item, answers, addMistake],
  );

  const next = useCallback(() => {
    if (selected === null) return;
    if (idx < items.length - 1) {
      setIdx((i) => i + 1);
      return;
    }
    setFinished(true);
  }, [selected, idx, items.length]);

  // Move focus to "Next" once answered so Enter continues.
  useEffect(() => {
    if (selected !== null) nextRef.current?.focus({ preventScroll: true });
  }, [selected]);

  // Record the score & celebrate once the result screen shows.
  useEffect(() => {
    if (!finished) return;
    recordQuizScore(lesson.id, pct);
    if (passed) void celebrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

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
                {t('learn.quiz.outOf', { correct, total: items.length })}
              </span>
            </span>
          </ProgressRing>
        </div>
        <span
          className={`mt-6 flex h-12 w-12 items-center justify-center rounded-2xl ${passed ? 'bg-accent/15 text-accent' : 'bg-primary/5 text-primary'}`}
        >
          {passed ? <Trophy className="h-6 w-6" aria-hidden /> : <Sparkles className="h-6 w-6" aria-hidden />}
        </span>
        <h3 className="mt-4 text-2xl font-bold text-primary">{passed ? t('learn.quiz.passTitle') : t('learn.quiz.failTitle')}</h3>
        <p className="mt-2 max-w-md text-muted">
          {passed ? t('learn.quiz.passBody') : t('learn.quiz.failBody', { pass: PASS_PCT })}
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
          <Button variant="subtle" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={onRetry}>
            {t('learn.quiz.retry')}
          </Button>
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
          key={item.question.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
        >
          <QuizCard
            question={item.question}
            selected={selected}
            onSelect={onSelect}
            mode="instant"
            order={item.order}
            showBookmark
            className="!shadow-none ring-1 ring-primary/5"
          />
        </motion.div>
      </AnimatePresence>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="hidden text-xs text-muted sm:block">{t('learn.quiz.keyboardHint')}</p>
        <Button
          ref={nextRef}
          variant={selected !== null ? 'gold' : 'primary'}
          disabled={selected === null}
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
