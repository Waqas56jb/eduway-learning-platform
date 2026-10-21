import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { activityHeatmap } from '@/data';
import { useLang } from '@/hooks/useLang';

/** cream → gold → navy */
const LEVEL_COLORS = ['#EFEAE0', '#F2E3B8', '#E6C77A', '#C9A24A', '#0B1F3A'];

type Cell = { date: string; level: number } | null;

/**
 * GitHub-style activity grid: one column per week, one row per weekday (Saturday first,
 * as the Iraqi school week starts on Saturday). Columns follow the reading direction.
 */
export function ActivityHeatmap() {
  const { t } = useTranslation();
  const { fmtDate, isRtl } = useLang();
  const scrollRef = useRef<HTMLDivElement>(null);

  const weeks = useMemo(() => {
    const first = new Date(`${activityHeatmap[0].date}T12:00:00Z`);
    const lead = (first.getUTCDay() + 1) % 7; // Sat = 0
    const cells: Cell[] = [...Array<Cell>(lead).fill(null), ...activityHeatmap];
    while (cells.length % 7) cells.push(null);
    const out: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, []);

  const monthLabels = useMemo(() => {
    let prev = '';
    return weeks.map((w) => {
      const firstDay = w.find(Boolean);
      if (!firstDay) return '';
      const m = firstDay.date.slice(0, 7);
      if (m === prev) return '';
      prev = m;
      return fmtDate(`${firstDay.date}T12:00:00Z`, { month: 'short' });
    });
  }, [weeks, fmtDate]);

  // 2026-10-17 is a Saturday — used only to localise weekday names.
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        i % 2 === 0 ? fmtDate(new Date(Date.UTC(2026, 9, 17 + i, 12)), { weekday: 'short' }) : '',
      ),
    [fmtDate],
  );

  const active = activityHeatmap.filter((d) => d.level > 0).length;

  // Show the most recent weeks first on narrow screens.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = isRtl ? -el.scrollWidth : el.scrollWidth;
  }, [isRtl]);

  return (
    <div>
      <div ref={scrollRef} className="scrollbar-none overflow-x-auto pb-1">
        <div
          role="img"
          aria-label={t('account.progress.heatLabel', { active })}
          className="flex w-max gap-[3px] sm:w-full sm:max-w-[640px] sm:gap-1"
        >
          <div className="flex flex-col gap-[3px] pe-1.5 sm:gap-1">
            <span className="h-4 shrink-0" />
            {weekdayLabels.map((d, i) => (
              <span key={i} className="flex h-3.5 items-center text-[10px] leading-none text-muted sm:h-auto sm:flex-1">
                {d}
              </span>
            ))}
          </div>
          {weeks.map((w, wi) => (
            <div key={wi} className="flex flex-col gap-[3px] sm:min-w-0 sm:flex-1 sm:gap-1">
              <span className="relative h-4 shrink-0">
                {monthLabels[wi] && (
                  <span className="absolute start-0 top-0 whitespace-nowrap text-[10px] font-medium text-muted">
                    {monthLabels[wi]}
                  </span>
                )}
              </span>
              {w.map((c, di) =>
                c ? (
                  <span
                    key={di}
                    title={`${fmtDate(`${c.date}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long' })} — ${t(`account.progress.levels.${c.level}`)}`}
                    className="block aspect-square h-3.5 w-3.5 rounded-[4px] ring-1 ring-inset ring-black/[0.03] transition-transform hover:scale-125 sm:h-auto sm:w-full sm:rounded-[5px]"
                    style={{ backgroundColor: LEVEL_COLORS[c.level] }}
                  />
                ) : (
                  <span key={di} className="block aspect-square h-3.5 w-3.5 sm:h-auto sm:w-full" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span className="font-semibold text-primary">{t('account.progress.activeDays', { n: active })}</span>
        <span className="flex items-center gap-1.5">
          {t('account.progress.less')}
          {LEVEL_COLORS.map((c, i) => (
            <span
              key={c}
              title={t(`account.progress.levels.${i}`)}
              className="h-3 w-3 rounded-[3px] ring-1 ring-inset ring-black/[0.03]"
              style={{ backgroundColor: c }}
            />
          ))}
          {t('account.progress.more')}
        </span>
      </div>
    </div>
  );
}
