import { animate, motion, useMotionValue, useReducedMotion, type PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight, MapPin, Quote } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, SectionHeading, Skeleton, Stars, useMockLoading } from '@/components/ui';
import { testimonials } from '@/data';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';

const AUTO_MS = 5500;

/** 1 / 2 / 3 slides per view at < md / md / lg. */
function usePerView() {
  const get = () => {
    if (typeof window === 'undefined') return 1;
    if (window.matchMedia('(min-width: 1024px)').matches) return 3;
    if (window.matchMedia('(min-width: 768px)').matches) return 2;
    return 1;
  };
  const [perView, setPerView] = useState(get);
  useEffect(() => {
    const onResize = () => setPerView(get());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return perView;
}

export function Testimonials() {
  const { t } = useTranslation();
  const ready = useMockLoading(450);

  return (
    <section className="section relative overflow-hidden bg-white">
      <div className="absolute -start-32 top-1/3 h-80 w-80 rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div className="container relative">
        <SectionHeading
          eyebrow={t('landing.testimonials.eyebrow')}
          title={t('landing.testimonials.title')}
          subtitle={t('landing.testimonials.subtitle')}
        />
        {ready ? (
          <Carousel />
        ) : (
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className={cn('h-72 rounded-3xl', i > 0 && 'hidden md:block', i > 1 && 'md:hidden lg:block')} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Carousel() {
  const { t } = useTranslation();
  const { l, isRtl, fmtNumber } = useLang();
  const reduce = useReducedMotion();
  const perView = usePerView();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const x = useMotionValue(0);

  const maxIndex = Math.max(0, testimonials.length - perView);
  const pages = maxIndex + 1;
  const slideW = width / perView;
  const sign = isRtl ? 1 : -1;

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => setIndex((i) => Math.min(i, maxIndex)), [maxIndex]);

  const snap = useCallback(
    (i: number) => {
      const controls = animate(x, sign * i * slideW, reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 32 });
      return () => controls.stop();
    },
    [x, sign, slideW, reduce],
  );

  useEffect(() => snap(index), [index, snap]);

  const go = useCallback((i: number) => setIndex(((i % pages) + pages) % pages), [pages]);
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  useEffect(() => {
    if (paused || reduce || pages <= 1) return;
    const id = window.setInterval(() => setIndex((i) => (i >= maxIndex ? 0 : i + 1)), AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused, reduce, pages, maxIndex]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    // Normalise so a negative delta always means "towards the next slide".
    const delta = info.offset.x * (isRtl ? -1 : 1);
    const velocity = info.velocity.x * (isRtl ? -1 : 1);
    if ((delta < -60 || velocity < -500) && index < maxIndex) setIndex(index + 1);
    else if ((delta > 60 || velocity > 500) && index > 0) setIndex(index - 1);
    else snap(index);
  };

  // In RTL the "previous" control sits on the right and points right.
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div
      className="mt-14"
      role="region"
      aria-roledescription="carousel"
      aria-label={t('landing.testimonials.label')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div ref={viewportRef} className="-mx-3 overflow-hidden px-0">
        <motion.ul
          className="flex cursor-grab touch-pan-y active:cursor-grabbing"
          style={{ x }}
          drag={pages > 1 ? 'x' : false}
          dragElastic={0.12}
          dragMomentum={false}
          onDragEnd={onDragEnd}
        >
          {testimonials.map((tm, i) => {
            const visible = i >= index && i < index + perView;
            return (
              <li
                key={tm.id}
                className="shrink-0 px-3 py-4"
                style={{ width: slideW || `${100 / perView}%` }}
                aria-roledescription="slide"
                aria-label={t('landing.testimonials.slide', { current: fmtNumber(i + 1), total: fmtNumber(testimonials.length) })}
                aria-hidden={!visible || undefined}
              >
                <figure className="relative flex h-full select-none flex-col rounded-2xl border border-primary/[0.07] bg-white p-7 shadow-[0_12px_28px_-22px_rgba(11,31,58,0.35)] transition-colors duration-300 hover:border-accent/40">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-grad text-primary shadow-glow">
                    <Quote className="h-5 w-5 fill-current rtl:-scale-x-100" aria-hidden />
                  </span>
                  <Stars value={tm.rating} className="mt-6" />
                  <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-ink/85 md:text-base">
                    {t('landing.testimonials.quote', { text: l(tm.quote) })}
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3 border-t border-primary/5 pt-5">
                    <Avatar src={tm.avatar} alt={l(tm.name)} size={48} className="ring-2 ring-accent/40 ring-offset-2" />
                    <div className="min-w-0">
                      <p className="font-bold text-primary">{l(tm.name)}</p>
                      <p className="truncate text-xs text-muted">{l(tm.role)}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-accent">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {l(tm.city)}
                      </p>
                    </div>
                  </figcaption>
                </figure>
              </li>
            );
          })}
        </motion.ul>
      </div>

      {pages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-5">
          <button
            type="button"
            onClick={prev}
            aria-label={t('landing.testimonials.prev')}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/10 bg-white text-primary shadow-soft transition hover:border-accent hover:text-accent"
          >
            <PrevIcon className="h-5 w-5" aria-hidden />
          </button>
          <div className="flex items-center gap-2">
            {Array.from({ length: pages }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={t('landing.testimonials.goTo', { n: fmtNumber(i + 1) })}
                aria-current={i === index || undefined}
                className="flex h-6 items-center justify-center px-0.5"
              >
                <span
                  className={cn(
                    'block h-2 rounded-full transition-all duration-300',
                    i === index ? 'w-7 bg-gold-grad' : 'w-2 bg-primary/15 hover:bg-primary/30',
                  )}
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={next}
            aria-label={t('landing.testimonials.next')}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/10 bg-white text-primary shadow-soft transition hover:border-accent hover:text-accent"
          >
            <NextIcon className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
