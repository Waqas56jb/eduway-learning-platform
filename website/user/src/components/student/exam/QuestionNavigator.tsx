import { Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface QuestionNavigatorProps {
  order: string[];
  answers: Record<string, number | null>;
  flagged: string[];
  current: number;
  onJump: (index: number) => void;
}

/** Numbered grid of exam questions: answered (navy fill), unanswered (outline), flagged (gold border + flag), current (ring). */
export function QuestionNavigator({ order, answers, flagged, current, onJump }: QuestionNavigatorProps) {
  const { t } = useTranslation();
  const answered = order.filter((id) => answers[id] !== null && answers[id] !== undefined).length;

  return (
    <div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-primary/5 px-2 py-2">
          <dt className="text-[11px] font-medium text-muted">{t('practice.room.nav.answered')}</dt>
          <dd className="text-lg font-bold text-primary num">{answered}</dd>
        </div>
        <div className="rounded-xl bg-primary/5 px-2 py-2">
          <dt className="text-[11px] font-medium text-muted">{t('practice.room.nav.unanswered')}</dt>
          <dd className="text-lg font-bold text-primary num">{order.length - answered}</dd>
        </div>
        <div className="rounded-xl bg-accent/10 px-2 py-2">
          <dt className="text-[11px] font-medium text-muted">{t('practice.room.nav.flagged')}</dt>
          <dd className="text-lg font-bold text-[#8A6A1F] num">{flagged.length}</dd>
        </div>
      </dl>

      <nav aria-label={t('practice.room.nav.title')} className="mt-5">
        <ol className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-5">
          {order.map((id, i) => {
            const isAnswered = answers[id] !== null && answers[id] !== undefined;
            const isFlagged = flagged.includes(id);
            const isCurrent = i === current;
            const status = [
              isAnswered ? t('practice.room.nav.answered') : t('practice.room.nav.unanswered'),
              isFlagged ? t('practice.room.nav.flagged') : '',
            ]
              .filter(Boolean)
              .join(t('practice.room.nav.separator'));
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onJump(i)}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={t('practice.room.nav.item', { n: i + 1, status })}
                  className={cn(
                    'relative flex aspect-square w-full items-center justify-center rounded-xl border-2 text-sm font-bold transition num',
                    isAnswered ? 'border-primary bg-primary text-white' : 'border-primary/15 bg-white text-primary hover:border-primary/40',
                    isFlagged && (isAnswered ? 'border-accent' : 'border-accent bg-accent/15'),
                    isCurrent && 'ring-2 ring-accent ring-offset-2',
                  )}
                >
                  {i + 1}
                  {isFlagged && (
                    <Flag className="absolute -end-1.5 -top-1.5 h-4 w-4 rounded-full bg-accent fill-primary p-[3px] text-primary shadow-soft" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted" aria-label={t('practice.room.nav.legend')}>
        <li className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded bg-primary" aria-hidden />
          {t('practice.room.nav.answered')}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded border-2 border-primary/20 bg-white" aria-hidden />
          {t('practice.room.nav.unanswered')}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded border-2 border-accent bg-accent/15" aria-hidden />
          {t('practice.room.nav.flagged')}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded ring-2 ring-accent ring-offset-1" aria-hidden />
          {t('practice.room.nav.current')}
        </li>
      </ul>
    </div>
  );
}
