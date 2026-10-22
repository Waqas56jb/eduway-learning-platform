import { AnimatePresence, motion } from 'framer-motion';
import { Check, Lightbulb, Loader2, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui';
import { useBookmarks } from '@/api/bookmarks';
import { useSubjectLookup } from '@/api/catalog';
import type { Localized, QuestionPublic, QuestionReview } from '@/api/types';
import { Formula, MathText, RichText } from '@/components/ui/MathText';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';

const isReview = (q: QuestionPublic | QuestionReview): q is QuestionReview => 'correctIndex' in q;

const LETTERS = { en: ['A', 'B', 'C', 'D', 'E'], ar: ['أ', 'ب', 'ج', 'د', 'هـ'] };

export interface QuizCardProps {
  /** Served question (QuestionPublic) — or QuestionReview when the answer may be shown. */
  question: QuestionPublic | QuestionReview;
  /** Selected option index (index in `question.options` as served). */
  selected: number | null;
  onSelect: (index: number) => void;
  /**
   * Correct option index revealed by the server (AnswerFeedback.correctIndex) for "instant" mode.
   * Falls back to `question.correctIndex` for QuestionReview payloads. Unknown → no feedback yet.
   */
  correctIndex?: number | null;
  /** Explanation from the server feedback (null when the quiz rule hides explanations). */
  explanation?: Localized | null;
  /** Answer submitted, waiting for the server's verdict. */
  pending?: boolean;
  /**
   * "instant": after selecting, the answer locks and correct/incorrect feedback + explanation show.
   * "exam": selection only, no feedback (can change answer).
   * "review": read-only; shows the selected and correct answers.
   */
  mode?: 'instant' | 'exam' | 'review';
  /** Display order of option indices (for randomized options). Defaults to natural order. */
  order?: number[];
  index?: number;
  total?: number;
  showBookmark?: boolean;
  showMeta?: boolean;
  className?: string;
  /** Enable keyboard shortcuts 1-4 / A-D. */
  keyboard?: boolean;
  /** Hide the question text + formula header (when the caller already shows it above the card). */
  hideText?: boolean;
}

export function QuizCard({
  question,
  selected,
  onSelect,
  mode = 'instant',
  order,
  index,
  total,
  showBookmark = true,
  showMeta = true,
  className,
  keyboard = true,
  hideText = false,
  correctIndex: correctIndexProp,
  explanation: explanationProp,
  pending = false,
}: QuizCardProps) {
  const { t } = useTranslation();
  const { l, lang } = useLang();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const subjectOf = useSubjectLookup();
  const subject = subjectOf(question.subjectSlug) ?? subjectOf(question.subjectId);
  const opts = order ?? question.options.map((_, i) => i);
  const locked = mode === 'review' || (mode === 'instant' && selected !== null) || pending;
  const correctIndex = correctIndexProp ?? (isReview(question) ? question.correctIndex : null);
  const explanation = explanationProp !== undefined ? explanationProp : isReview(question) ? question.explanation : null;
  const [explainOpen, setExplainOpen] = useState(mode === 'review');
  const bookmarked = isBookmarked(question.id);

  useEffect(() => setExplainOpen(mode === 'review'), [question.id, mode]);

  useEffect(() => {
    if (!keyboard || locked) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      const letter = 'abcde'.indexOf(e.key.toLowerCase());
      const pos = n >= 1 && n <= opts.length ? n - 1 : letter >= 0 && letter < opts.length ? letter : -1;
      if (pos >= 0) {
        e.preventDefault();
        onSelect(opts[pos]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, locked, opts, onSelect]);

  const answered = selected !== null;
  const isCorrect = selected === correctIndex;
  const showFeedback = mode !== 'exam' && answered && correctIndex !== null && correctIndex !== undefined;

  return (
    <div className={cn('card p-5 sm:p-7', className)}>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {typeof index === 'number' && typeof total === 'number' && (
            <span className="text-sm font-semibold text-muted num">
              {t('common.questionOf', { current: index + 1, total })}
            </span>
          )}
          {showMeta && subject && (
            <>
              <Badge color={subject.color}>{l(subject.name)}</Badge>
              <Badge tone={question.difficulty === 'easy' ? 'success' : question.difficulty === 'medium' ? 'warning' : 'danger'}>
                {t(`common.difficulty.${question.difficulty}`)}
              </Badge>
            </>
          )}
        </div>
        {showBookmark && (
          <button
            type="button"
            onClick={() => toggleBookmark(question.id)}
            aria-pressed={bookmarked}
            aria-label={bookmarked ? t('common.removeBookmark') : t('common.bookmark')}
            className="-my-1 ms-auto shrink-0 rounded-full p-2 transition hover:bg-accent/10"
          >
            <Star className={cn('h-5 w-5 transition', bookmarked ? 'fill-accent text-accent' : 'text-muted')} />
          </button>
        )}
      </div>

      {!hideText && (
        <>
          <h3
            dir="auto"
            className="mt-4 text-start font-sans text-lg font-semibold leading-relaxed tracking-normal text-primary sm:text-xl"
          >
            <MathText text={l(question.text)} />
          </h3>
          {question.imageUrl && (
            <img src={question.imageUrl} alt="" loading="lazy" className="mt-3 max-h-72 rounded-xl border border-primary/5 object-contain" />
          )}
          {question.formula && (
            <div className="mt-3 rounded-xl bg-cream px-4 py-2">
              <Formula tex={question.formula} block className="!my-1" />
            </div>
          )}
        </>
      )}

      <div role="radiogroup" aria-label={l(question.text)} className={cn('grid gap-3', hideText ? 'mt-4' : 'mt-6')}>
        {opts.map((oi, pos) => {
          const opt = question.options[oi];
          const isSel = selected === oi;
          const isAns = oi === correctIndex;
          const state =
            showFeedback && isAns ? 'correct' : showFeedback && isSel && !isAns ? 'wrong' : isSel ? 'selected' : 'idle';
          return (
            <motion.button
              key={oi}
              type="button"
              role="radio"
              aria-checked={isSel}
              disabled={locked}
              onClick={() => onSelect(oi)}
              whileTap={locked ? undefined : { scale: 0.99 }}
              animate={state === 'wrong' ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
              transition={{ duration: 0.4 }}
              className={cn(
                'group flex w-full items-center gap-4 rounded-2xl border-2 px-4 py-3.5 text-start transition-colors duration-200',
                state === 'idle' && 'border-primary/10 bg-white hover:border-accent/60 hover:bg-accent/5',
                state === 'selected' && 'border-primary bg-primary/5',
                state === 'correct' && 'border-success bg-success/10',
                state === 'wrong' && 'border-danger bg-danger/10',
                locked && state === 'idle' && 'opacity-60',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-colors',
                  state === 'idle' && 'bg-primary/5 text-primary group-hover:bg-accent/20',
                  state === 'selected' && 'bg-primary text-white',
                  state === 'correct' && 'bg-success text-white',
                  state === 'wrong' && 'bg-danger text-white',
                )}
              >
                {state === 'correct' ? (
                  <Check className="h-4 w-4" />
                ) : state === 'wrong' ? (
                  <X className="h-4 w-4" />
                ) : isSel && pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  LETTERS[lang][pos]
                )}
              </span>
              <span className="flex-1 text-start font-medium text-ink" dir="auto">
                <MathText text={l(opt.text)} />
              </span>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {showFeedback && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                'mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3',
                isCorrect ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
              )}
              role="status"
            >
              <span className="flex items-center gap-2 font-semibold">
                {isCorrect ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                {isCorrect ? t('common.correct') : t('common.incorrect')}
              </span>
              {explanation && (
                <button
                  type="button"
                  onClick={() => setExplainOpen((v) => !v)}
                  aria-expanded={explainOpen}
                  className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-accent"
                >
                  <Lightbulb className="h-4 w-4" />
                  {explainOpen ? t('common.hideExplanation') : t('common.showExplanation')}
                </button>
              )}
            </div>
            <AnimatePresence initial={false}>
              {explainOpen && explanation && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 rounded-2xl border border-accent/25 bg-accent/5 p-4 text-ink"
                >
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-accent">{t('common.explanation')}</p>
                  <RichText source={l(explanation)} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
