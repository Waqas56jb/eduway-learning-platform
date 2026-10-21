import { useState, type ImgHTMLAttributes } from 'react';
import { FALLBACK_IMAGE } from '@/lib/images';
import { cn } from '@/lib/utils';

interface SmartImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  alt: string;
  /** Classes for the wrapper (controls size/aspect). */
  wrapperClassName?: string;
  /** Overlay gradient rendered above the image. */
  overlay?: string;
  priority?: boolean;
}

/** Lazy image with a shimmering placeholder, fade-in and branded fallback on error. */
export function SmartImage({ src, alt, className, wrapperClassName, overlay, priority, ...rest }: SmartImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Without tailwind-merge, `relative` would beat an `absolute`/`fixed` wrapper class — only add it when no position is given.
  const positioned = /(^|\s)!?(absolute|fixed|sticky)(\s|$)/.test(wrapperClassName ?? '');
  return (
    <div className={cn(!positioned && 'relative', 'overflow-hidden bg-primary/10', wrapperClassName)}>
      <img
        src={failed ? FALLBACK_IMAGE : src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        {...(priority ? ({ fetchpriority: 'high' } as Record<string, string>) : {})}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          setLoaded(true);
        }}
        className={cn(
          'h-full w-full object-cover transition-[opacity,transform] duration-700',
          loaded ? 'opacity-100' : 'opacity-0',
          className,
        )}
        {...rest}
      />
      {overlay && <div className={cn('pointer-events-none absolute inset-0', overlay)} aria-hidden />}
    </div>
  );
}
