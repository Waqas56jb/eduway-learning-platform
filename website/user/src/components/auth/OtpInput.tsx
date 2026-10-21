import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface OtpInputHandle {
  focus: (index?: number) => void;
}

interface OtpInputProps {
  /** One entry per box; empty string = unfilled. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Fired once every box holds a digit. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  success?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
}

/**
 * Segmented one-time-code input: auto-advance, backspace to previous box, arrow-key navigation and
 * paste / SMS autofill of the whole code. Always laid out left-to-right, like the digits in the SMS.
 */
export const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(function OtpInput(
  { value, onChange, onComplete, disabled, invalid, success, autoFocus = true, describedBy },
  ref,
) {
  const { t } = useTranslation();
  const length = value.length;
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const focusAt = (i: number) => {
    const el = inputs.current[Math.max(0, Math.min(length - 1, i))];
    el?.focus();
    el?.select();
  };

  useImperativeHandle(ref, () => ({ focus: (i = 0) => focusAt(i) }));

  useEffect(() => {
    if (autoFocus) focusAt(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (next: string[]) => {
    onChange(next);
    if (next.every((d) => d !== '')) onComplete?.(next.join(''));
  };

  /** Writes `digits` starting at box `from` (used for typing, paste and autofill). */
  const fillFrom = (from: number, digits: string) => {
    const next = [...value];
    let i = from;
    for (const d of digits) {
      if (i >= length) break;
      next[i++] = d;
    }
    commit(next);
    focusAt(Math.min(i, length - 1));
  };

  const handleChange = (i: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      const next = [...value];
      next[i] = '';
      onChange(next);
      return;
    }
    // A full code arriving in one box (SMS autofill) fills everything from the start.
    if (digits.length >= length) fillFrom(0, digits.slice(0, length));
    // Typing over an already-filled box: keep only the newly typed digit.
    else if (digits.length === 2 && value[i]) fillFrom(i, digits.startsWith(value[i]) ? digits.slice(1) : digits[0]);
    else fillFrom(i, digits);
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Backspace': {
        e.preventDefault();
        const next = [...value];
        if (next[i]) {
          next[i] = '';
          onChange(next);
        } else if (i > 0) {
          next[i - 1] = '';
          onChange(next);
          focusAt(i - 1);
        }
        break;
      }
      case 'Delete': {
        e.preventDefault();
        const next = [...value];
        next[i] = '';
        onChange(next);
        break;
      }
      case 'ArrowLeft':
        e.preventDefault();
        focusAt(i - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        focusAt(i + 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(length - 1);
        break;
      default:
        break;
    }
  };

  const handlePaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!digits) return;
    e.preventDefault();
    fillFrom(digits.length >= length ? 0 : i, digits.slice(0, length));
  };

  return (
    <div
      dir="ltr"
      role="group"
      aria-label={t('auth.verify.groupLabel')}
      aria-describedby={describedBy}
      className="flex items-center justify-center gap-2 sm:gap-3"
    >
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          value={digit}
          disabled={disabled}
          aria-label={t('auth.verify.digitLabel', { n: i + 1, total: length })}
          aria-invalid={invalid || undefined}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.target.select()}
          className={cn(
            'num h-14 w-11 rounded-xl border-2 bg-white text-center text-2xl font-bold text-primary shadow-sm transition-all duration-200 sm:h-16 sm:w-14',
            'focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:opacity-60',
            invalid
              ? 'border-danger/70 bg-danger/5'
              : success
                ? 'border-success/60 bg-success/5'
                : digit
                  ? 'border-primary/30'
                  : 'border-primary/10',
          )}
        />
      ))}
    </div>
  );
});
