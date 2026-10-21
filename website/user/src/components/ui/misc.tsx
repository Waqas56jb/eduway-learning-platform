import { animate, motion, useInView, type Variants } from 'framer-motion';
import { Star } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { FALLBACK_IMAGE } from '@/lib/images';

/* ------------------------------------------------------------------ Seo */

/** Sets the document title (suffixed with the brand) and description. */
export function Seo({ title, description }: { title: string; description?: string }) {
  const { t } = useTranslation();
  const brand = t('brand.name');
  return (
    <Helmet>
      <title>{title ? `${title} · ${brand}` : brand}</title>
      {description && <meta name="description" content={description} />}
    </Helmet>
  );
}

/* ------------------------------------------------------------- Motion */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

export const stagger = (delay = 0.08): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: delay } },
});

/** Fades children up when scrolled into view. Use `stagger` to animate direct <Reveal.Item> children. */
export function Reveal({
  children,
  className,
  delay = 0,
  as = 'div',
  staggerChildren,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'ul' | 'li';
  staggerChildren?: number;
}) {
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      variants={
        staggerChildren
          ? stagger(staggerChildren)
          : { hidden: fadeUp.hidden, show: { ...(fadeUp.show as object), transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] } } }
      }
    >
      {children}
    </Comp>
  );
}

export function RevealItem({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'li' | 'article' }) {
  const Comp = motion[as];
  return (
    <Comp className={className} variants={fadeUp}>
      {children}
    </Comp>
  );
}

/** Counts up from 0 to `to` when scrolled into view. */
export function AnimatedCounter({ to, suffix = '', prefix = '', duration = 2, className, format }: { to: number; suffix?: string; prefix?: string; duration?: number; className?: string; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setVal(v) });
    return () => controls.stop();
  }, [inView, to, duration]);
  const n = Math.round(val);
  return (
    <span ref={ref} className={cn('num', className)}>
      {prefix}
      {format ? format(n) : n.toLocaleString('en-US')}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------ Display */

export function Stars({ value = 5, className, size = 16 }: { value?: number; className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} role="img" aria-label={`${value} / 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i < value ? 'fill-accent text-accent' : 'fill-primary/10 text-primary/10'}
          aria-hidden
        />
      ))}
    </span>
  );
}

export function Avatar({ src, alt, size = 40, className, ring }: { src: string; alt: string; size?: number; className?: string; ring?: boolean }) {
  const [err, setErr] = useState(false);
  return (
    <img
      src={err ? FALLBACK_IMAGE : src}
      onError={() => setErr(true)}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      className={cn('shrink-0 rounded-full object-cover', ring && 'ring-2 ring-white', className)}
      style={{ width: size, height: size }}
    />
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  className,
  light,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: 'center' | 'start';
  className?: string;
  light?: boolean;
}) {
  return (
    <Reveal className={cn(align === 'center' ? 'mx-auto text-center' : 'text-start', 'max-w-3xl', className)}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2 className={cn('section-title mt-4', light && 'text-white')}>{title}</h2>
      {subtitle && (
        <p className={cn('section-sub', align === 'center' && 'mx-auto', light && 'text-white/70')}>{subtitle}</p>
      )}
    </Reveal>
  );
}

export function EmptyState({ icon, title, body, action, className }: { icon: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('card flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">{icon}</div>
      <h3 className="mt-5 text-xl font-bold text-primary">{title}</h3>
      {body && <p className="mt-2 max-w-md text-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Small page header used across student pages. */
export function PageHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div>
        <h1 className="text-3xl font-bold text-primary md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

/** Mirrors directional icons (arrows, chevrons) in RTL. */
export function Dir({ children }: { children: ReactNode }) {
  return <span className="inline-flex rtl:-scale-x-100">{children}</span>;
}
