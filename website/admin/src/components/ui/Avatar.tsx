import { useState } from 'react';
import { cn } from '@/utils/cn';
import { initials } from '@/utils/format';

const PALETTE = ['#0B1F3A', '#15325C', '#2563EB', '#7C3AED', '#059669', '#DB2777', '#EA580C', '#A9832F'];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES = { xs: 'h-6 w-6 text-[10px]', sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-base', xl: 'h-20 w-20 text-xl' };

export function Avatar({ name, src, size = 'sm', className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const cls = cn('inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white ring-2 ring-surface', SIZES[size], className);
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className={cn(cls, 'object-cover')} />;
  }
  return (
    <span className={cls} style={{ background: PALETTE[hash(name) % PALETTE.length] }} aria-hidden>
      {initials(name.replace(/^(Dr\.|Mr\.|Mrs\.|د\.|أ\.)\s*/, ''))}
    </span>
  );
}

/** Image with lazy loading and branded fallback. */
export function Img({ src, alt = '', className }: { src: string; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className={cn('bg-navy-grad', className)} role="img" aria-label={alt} />;
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className={cn('object-cover', className)} />;
}
