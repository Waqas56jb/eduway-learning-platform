import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'gold' | 'outline' | 'ghost' | 'subtle' | 'danger' | 'light' | 'glass';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white shadow-soft hover:bg-primary-light hover:shadow-glow',
  gold: 'bg-gold-grad text-primary shadow-[0_10px_30px_-10px_rgba(201,162,74,0.8)] hover:shadow-glow',
  outline: 'border border-accent/70 bg-transparent text-[#8A6A1F] hover:bg-accent/10 hover:border-accent hover:text-primary',
  ghost: 'bg-transparent text-primary hover:bg-primary/5',
  subtle: 'bg-primary/5 text-primary hover:bg-primary/10',
  danger: 'bg-danger text-white hover:bg-danger/90',
  light: 'bg-white text-primary shadow-soft hover:shadow-glow',
  glass: 'border border-white/25 bg-white/10 text-white backdrop-blur-md hover:bg-white/20',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-14 px-7 text-base',
  icon: 'h-10 w-10 p-0',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  /** Render as a router link. */
  to?: string;
}

export const buttonClasses = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) =>
  cn(base, variants[variant], sizes[size], extra);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, leftIcon, rightIcon, fullWidth, to, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const cls = buttonClasses(variant, size, cn(fullWidth && 'w-full', className));
  const content = (
    <>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls} aria-disabled={disabled || undefined}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});
