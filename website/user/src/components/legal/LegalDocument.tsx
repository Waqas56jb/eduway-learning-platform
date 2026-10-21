import { motion } from 'framer-motion';
import { CalendarDays, ChevronDown, FileText, Mail, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Seo } from '@/components/ui';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';

export interface LegalSection {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

interface LegalDocumentProps {
  /** Translation key under `pages.*` holding the document (`terms` | `privacy`). */
  doc: 'terms' | 'privacy';
  updated: string;
}

/** Long-form legal page: header, sticky table of contents with scroll-spy, numbered sections. */
export function LegalDocument({ doc, updated }: LegalDocumentProps) {
  const { t } = useTranslation();
  const { fmtDate } = useLang();
  const k = (key: string) => `pages.${doc}.${key}`;
  const sections = t(k('sections'), { returnObjects: true }) as unknown as LegalSection[];
  const [active, setActive] = useState(sections[0]?.id ?? '');
  const other = doc === 'terms' ? 'privacy' : 'terms';

  const ids = sections.map((s) => s.id).join('|');

  useEffect(() => {
    const els = ids
      .split('|')
      .map((id) => document.getElementById(id)).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);

  const toc = (
    <ol className="space-y-0.5">
      {sections.map((s, i) => {
        const on = s.id === active;
        return (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={on ? 'location' : undefined}
              className={cn(
                'relative flex gap-3 rounded-lg py-2 pe-3 ps-4 text-sm transition-colors',
                on ? 'bg-white font-semibold text-primary shadow-soft' : 'text-muted hover:bg-white/60 hover:text-primary',
              )}
            >
              {on && <motion.span layoutId={`toc-${doc}`} className="absolute inset-y-2 start-0 w-1 rounded-full bg-gold-grad" />}
              <span className="num w-5 shrink-0 text-xs font-semibold leading-5 text-accent">{String(i + 1).padStart(2, '0')}</span>
              <span>{s.title}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="relative overflow-x-clip pb-24 pt-28 md:pt-36">
      <Seo title={t(k('seoTitle'))} description={t(k('seoDescription'))} />
      <div className="pointer-events-none absolute -top-32 end-0 h-96 w-96 rounded-full bg-accent/10 blur-3xl" aria-hidden />

      <div className="container relative">
        <header className="max-w-3xl">
          <span className="eyebrow">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {t(k('eyebrow'))}
          </span>
          <h1 className="mt-5 text-4xl font-bold text-primary md:text-5xl">{t(k('title'))}</h1>
          <p className="mt-5 text-lg text-muted">{t(k('intro'))}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-muted shadow-soft">
              <CalendarDays className="h-4 w-4 text-accent" aria-hidden />
              {t('pages.legal.updated')}{' '}
              <time dateTime={updated} className="font-semibold text-primary">
                {fmtDate(updated, { day: 'numeric', month: 'long', year: 'numeric' })}
              </time>
            </span>
            <Button variant="ghost" size="sm" onClick={() => window.print()} leftIcon={<Printer className="h-4 w-4" aria-hidden />}>
              {t('pages.legal.print')}
            </Button>
          </div>
        </header>

        <div className="mt-12 grid gap-10 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-16">
          {/* TOC */}
          <nav aria-label={t('pages.legal.toc')} className="lg:sticky lg:top-28 lg:self-start">
            <details className="card group p-4 lg:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-primary">
                {t('pages.legal.toc')}
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="mt-3">{toc}</div>
            </details>
            <div className="hidden lg:block">
              <p className="mb-3 ps-4 text-xs font-semibold uppercase tracking-wider text-muted rtl:normal-case rtl:tracking-normal">
                {t('pages.legal.toc')}
              </p>
              {toc}
            </div>
          </nav>

          <article className="max-w-[72ch]">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-28 border-b border-primary/5 py-8 first:pt-0 last:border-0">
                <h2 id={`${s.id}-h`} className="flex items-baseline gap-3 text-2xl font-bold text-primary">
                  <span className="num font-display text-lg text-accent">{String(i + 1).padStart(2, '0')}</span>
                  {s.title}
                </h2>
                {s.paragraphs.map((p, j) => (
                  <p key={`${s.id}-p${j}`} className="mt-4 leading-relaxed text-ink/80">
                    {p}
                  </p>
                ))}
                {s.bullets && (
                  <ul className="mt-4 space-y-2.5">
                    {s.bullets.map((b, j) => (
                      <li key={`${s.id}-b${j}`} className="flex gap-3 leading-relaxed text-ink/80">
                        <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <aside className="mt-10 flex flex-col gap-5 rounded-2xl bg-navy-grad p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div>
                <p className="font-display text-xl font-bold">{t('pages.legal.questions')}</p>
                <p className="mt-1 text-sm text-white/70">{t('pages.legal.questionsBody')}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button to="/contact" variant="gold" leftIcon={<Mail className="h-4 w-4" aria-hidden />}>
                  {t('pages.legal.contact')}
                </Button>
                <Link
                  to={`/${other}`}
                  className="inline-flex h-11 items-center rounded-xl border border-white/25 px-5 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  {t(`pages.legal.read.${other}`)}
                </Link>
              </div>
            </aside>
          </article>
        </div>
      </div>
    </div>
  );
}
