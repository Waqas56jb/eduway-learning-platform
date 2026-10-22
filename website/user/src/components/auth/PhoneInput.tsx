import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Search } from 'lucide-react';
import { forwardRef, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import {
  applyPhoneInput,
  countryName,
  countryOptions,
  dialCode,
  examplePlaceholder,
  filterCountries,
  flagEmoji,
  PINNED_COUNTRIES,
  type CountryOption,
  type PhoneValue,
} from '@/lib/phone';

interface PhoneInputProps {
  label: string;
  value: PhoneValue;
  onChange: (value: PhoneValue) => void;
  onBlur?: () => void;
  name?: string;
  error?: string;
  /** Shown under the field when there is no error. */
  hint?: ReactNode;
  /** Placeholder for the national number; defaults to an example mobile number of the selected country. */
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
}

const dropdown = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 6, scale: 0.98 },
  transition: { duration: 0.18 },
};

/**
 * International mobile field: a country button (flag + dial code) opening a searchable country list, and the
 * national number formatted as you type. The value is `{ country, national }`; convert with `phoneToE164`.
 * The number row is always left-to-right (also in Arabic); the country list follows the page direction.
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { label, value, onChange, onBlur, name, error, hint, placeholder, autoFocus, disabled, id },
  ref,
) {
  const { t } = useTranslation();
  const { lang, dir } = useLang();
  const auto = useId();
  const fid = id ?? auto;
  const listId = `${fid}-countries`;
  const described = error ? `${fid}-err` : hint ? `${fid}-hint` : undefined;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [padStart, setPadStart] = useState(112);

  // Keep the number clear of the country button whatever its width (+1 … +1684).
  useLayoutEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    const update = () => setPadStart(el.offsetWidth + 14);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = useMemo(() => countryOptions(lang), [lang]);
  const results = useMemo(() => filterCountries(all, query), [all, query]);
  const showSections = !query.trim();
  const pinnedCount = showSections ? PINNED_COUNTRIES.length : 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const idx = all.findIndex((o) => o.code === value.country);
    setActive(idx < 0 ? 0 : idx);
    const id = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
    // Only when the list opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, results]);

  const pick = (o: CountryOption) => {
    setOpen(false);
    // Re-format what was typed for the new country.
    onChange(applyPhoneInput(value.national.startsWith('+') ? '' : value.national, { country: o.code, national: '' }));
    window.setTimeout(() => (document.getElementById(fid) as HTMLInputElement | null)?.focus(), 0);
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = results[active];
      if (o) pick(o);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  };

  const country = value.country;
  const selectedName = countryName(country, lang);
  const ph = placeholder ?? (examplePlaceholder(country) || undefined);

  const row = (o: CountryOption, i: number) => {
    const selected = o.code === country;
    return (
      <li
        key={o.code}
        id={`${listId}-${o.code}`}
        data-index={i}
        role="option"
        aria-selected={selected}
        onMouseEnter={() => setActive(i)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => pick(o)}
        className={cn(
          'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
          i === active ? 'bg-primary/5' : 'hover:bg-primary/5',
          selected && 'font-semibold text-primary',
        )}
      >
        <span className="text-lg leading-none" aria-hidden>
          {o.flag}
        </span>
        <span className="min-w-0 flex-1 truncate text-ink">{o.name}</span>
        <span dir="ltr" className="num shrink-0 text-muted">
          {o.dial}
        </span>
        {selected ? <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden /> : <span className="w-4 shrink-0" aria-hidden />}
      </li>
    );
  };

  return (
    <div className="w-full" ref={rootRef}>
      <label htmlFor={fid} className="mb-1.5 block text-sm font-semibold text-primary">
        {label}
      </label>
      <div className="relative">
        <div dir="ltr" className="relative">
          <button
            ref={buttonRef}
            type="button"
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && !open) {
                e.preventDefault();
                setOpen(true);
              }
            }}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-label={t('auth.phone.countryButton', { country: selectedName, dial: dialCode(country) })}
            title={selectedName}
            className="absolute inset-y-1.5 left-1.5 z-[1] flex items-center gap-1.5 rounded-lg bg-primary/5 px-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
          >
            <span className="text-base leading-none" aria-hidden>
              {flagEmoji(country)}
            </span>
            <span className="num">{dialCode(country)}</span>
            <ChevronDown className={cn('h-3.5 w-3.5 text-accent transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
          <input
            ref={ref}
            id={fid}
            name={name}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            autoFocus={autoFocus}
            disabled={disabled}
            value={value.national}
            placeholder={ph}
            onChange={(e) => onChange(applyPhoneInput(e.target.value, value))}
            onBlur={onBlur}
            aria-invalid={!!error || undefined}
            aria-describedby={described}
            style={{ paddingLeft: padStart }}
            className={cn('field num text-left text-base tracking-wide', error && 'border-danger focus:border-danger focus:ring-danger/15')}
          />
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              {...dropdown}
              dir={dir}
              className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-primary/5 bg-white p-2 shadow-lift"
            >
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onSearchKey}
                  placeholder={t('auth.phone.search')}
                  aria-label={t('auth.phone.search')}
                  aria-controls={listId}
                  aria-activedescendant={results[active] ? `${listId}-${results[active].code}` : undefined}
                  autoComplete="off"
                  className="w-full rounded-xl border border-primary/10 bg-white py-2.5 pe-3 ps-9 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15"
                />
              </div>
              <ul ref={listRef} id={listId} role="listbox" aria-label={t('auth.phone.selectCountry')} className="mt-2 max-h-64 overflow-y-auto overscroll-contain sm:max-h-72">
                {results.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-muted">{t('auth.phone.noResults')}</li>
                ) : showSections ? (
                  <>
                    <li role="presentation" className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted">
                      {t('auth.phone.suggested')}
                    </li>
                    {results.slice(0, pinnedCount).map((o, i) => row(o, i))}
                    <li role="presentation" className="mt-1 border-t border-primary/5 px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      {t('auth.phone.allCountries')}
                    </li>
                    {results.slice(pinnedCount).map((o, i) => row(o, i + pinnedCount))}
                  </>
                ) : (
                  results.map((o, i) => row(o, i))
                )}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {error ? (
        <p id={`${fid}-err`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fid}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
