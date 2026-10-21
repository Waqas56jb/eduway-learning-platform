import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  className?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, className, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors duration-200 disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-primary/15',
        className,
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={cn('h-5 w-5 rounded-full bg-white shadow', checked ? 'ms-auto' : 'me-auto')}
      />
    </button>
  );
}
