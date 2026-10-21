import { motion } from 'framer-motion';
import { Play, Star, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge, Button } from '@/components/ui';
import { getSubject } from '@/data';
import { useLang } from '@/hooks/useLang';
import { useStudent } from '@/hooks/useProgress';
import { cn } from '@/lib/utils';
import type { Question } from '@/types';
import { difficultyTone, tagLabel } from './utils';

/** Compact question card for bank results: preview text, meta, tags and a bookmark toggle. */
export function QuestionPreviewCard({ question, onPractice }: { question: Question; onPractice: (q: Question) => void }) {
  const { t } = useTranslation();
  const { l } = useLang();
  const { isBookmarked, toggleBookmark } = useStudent();
  const subject = getSubject(question.subjectId);
  const marked = isBookmarked(question.id);

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card group relative flex flex-col gap-4 p-5 transition-shadow duration-200 hover:shadow-lift"
      style={subject ? { borderInlineStartColor: subject.color, borderInlineStartWidth: 3 } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {subject && <Badge color={subject.color}>{l(subject.name)}</Badge>}
          <Badge tone={difficultyTone(question.difficulty)} dot>
            {t(`common.difficulty.${question.difficulty}`)}
          </Badge>
          <span className="text-xs font-medium text-muted">{l(question.topic)}</span>
        </div>
        <button
          type="button"
          onClick={() => toggleBookmark(question.id)}
          aria-pressed={marked}
          aria-label={marked ? t('common.removeBookmark') : t('common.bookmark')}
          className="-m-1.5 rounded-full p-1.5 transition hover:bg-accent/10"
        >
          <Star className={cn('h-5 w-5 transition', marked ? 'fill-accent text-accent' : 'text-muted')} />
        </button>
      </div>

      <h3 dir="auto" className="line-clamp-2 font-sans text-base font-semibold leading-relaxed tracking-normal text-primary">
        {l(question.text)}
      </h3>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-1.5" aria-label={t('practice.bank.filters.tags')}>
          {question.tags.slice(0, 3).map((tag) => (
            <li key={tag} className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-[11px] font-medium text-muted">
              <Tag className="h-3 w-3" aria-hidden />
              {tagLabel(t, tag)}
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          variant="subtle"
          onClick={() => onPractice(question)}
          leftIcon={<Play className="h-3.5 w-3.5 rtl:-scale-x-100" />}
          aria-label={t('practice.bank.tryOneLabel', { text: l(question.text) })}
        >
          {t('practice.bank.tryOne')}
        </Button>
      </div>
    </motion.article>
  );
}
