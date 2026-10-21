import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gold' | 'success';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const base =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50 select-none';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-btn text-btn-ink shadow-sm hover:shadow-glow hover:brightness-110 active:brightness-95',
  gold: 'bg-gold-grad text-[#0B1F3A] shadow-sm hover:shadow-glow hover:brightness-105',
  secondary: 'border border-line bg-surface text-ink shadow-sm hover:border-accent/60 hover:bg-surface-2',
  outline: 'border border-primary/25 text-primary hover:border-accent hover:bg-accent/5',
  ghost: 'text-ink/80 hover:bg-ink/5 hover:text-ink',
  danger: 'bg-danger text-white shadow-sm hover:bg-danger/90 hover:shadow-[0_8px_24px_-8px_rgba(220,38,38,0.6)]',
  success: 'bg-success text-white shadow-sm hover:bg-success/90',
};

const sizes: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs',
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
  icon: 'h-10 w-10',
  'icon-sm': 'h-8 w-8',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const buttonClass = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) =>
  cn(base, variants[variant], sizes[size], className);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export function ButtonLink({ variant = 'primary', size = 'md', icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, className as string)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
