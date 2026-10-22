import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FieldShellProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: ReactNode;
  id: string;
  children: ReactNode;
  className?: string;
}

function FieldShell({ label, hint, error, optional, id, children, className }: FieldShellProps) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={id} className="mb-1.5 flex items-center justify-between text-sm font-semibold text-primary">
          <span>{label}</span>
          {optional && <span className="text-xs font-normal text-muted">{optional}</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: ReactNode;
  icon?: ReactNode;
  /** Element rendered at the end of the input (e.g. a country code or button). */
  suffix?: ReactNode;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, optional, icon, suffix, className, wrapperClassName, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} id={fid} className={wrapperClassName}>
      {/* Wrapper follows the input's own dir so a dir="ltr" field in an RTL page keeps icon + padding on the same side. */}
      <div className="relative" dir={rest.dir}>
        {icon && <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-4 text-muted">{icon}</span>}
        <input
          ref={ref}
          id={fid}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
          className={cn('field', icon && 'ps-11', suffix && 'pe-14', error && 'border-danger focus:border-danger focus:ring-danger/15', className)}
          {...rest}
        />
        {suffix && <span className="absolute inset-y-0 end-0 flex items-center pe-3">{suffix}</span>}
      </div>
    </FieldShell>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: ReactNode;
  wrapperClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, optional, className, wrapperClassName, id, children, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} id={fid} className={wrapperClassName}>
      <div className="relative">
        <select
          ref={ref}
          id={fid}
          aria-invalid={!!error || undefined}
          className={cn('field cursor-pointer appearance-none pe-10', error && 'border-danger', className)}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute end-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      </div>
    </FieldShell>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: ReactNode;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, optional, className, wrapperClassName, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} id={fid} className={wrapperClassName}>
      <textarea
        ref={ref}
        id={fid}
        aria-invalid={!!error || undefined}
        className={cn('field min-h-[120px] resize-y', error && 'border-danger', className)}
        {...rest}
      />
    </FieldShell>
  );
});

export const Checkbox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string }
>(function Checkbox({ label, error, className, ...rest }, ref) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm text-ink">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-md border-primary/20 accent-[#0B1F3A]"
          aria-invalid={!!error || undefined}
          {...rest}
        />
        <span>{label}</span>
      </label>
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
