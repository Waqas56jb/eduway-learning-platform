import { forwardRef, useEffect, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/utils/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  id?: string;
  'aria-label'?: string;
}

export function Switch({ checked, onChange, label, description, disabled, size = 'md', className, id, ...aria }: SwitchProps) {
  const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const knob = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const shift = size === 'sm' ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-5 rtl:-translate-x-5';
  const btn = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={aria['aria-label']}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
        track,
        checked ? 'bg-accent' : 'bg-ink/15',
      )}
    >
      <span className={cn('rounded-full bg-white shadow transition-transform duration-200', knob, checked && shift)} />
    </button>
  );
  if (!label) return <span className={className}>{btn}</span>;
  return (
    <label className={cn('flex cursor-pointer items-start justify-between gap-4', disabled && 'cursor-not-allowed', className)}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      {btn}
    </label>
  );
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  indeterminate?: boolean;
  label?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { indeterminate, label, className, checked, ...rest },
  ref,
) {
  const inner = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  const box = (
    <span className="relative inline-grid h-4 w-4 shrink-0 place-items-center">
      <input
        ref={(el) => {
          (inner as React.MutableRefObject<HTMLInputElement | null>).current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        type="checkbox"
        checked={checked}
        className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-ink/25 bg-surface transition checked:border-accent checked:bg-accent indeterminate:border-accent indeterminate:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
        {...rest}
      />
      {indeterminate ? (
        <Minus className="pointer-events-none absolute h-3 w-3 text-white" strokeWidth={3} />
      ) : (
        <Check className="pointer-events-none absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3} />
      )}
    </span>
  );
  if (!label) return <span className={cn('inline-flex', className)}>{box}</span>;
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-ink', className)}>
      {box}
      {label}
    </label>
  );
});
