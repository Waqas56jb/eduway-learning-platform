import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Check, ChevronDown, Lightbulb, Repeat, RotateCcw, Trophy, X } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, useToast } from '@/components/ui';
import { Formula, MathText, RichText } from '@/components/ui/MathText';
import { QuizCard } from '@/components/student/QuizCard';
import { errorMessage } from '@/api/client';
import { useRetryMistake, useSetMistakeStatus } from '@/api/mistakes';
import type { AnswerFeedback, QuestionReview } from '@/api/types';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import type { Mistake, MistakeStatus } from '@/types';
import { difficultyTone, sourceLabelKey } from './practice/utils';

const STATUSES: MistakeStatus[] = ['unresolved', 'reviewed', 'mastered'];

const statusStyle: Record<MistakeStatus, string> = {
  unresolved: 'bg-danger text-white',
  reviewed: 'bg-warning text-white',
  mastered: 'bg-success text-white',
};

/** One entry in My Mistakes: your answer vs the correct one, explanation, status and an inline retry. */
export function MistakeItem({
  mistake,
  question,
  onActivity,
}: {
  mistake: Mistake;
  question: QuestionReview;
  /** Called when the student retries or changes the status, so the list can keep this item in view. */
  onActivity?: (mistakeId: string) => void;
}) {
  const { t } = useTranslation();
  const { l, fmtRelative } = useLang();
  // MST-04 status changes (optimistic) and MST-05 retry (server decides; correct → mastered, history kept).
  const setStatus = useSetMistakeStatus();
  const retry = useRetryMistake();
  const toast = useToast();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryChoice, setRetryChoice] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const lessonId = mistake.lessonId ?? question.lessonId;
  const retryCorrect = !!feedback?.correct;

  const onRetry = useCallback(
    (choice: number) => {
      if (retryChoice !== null) return;
      onActivity?.(mistake.id);
      setRetryChoice(choice);
      retry.mutate(
        { id: mistake.id, optionId: question.options[choice]?.id, chosenIndex: choice },
        {
          onSuccess: (res) => {
            setFeedback(res);
            if (res.correct) {
              toast.show({
                type: 'success',
                title: t('practice.mistakes.retry.correctToast'),
                description: t('practice.mistakes.retry.correctToastBody'),
              });
            } else {
              toast.show({ type: 'warning', title: t('practice.mistakes.retry.wrongToast') });
            }
          },
          onError: (e) => {
            setRetryChoice(null);
            toast.error(errorMessage(e));
          },
        },
      );
    },
    [retryChoice, question, mistake.id, retry, onActivity, toast, t],
  );

  const startRetry = () => {
    setRetryChoice(null);
    setFeedback(null);
    setRetrying(true);
  };

  const changeStatus = (status: MistakeStatus) => {
    if (status === mistake.status) return;
    onActivity?.(mistake.id);
    setStatus.mutate({ id: mistake.id, status });
  };

  const markMastered = () => {
    onActivity?.(mistake.id);
    setStatus.mutate({ id: mistake.id, status: 'mastered' }, { onSuccess: () => toast.success(t('practice.mistakes.masteredToast')) });
    setRetrying(false);
  };

  return (
    <article className={cn('card overflow-hidden transition-shadow duration-200', open && 'shadow-lift')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-4 p-4 text-start sm:p-5"
      >
        <span
          className={cn(
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            mistake.status === 'mastered' ? 'bg-success/10 text-success' : mistake.status === 'reviewed' ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger',
          )}
          aria-hidden
        >
          {mistake.status === 'mastered' ? <Trophy className="h-4 w-4" /> : mistake.status === 'reviewed' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span dir="auto" className={cn('block font-semibold leading-relaxed text-primary', !open && 'line-clamp-2')}>
            <MathText text={l(question.text)} />
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={difficultyTone(question.difficulty)}>{t(`common.difficulty.${question.difficulty}`)}</Badge>
            <Badge tone="muted">{t(sourceLabelKey(mistake.source))}</Badge>
            {mistake.repeatCount >= 2 && (
              <Badge tone="danger">
                <Repeat className="h-3 w-3" aria-hidden />
                {t('practice.mistakes.repeated', { count: mistake.repeatCount })}
              </Badge>
            )}
            <span className="text-xs text-muted">· {fmtRelative(mistake.date, { clampFuture: true })}</span>
          </span>
        </span>
        <ChevronDown
          className={cn('mt-1 h-5 w-5 shrink-0 text-accent transition-transform duration-300', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="space-y-5 border-t border-primary/5 px-4 pb-5 pt-4 sm:px-5">
              {question.formula && (
                <div className="rounded-xl bg-cream px-4 py-2">
                  <Formula tex={question.formula} block className="!my-1" />
                </div>
              )}

              {!retrying && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <AnswerBox
                      kind="wrong"
                      label={t('common.yourAnswer')}
                      text={
                        question.options[mistake.chosenIndex]
                          ? l(question.options[mistake.chosenIndex].text)
                          : t('practice.results.stats.skipped')
                      }
                    />
                    <AnswerBox
                      kind="right"
                      label={t('common.correctAnswer')}
                      text={
                        question.options[question.correctIndex]
                          ? l(question.options[question.correctIndex].text)
                          : question.acceptedAnswers.map((a) => l(a)).join(' / ')
                      }
                    />
                  </div>
                  <div className="rounded-2xl border border-accent/25 bg-accent/5 p-4 text-ink">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-accent">
                      <Lightbulb className="h-3.5 w-3.5" aria-hidden />
                      {t('common.explanation')}
                    </p>
                    <RichText source={l(question.explanation)} />
                  </div>
                </>
              )}

              {retrying && (
                <div>
                  <QuizCard
                    question={question}
                    selected={retryChoice}
                    onSelect={onRetry}
                    correctIndex={feedback ? feedback.correctIndex : null}
                    explanation={feedback ? feedback.explanation : undefined}
                    pending={retryChoice !== null && !feedback}
                    mode="instant"
                    showMeta={false}
                    showBookmark={false}
                    keyboard={false}
                    className="!p-4 !shadow-none sm:!p-5"
                  />
                  {retryChoice !== null && feedback && (
                    <div className="mt-3 flex flex-wrap gap-2" aria-live="polite">
                      {retryCorrect && mistake.status !== 'mastered' && (
                        <Button size="sm" variant="gold" onClick={markMastered} leftIcon={<Trophy className="h-4 w-4" />}>
                          {t('practice.mistakes.retry.markMastered')}
                        </Button>
                      )}
                      <Button size="sm" variant="subtle" onClick={startRetry} leftIcon={<RotateCcw className="h-4 w-4" />}>
                        {t('practice.mistakes.retry.again')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRetrying(false)}>
                        {t('practice.mistakes.retry.done')}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-4 border-t border-primary/5 pt-4 md:flex-row md:items-center md:justify-between">
                <div role="radiogroup" aria-label={t('practice.mistakes.statusLabel')} className="inline-flex w-full rounded-xl bg-primary/5 p-1 md:w-auto">
                  {STATUSES.map((s) => {
                    const on = mistake.status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => changeStatus(s)}
                        className={cn(
                          'flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition md:flex-none',
                          on ? statusStyle[s] : 'text-muted hover:text-primary',
                        )}
                      >
                        {t(`practice.mistakes.status.${s}`)}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!retrying && (
                    <Button size="sm" onClick={startRetry} leftIcon={<RotateCcw className="h-4 w-4" />}>
                      {t('practice.mistakes.retry.cta')}
                    </Button>
                  )}
                  {lessonId && (
                    <Button size="sm" variant="outline" to={`/student/lesson/${lessonId}`} leftIcon={<BookOpen className="h-4 w-4" />}>
                      {t('practice.mistakes.goToLesson')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

function AnswerBox({ kind, label, text }: { kind: 'wrong' | 'right'; label: string; text: string }) {
  const wrong = kind === 'wrong';
  return (
    <div className={cn('rounded-2xl border-2 p-3.5', wrong ? 'border-danger/30 bg-danger/5' : 'border-success/30 bg-success/5')}>
      <p className={cn('text-xs font-bold uppercase tracking-wider', wrong ? 'text-danger' : 'text-success')}>{label}</p>
      <p className="mt-1.5 flex items-start gap-2 font-medium text-ink">
        <span
          className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white', wrong ? 'bg-danger' : 'bg-success')}
          aria-hidden
        >
          {wrong ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
        </span>
        <span dir="auto">
          <MathText text={text} />
        </span>
      </p>
    </div>
  );
}
