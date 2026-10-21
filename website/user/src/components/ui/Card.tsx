import { motion, type HTMLMotionProps } from 'framer-motion';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...rest} />;
}

/** Card that lifts on hover. */
export function HoverCard({ className, ...rest }: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={cn('card transition-shadow duration-300 hover:shadow-lift', className)}
      {...rest}
    />
  );
}

export function CardHeader({ title, action, subtitle, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h3 className="font-sans text-base font-bold tracking-normal text-primary rtl:font-display">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
