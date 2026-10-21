import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  htmlFor?: string;
  children: ReactNode;
}

/** Label + control + hint/error wrapper. */
export function Field({ label, hint, error, required, className, htmlFor, children }: FieldProps) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && <span className="ms-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  suffix?: ReactNode;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, suffix, invalid, className, ...rest },
  ref,
) {
  if (!icon && !suffix) {
    return <input ref={ref} className={cn('field', invalid && 'field-invalid', className)} aria-invalid={invalid || undefined} {...rest} />;
  }
  return (
    <div className={cn('relative', className)}>
      {icon && (
        <span className="pointer-events-none absolute inset-y-0 start-0 grid w-10 place-items-center text-muted [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        className={cn('field', icon && 'ps-9', suffix && 'pe-14', invalid && 'field-invalid')}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-3 text-xs font-medium text-muted">
          {suffix}
        </span>
      )}
    </div>
  );
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options?: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, invalid, className, children, ...rest },
  ref,
) {
  return (
    <div className={cn('relative', className)}>
      <select
        ref={ref}
        className={cn('field cursor-pointer appearance-none pe-9', invalid && 'field-invalid')}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, rows = 4, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn('field h-auto py-2.5 leading-relaxed', invalid && 'field-invalid', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});

/** Generates a stable id for label/input pairing when none is given. */
export const useFieldId = (id?: string) => {
  const gen = useId();
  return id ?? gen;
};
