import { motion } from 'framer-motion';
import { Bot, Library, ListChecks, NotebookPen, PlayCircle, Timer, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SectionHeading, fadeUp, stagger } from '@/components/ui';

const FEATURES: { key: string; icon: LucideIcon }[] = [
  { key: 'video', icon: PlayCircle },
  { key: 'quizzes', icon: ListChecks },
  { key: 'bank', icon: Library },
  { key: 'mistakes', icon: NotebookPen },
  { key: 'simulator', icon: Timer },
  { key: 'tutor', icon: Bot },
];

export function Features() {
  const { t } = useTranslation();
  return (
    <section className="section relative overflow-hidden bg-white">
      <div className="absolute inset-x-0 -top-40 mx-auto h-80 w-[40rem] max-w-full rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div className="container relative">
        <SectionHeading
          eyebrow={t('landing.features.eyebrow')}
          title={t('landing.features.title')}
          subtitle={t('landing.features.subtitle')}
        />
        <motion.ul
          className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          variants={stagger(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
        >
          {FEATURES.map(({ key, icon: Icon }, i) => (
            <motion.li
              key={key}
              variants={fadeUp}
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="card group relative overflow-hidden p-7 transition-shadow duration-300 hover:shadow-lift"
            >
              <span
                className="absolute end-6 top-5 font-display text-5xl font-bold text-primary/[0.04] transition-colors duration-300 group-hover:text-accent/15 num"
                aria-hidden
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-grad text-primary shadow-[0_10px_25px_-10px_rgba(201,162,74,0.9)] transition-transform duration-300 group-hover:scale-110">
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <h3 className="mt-6 text-xl font-bold text-primary">{t(`landing.features.items.${key}.title`)}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{t(`landing.features.items.${key}.desc`)}</p>
              <span className="absolute inset-x-7 bottom-0 h-0.5 origin-left scale-x-0 bg-gold-grad transition-transform duration-500 group-hover:scale-x-100 rtl:origin-right" aria-hidden />
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
