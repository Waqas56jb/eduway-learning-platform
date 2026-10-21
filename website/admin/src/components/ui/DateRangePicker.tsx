import { useState } from 'react';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { fmtDate } from '@/utils/format';
import { rangeFromPreset, useUi, type DateRange, type RangePreset } from '@/store/ui';
import { Button } from './Button';
import { Popover } from './Menu';

const PRESETS: Exclude<RangePreset, 'custom'>[] = ['today', '7d', '30d', '90d', 'ytd', '12m'];

interface Props {
  /** Controlled value; defaults to the global range in the UI store. */
  value?: DateRange;
  onChange?: (r: DateRange) => void;
  className?: string;
  align?: 'start' | 'end';
}

export function DateRangePicker({ value, onChange, className, align = 'end' }: Props) {
  const { t } = useTranslation();
  const globalRange = useUi((s) => s.range);
  const setGlobal = useUi((s) => s.setRange);
  const range = value ?? globalRange;
  const set = onChange ?? setGlobal;
  const [from, setFrom] = useState(range.from.slice(0, 10));
  const [to, setTo] = useState(range.to.slice(0, 10));

  const label =
    range.preset === 'custom' ? `${fmtDate(range.from, 'd MMM')} – ${fmtDate(range.to, 'd MMM yyyy')}` : t(`dateRange.${range.preset}`);

  return (
    <Popover
      className={className}
      align={align}
      panelClassName="w-72 p-2"
      trigger={({ toggle, open }) => (
        <Button variant="secondary" size="sm" onClick={toggle} aria-expanded={open} aria-haspopup="dialog" icon={<CalendarDays className="h-4 w-4 text-accent" />}>
          <span className="num">{label}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted transition', open && 'rotate-180')} />
        </Button>
      )}
    >
      {(close) => (
        <div>
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{t('dateRange.label')}</div>
          <div className="grid grid-cols-2 gap-1">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  set(rangeFromPreset(p));
                  close();
                }}
                className={cn(
                  'flex items-center justify-between rounded-lg px-2.5 py-2 text-start text-xs transition',
                  range.preset === p ? 'bg-accent/10 font-semibold text-primary' : 'text-ink hover:bg-ink/5',
                )}
              >
                {t(`dateRange.${p}`)}
                {range.preset === p && <Check className="h-3.5 w-3.5 text-accent" />}
              </button>
            ))}
          </div>
          <div className="mt-2 border-t border-line px-1 pt-2">
            <div className="mb-1.5 text-xs font-medium text-ink">{t('dateRange.custom')}</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-muted">
                {t('common.from')}
                <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="field mt-1 h-8 px-2 text-xs" />
              </label>
              <label className="text-[11px] text-muted">
                {t('common.to')}
                <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="field mt-1 h-8 px-2 text-xs" />
              </label>
            </div>
            <Button
              size="sm"
              className="mt-2 w-full"
              disabled={!from || !to || from > to}
              onClick={() => {
                set({ preset: 'custom', from: new Date(from).toISOString(), to: new Date(`${to}T23:59:59`).toISOString() });
                close();
              }}
            >
              {t('actions.apply')}
            </Button>
          </div>
        </div>
      )}
    </Popover>
  );
}
