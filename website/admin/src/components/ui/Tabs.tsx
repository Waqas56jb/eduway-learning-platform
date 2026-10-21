import { useId, useRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';

export interface TabItem<K extends string = string> {
  key: K;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
}

interface TabsProps<K extends string> {
  tabs: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}

/** Underlined tab list with arrow-key navigation. Render the panel yourself based on `value`. */
export function Tabs<K extends string>({ tabs, value, onChange, className }: TabsProps<K>) {
  const group = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const rtl = document.documentElement.dir === 'rtl';
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    let n = -1;
    if (e.key === fwd) n = (i + 1) % tabs.length;
    if (e.key === back) n = (i - 1 + tabs.length) % tabs.length;
    if (n >= 0) {
      e.preventDefault();
      refs.current[n]?.focus();
      onChange(tabs[n].key);
    }
  };
  return (
    <div role="tablist" className={cn('scrollbar-none -mb-px flex gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((tab, i) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 px-3 pb-3 pt-2 text-sm font-medium transition-colors',
              active ? 'text-primary' : 'text-muted hover:text-ink',
            )}
          >
            {tab.icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{tab.icon}</span>}
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn('rounded-full px-1.5 text-[11px] font-semibold num', active ? 'bg-accent/15 text-[#8A6A1F] dark:text-accent' : 'bg-ink/5 text-muted')}>
                {tab.count}
              </span>
            )}
            {active && (
              <motion.span layoutId={`tab-${group}`} className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-accent" transition={{ duration: 0.2 }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

interface SegmentedProps<K extends string> {
  options: { value: K; label: ReactNode }[];
  value: K;
  onChange: (v: K) => void;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

/** Compact pill toggle group. */
export function Segmented<K extends string>({ options, value, onChange, size = 'md', className, ...aria }: SegmentedProps<K>) {
  return (
    <div role="radiogroup" aria-label={aria['aria-label']} className={cn('inline-flex rounded-lg border border-line bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md font-medium transition-all duration-200',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            o.value === value ? 'bg-surface text-primary shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
