import { forwardRef, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getExampleNumber } from 'libphonenumber-js/max';
import examples from 'libphonenumber-js/mobile/examples';
import { cn } from '@/utils/cn';
import { useClickOutside } from '@/hooks/useMisc';
import { useLang } from '@/hooks/useLocale';
import {
  DEFAULT_COUNTRY,
  countryOptions,
  formatNational,
  parseInternational,
  splitPhone,
  type CountryCode,
  type CountryOption,
} from '@/utils/phone';

export interface PhoneInputProps {
  id?: string;
  name?: string;
  /** Stored value — E.164 (`+9647701234567`) or any legacy/local format. */
  value: string | null | undefined;
  /** Receives the E.164 number ('' when cleared). */
  onChange: (e164: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  defaultCountry?: CountryCode;
  className?: string;
}

const digitsOf = (s: string) => s.replace(/\D/g, '');

/**
 * International phone field: searchable country picker (flag + dial code) and a
 * national-number input formatted as you type. Always LTR; emits E.164.
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { id, name, value, onChange, onBlur, invalid, disabled, placeholder, defaultCountry = DEFAULT_COUNTRY, className },
  ref,
) {
  const { t, i18n } = useTranslation();
  const lang = useLang();
  const listId = useId();
  const [country, setCountry] = useState<CountryCode>(() => splitPhone(value, defaultCountry).country);
  const [national, setNational] = useState(() => splitPhone(value, defaultCountry).national);
  const lastEmitted = useRef<string>(value ?? '');

  // Sync when the form resets / loads a different value from outside.
  useEffect(() => {
    const v = value ?? '';
    if (v === lastEmitted.current) return;
    lastEmitted.current = v;
    const s = splitPhone(v, defaultCountry);
    setCountry(s.country);
    setNational(s.national);
  }, [value, defaultCountry]);

  const emit = (v: string) => {
    lastEmitted.current = v;
    onChange(v);
  };

  const onType = (text: string) => {
    if (text.trim().startsWith('+')) {
      const r = parseInternational(text.trim());
      if (r.country) setCountry(r.country);
      setNational(r.national);
      emit(r.e164);
      return;
    }
    let digits = digitsOf(text);
    // Backspace over a formatting character (space, dash, bracket) removes the digit before it.
    if (text.length < national.length && digits === digitsOf(national)) digits = digits.slice(0, -1);
    const r = formatNational(digits, country);
    setNational(r.display);
    emit(r.e164);
  };

  const pickCountry = (c: CountryCode) => {
    setCountry(c);
    const r = formatNational(national, c);
    setNational(r.display);
    emit(r.e164);
    inputRef.current?.focus();
  };

  const inputRef = useRef<HTMLInputElement | null>(null);
  const setRefs = (el: HTMLInputElement | null) => {
    inputRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  const example = useMemo(() => {
    try {
      return getExampleNumber(country, examples)?.formatNational() ?? '';
    } catch {
      return '';
    }
  }, [country]);

  // ── Country picker ─────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useClickOutside([root], () => setOpen(false), open);

  const all = useMemo(() => {
    const nameKey = lang === 'ar' ? 'name_ar' : 'name_en';
    const list = [...countryOptions()].sort((a, b) => a[nameKey].localeCompare(b[nameKey], lang));
    const pinned = list.find((c) => c.code === defaultCountry);
    return pinned ? [pinned, ...list.filter((c) => c !== pinned)] : list;
  }, [lang, defaultCountry]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    const qDigits = q.replace(/^\+/, '');
    return all.filter(
      (c) =>
        c.name_en.toLowerCase().includes(q) ||
        c.name_ar.includes(query.trim()) ||
        c.code.toLowerCase() === q ||
        (/^\+?\d+$/.test(q) && c.dial.startsWith(qDigits)),
    );
  }, [all, query]);

  const current = all.find((c) => c.code === country);

  const openPicker = () => {
    if (disabled) return;
    setQuery('');
    setActive(Math.max(0, all.findIndex((c) => c.code === country)));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (c: CountryOption) => {
    setOpen(false);
    pickCountry(c.code);
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = filtered[active];
      if (c) choose(c);
    }
  };

  const label = (c: CountryOption) => (lang === 'ar' ? c.name_ar : c.name_en);

  return (
    <div
      ref={root}
      dir="ltr"
      className={cn('relative flex gap-2', className)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('phone.country')}
        title={current ? `${label(current)} (+${current.dial})` : undefined}
        className={cn('field flex w-auto shrink-0 items-center gap-1.5 px-2.5', invalid && 'field-invalid')}
      >
        <span className="text-base leading-none" aria-hidden>
          {current?.flag}
        </span>
        <span className="num text-ink">+{current?.dial}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted transition-transform duration-200', open && 'rotate-180')} aria-hidden />
      </button>
      <input
        ref={setRefs}
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        dir="ltr"
        disabled={disabled}
        value={national}
        placeholder={placeholder ?? example}
        onChange={(e) => onType(e.target.value)}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
        className={cn('field num min-w-0 flex-1', invalid && 'field-invalid')}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            dir={i18n.dir()}
            className="absolute start-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-1.5 shadow-lift"
          >
            <div className="relative mb-1.5">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted" aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onSearchKey}
                placeholder={t('phone.searchCountry')}
                aria-label={t('phone.searchCountry')}
                aria-controls={listId}
                className="field h-9 ps-9"
              />
            </div>
            <ul ref={listRef} id={listId} role="listbox" aria-label={t('phone.country')} className="scrollbar-thin max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="px-2.5 py-6 text-center text-sm text-muted">{t('phone.noCountry')}</li>
              ) : (
                filtered.map((c, i) => (
                  <li key={c.code} role="option" aria-selected={c.code === country} data-idx={i}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(c)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm transition-colors',
                        i === active ? 'bg-ink/5' : 'hover:bg-ink/5',
                        c.code === country ? 'text-primary' : 'text-ink',
                      )}
                    >
                      <span className="text-base leading-none" aria-hidden>
                        {c.flag}
                      </span>
                      <span className="flex-1 truncate">{label(c)}</span>
                      <span className="num text-xs text-muted" dir="ltr">
                        +{c.dial}
                      </span>
                      {c.code === country && <Check className="h-4 w-4 text-accent" aria-hidden />}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
