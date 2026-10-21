import { Clock, Wifi } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, formatClock } from '@/lib/utils';

interface ExamTimerProps {
  /** Absolute deadline (epoch ms). Remaining time is always derived from it, so refreshes never reset the clock. */
  endAt: number;
  onExpire: () => void;
  /** Freeze the display (e.g. after submission). */
  stopped?: boolean;
  className?: string;
}

const remainingFrom = (endAt: number) => Math.max(0, Math.ceil((endAt - Date.now()) / 1000));

/**
 * "Server-style" countdown: amber under 5 minutes, red + pulse under 1 minute,
 * with screen-reader announcements at the 5 and 1 minute marks.
 */
export function ExamTimer({ endAt, onExpire, stopped, className }: ExamTimerProps) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(() => remainingFrom(endAt));
  const [announce, setAnnounce] = useState('');
  const expired = useRef(false);
  const announced = useRef<{ five: boolean; one: boolean }>({ five: false, one: false });
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (stopped) return;
    const tick = () => {
      const r = remainingFrom(endAt);
      setRemaining(r);
      if (r <= 300 && r > 60 && !announced.current.five) {
        announced.current.five = true;
        setAnnounce(t('practice.timer.fiveLeft'));
      }
      if (r <= 60 && r > 0 && !announced.current.one) {
        announced.current.five = true;
        announced.current.one = true;
        setAnnounce(t('practice.timer.oneLeft'));
      }
      if (r === 0 && !expired.current) {
        expired.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [endAt, stopped, t]);

  const level = remaining <= 60 ? 'danger' : remaining <= 300 ? 'warning' : 'normal';

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div
        role="timer"
        aria-label={t('practice.timer.label', { time: formatClock(remaining) })}
        className={cn(
          'inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 font-bold tabular-nums transition-colors duration-300 sm:px-4 sm:py-2',
          level === 'normal' && 'border-primary/10 bg-primary text-white',
          level === 'warning' && 'border-warning/40 bg-warning/10 text-[#B45309]',
          level === 'danger' && 'animate-pulse border-danger/50 bg-danger text-white shadow-[0_0_0_4px_rgba(220,38,38,0.15)]',
        )}
      >
        <Clock className={cn('h-4 w-4', level === 'normal' && 'text-accent-light')} aria-hidden />
        <span className="text-base sm:text-lg num" dir="ltr">
          {formatClock(remaining)}
        </span>
      </div>
      <span className="mt-1 hidden items-center gap-1 text-[10px] font-medium text-muted sm:inline-flex">
        <Wifi className="h-3 w-3 text-success" aria-hidden />
        {t('practice.timer.synced')}
      </span>
      <span className="sr-only" aria-live="assertive" role="status">
        {announce}
      </span>
    </div>
  );
}
