import { motion } from 'framer-motion';
import { ArrowRight, Clock, MessagesSquare } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccordionItem, Button, Reveal, SectionHeading, SkeletonList, fadeUp, stagger, useMockLoading } from '@/components/ui';
import { faq } from '@/data';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';

/** FAQ accordion (one item open at a time) with a contact side panel. */
export function FaqSection({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { l } = useLang();
  const ready = useMockLoading(450);
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className={cn('section scroll-mt-20 bg-white', className)}>
      <div className="container">
        <SectionHeading eyebrow={t('landing.faq.eyebrow')} title={t('landing.faq.title')} subtitle={t('landing.faq.subtitle')} />

        <div className="mx-auto mt-14 grid max-w-6xl gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
          {ready ? (
            <motion.ul
              className="space-y-3"
              variants={stagger(0.06)}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-60px' }}
            >
              {faq.map((item, i) => {
                const isOpen = open === i;
                return (
                  <motion.li
                    key={item.q.en}
                    variants={fadeUp}
                    className={cn(
                      'rounded-2xl border bg-white transition-all duration-300',
                      isOpen ? 'border-accent/40 shadow-soft' : 'border-primary/[0.07] hover:border-primary/15',
                    )}
                  >
                    <AccordionItem
                      open={isOpen}
                      onToggle={() => setOpen(isOpen ? null : i)}
                      headerClassName="px-5 py-5 md:px-6"
                      title={<span className="text-base font-semibold text-primary md:text-lg">{l(item.q)}</span>}
                    >
                      <p className="px-5 pb-6 leading-relaxed text-muted md:px-6">{l(item.a)}</p>
                    </AccordionItem>
                  </motion.li>
                );
              })}
            </motion.ul>
          ) : (
            <SkeletonList rows={6} />
          )}

          <Reveal delay={0.1} className="lg:sticky lg:top-28">
            <aside className="relative isolate overflow-hidden rounded-3xl bg-navy-grad p-8 text-white shadow-lift">
              <div className="absolute -end-16 -top-16 -z-10 h-48 w-48 rounded-full bg-accent/30 blur-3xl" aria-hidden />
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-grad text-primary shadow-glow">
                <MessagesSquare className="h-6 w-6" aria-hidden />
              </span>
              <h3 className="mt-6 text-2xl font-bold text-white">{t('landing.faq.sideTitle')}</h3>
              <p className="mt-3 leading-relaxed text-white/70">{t('landing.faq.sideBody')}</p>
              <Button
                to="/contact"
                variant="gold"
                fullWidth
                className="mt-7"
                rightIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}
              >
                {t('landing.faq.sideCta')}
              </Button>
              <p className="mt-5 flex items-center gap-2 text-xs text-white/60">
                <Clock className="h-4 w-4 text-accent" aria-hidden />
                {t('landing.faq.response')}
              </p>
            </aside>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
