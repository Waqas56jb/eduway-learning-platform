import { motion } from 'framer-motion';
import { ArrowUpRight, Clock, PlayCircle, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useSubjects } from '@/api/catalog';
import { ErrorState, SectionHeading, Skeleton, SmartImage, SubjectIcon, fadeUp, stagger } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import type { Subject } from '@/types';

/** Bento layout: the first card spans 2×2 on desktop, the other four fill a 2×2 grid beside it. */
export function Subjects() {
  const { t } = useTranslation();
  const { data: subjects = [], isLoading, isError, refetch } = useSubjects();

  return (
    <section id="subjects" className="section scroll-mt-20 bg-cream">
      <div className="container">
        <SectionHeading
          eyebrow={t('landing.subjects.eyebrow')}
          title={t('landing.subjects.title')}
          subtitle={t('landing.subjects.subtitle')}
        />

        {isError ? (
          <ErrorState className="mt-14" onRetry={() => void refetch()} />
        ) : !isLoading ? (
          <motion.ul
            className="mt-14 grid gap-5 md:grid-cols-2 lg:auto-rows-[290px] lg:grid-cols-4"
            variants={stagger(0.1)}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
          >
            {subjects.map((s, i) => (
              <motion.li
                key={s.id}
                variants={fadeUp}
                className={cn(i === 0 && 'md:col-span-2 lg:row-span-2')}
              >
                <SubjectCard subject={s} featured={i === 0} />
              </motion.li>
            ))}
          </motion.ul>
        ) : (
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:auto-rows-[290px] lg:grid-cols-4" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton
                key={i}
                className={cn('h-[340px] rounded-3xl lg:h-auto', i === 0 && 'md:col-span-2 lg:row-span-2')}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SubjectCard({ subject: s, featured }: { subject: Subject; featured: boolean }) {
  const { t } = useTranslation();
  const { l, fmtNumber } = useLang();
  const { isAuthenticated } = useAuth();
  const to = isAuthenticated ? `/student/subjects/${s.slug}` : '/register';

  return (
    <article
      className={cn(
        'group relative flex h-full min-h-[340px] flex-col lg:min-h-0 justify-end overflow-hidden rounded-3xl bg-primary text-white shadow-soft ring-1 ring-primary/5 transition-all duration-500 hover:shadow-lift hover:ring-2 hover:ring-accent',
        featured && 'md:min-h-[420px]',
      )}
    >
      <SmartImage
        src={s.image}
        alt={l(s.name)}
        wrapperClassName="!absolute inset-0"
        className="duration-700 ease-out group-hover:scale-110"
        overlay="bg-gradient-to-t from-primary via-primary/70 to-primary/10"
      />
      <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: s.color }} aria-hidden />

      <div className="absolute inset-x-5 top-6 flex items-start justify-between">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg ring-1 ring-white/20 backdrop-blur"
          style={{ backgroundColor: `${s.color}cc` }}
        >
          <SubjectIcon id={s.slug} icon={s.icon} className="h-6 w-6" />
        </span>
        {featured && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/90 px-3 py-1 text-xs font-bold text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t('landing.subjects.featured')}
          </span>
        )}
      </div>

      <div className={cn('relative p-6', featured && 'md:p-8')}>
        <h3 className={cn('font-bold text-white', featured ? 'text-3xl md:text-4xl' : 'text-2xl')}>{l(s.name)}</h3>
        <p className={cn('mt-2 text-white/75', featured ? 'text-base md:text-lg' : 'line-clamp-2 text-sm')}>
          {l(featured ? s.description : s.tagline)}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-white/70">
          <span className="inline-flex items-center gap-1.5">
            <PlayCircle className="h-4 w-4 text-accent" aria-hidden />
            {t('common.lessons', { count: s.lessonsCount })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-accent" aria-hidden />
            {t('common.hours', { count: s.hours })}
          </span>
          {featured && (
            <span className="num">{t('landing.subjects.questions', { n: fmtNumber(s.questionsCount) })}</span>
          )}
        </div>

        <Link
          to={to}
          aria-label={t('landing.subjects.explore', { subject: l(s.name) })}
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent-light transition-colors after:absolute after:inset-0 after:content-[''] hover:text-white"
        >
          {t('landing.subjects.exploreShort')}
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 transition group-hover:bg-accent group-hover:text-primary">
            <ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
          </span>
        </Link>
      </div>
    </article>
  );
}
