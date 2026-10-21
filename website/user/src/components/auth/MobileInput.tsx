import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface MobileInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/** Iraqi mobile field with a fixed +964 chip. The number itself is always typed left-to-right. */
export const MobileInput = forwardRef<HTMLInputElement, MobileInputProps>(function MobileInput(
  { label, error, hint, className, id, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const auto = useId();
  const fid = id ?? auto;
  const described = error ? `${fid}-err` : hint ? `${fid}-hint` : undefined;
  return (
    <div className="w-full">
      <label htmlFor={fid} className="mb-1.5 block text-sm font-semibold text-primary">
        {label}
      </label>
      <div dir="ltr" className="relative">
        <span className="pointer-events-none absolute inset-y-1.5 left-1.5 flex items-center gap-1.5 rounded-lg bg-primary/5 px-2.5 text-sm font-semibold text-primary">
          <Smartphone className="h-4 w-4 text-accent" aria-hidden />
          <span className="num">+964</span>
          <span className="sr-only">{t('auth.mobile.prefixLabel')}</span>
        </span>
        <input
          ref={ref}
          id={fid}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          aria-invalid={!!error || undefined}
          aria-describedby={described}
          className={cn(
            'field num pl-[6.5rem] text-left text-base tracking-wide',
            error && 'border-danger focus:border-danger focus:ring-danger/15',
            className,
          )}
          {...rest}
        />
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
