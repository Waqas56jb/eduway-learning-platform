import { motion } from 'framer-motion';
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  /** "pill" = navy segmented control; "line" = underline tabs */
  variant?: 'pill' | 'line';
  ariaLabel?: string;
  /** Stretch tabs to share the full width equally (good for 2–3 tabs on mobile). */
  stretch?: boolean;
}

/** Accessible tab list (arrow-key navigation). Panels are rendered by the caller. */
export function Tabs<T extends string>({ items, value, onChange, className, variant = 'pill', ariaLabel, stretch }: TabsProps<T>) {
  const group = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  // On narrow screens the tab bar scrolls horizontally: keep the newly selected tab in view
  // (scrolls only the tab bar itself, never the page; skipped on first render).
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const list = listRef.current;
    const tab = refs.current[items.findIndex((it) => it.id === value)];
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    const l = list.getBoundingClientRect();
    const r = tab.getBoundingClientRect();
    if (r.left < l.left) list.scrollBy({ left: r.left - l.left - 16, behavior: 'smooth' });
    else if (r.right > l.right) list.scrollBy({ left: r.right - l.right + 16, behavior: 'smooth' });
  }, [value, items]);

  const onKey = (e: KeyboardEvent, i: number) => {
    const rtl = document.documentElement.dir === 'rtl';
    let next = -1;
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) next = (i + 1) % items.length;
    if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) next = (i - 1 + items.length) % items.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(items[next].id);
      refs.current[next]?.focus();
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'scrollbar-none flex max-w-full overflow-x-auto',
        variant === 'pill' ? 'gap-1 rounded-2xl bg-primary/5 p-1' : 'gap-6 border-b border-primary/10',
        className,
      )}
    >
      {items.map((it, i) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            type="button"
            id={`${group}-${it.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold transition-colors',
              variant === 'pill' ? (stretch ? 'rounded-xl px-2.5 py-2.5 sm:px-4' : 'rounded-xl px-4 py-2.5') : 'min-h-[2.5rem] pb-3 pt-2',
              stretch && 'flex-1 justify-center sm:flex-none',
              active ? (variant === 'pill' ? 'text-white' : 'text-primary') : 'text-muted hover:text-primary',
            )}
          >
            {active && (
              <motion.span
                layoutId={`tab-${group}`}
                className={cn(
                  'absolute',
                  variant === 'pill' ? 'inset-0 rounded-xl bg-primary shadow-soft' : 'inset-x-0 -bottom-px h-0.5 rounded-full bg-accent',
                )}
                transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {it.icon}
              {it.label}
              {typeof it.count === 'number' && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[11px] leading-none num',
                    active && variant === 'pill' ? 'bg-white/15 text-white' : 'bg-primary/10 text-primary',
                  )}
                >
                  {it.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
