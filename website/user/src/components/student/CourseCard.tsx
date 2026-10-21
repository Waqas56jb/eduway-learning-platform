import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Clock3, Lock, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge, ProgressBar, SmartImage, SubjectIcon } from '@/components/ui';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import type { Subject } from '@/types';

interface CourseCardProps {
  subject: Subject;
  progress: { completed: number; total: number; pct: number };
  locked?: boolean;
  className?: string;
}

/** Subject card for the catalogue grid: HD cover, subject accent, stats and progress. */
export function CourseCard({ subject, progress, locked, className }: CourseCardProps) {
  const { t } = useTranslation();
  const { l, fmtNumber } = useLang();
  const done = progress.pct >= 100;

  return (
    <motion.article
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={cn('card group relative flex h-full flex-col overflow-hidden transition-shadow duration-300 hover:shadow-lift', className)}
    >
      <span className="absolute inset-x-0 top-0 z-10 h-1" style={{ backgroundColor: subject.color }} aria-hidden />
      <div className="relative">
        <SmartImage
          src={subject.image}
          alt={l(subject.name)}
          wrapperClassName="aspect-[16/10]"
          className="group-hover:scale-105"
          overlay="bg-gradient-to-t from-primary/85 via-primary/25 to-transparent"
        />
        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/95 shadow-soft backdrop-blur"
            style={{ color: subject.color }}
          >
            <SubjectIcon id={subject.id} className="h-6 w-6" />
          </span>
          {done ? (
            <Badge tone="success" className="bg-white/95">
              {t('common.completed')}
            </Badge>
          ) : progress.pct > 0 && !locked ? (
            <Badge tone="white">{t('learn.card.percent', { pct: progress.pct })}</Badge>
          ) : null}
        </div>
        {locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-primary/70 text-center text-white backdrop-blur-[2px]">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30">
              <Lock className="h-5 w-5 text-accent-light" aria-hidden />
            </span>
            <span className="text-sm font-semibold">{t('learn.card.locked')}</span>
            <span className="text-xs text-white/70">{t('learn.card.upgradeHint')}</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-xl font-bold text-primary">
          <Link
            to={`/student/subjects/${subject.id}`}
            className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-accent"
          >
            {l(subject.name)}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{l(subject.tagline)}</p>

        <p className="mt-4 flex items-center gap-2 text-sm text-ink">
          <UserRound className="h-4 w-4 text-accent" aria-hidden />
          <span className="truncate">{l(subject.teacher)}</span>
        </p>

        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <li className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" aria-hidden />
            {t('common.lessons', { count: subject.lessonsCount })}
          </li>
          <li className="flex items-center gap-1.5">
            <Clock3 className="h-4 w-4" aria-hidden />
            {t('common.hours', { count: subject.hours })}
          </li>
        </ul>

        <div className="mt-auto pt-5">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold">
            <span className="text-muted num">
              {t('learn.card.lessonsDone', { done: fmtNumber(progress.completed), total: fmtNumber(progress.total) })}
            </span>
            <span className="num" style={{ color: subject.color }}>
              {progress.pct}%
            </span>
          </div>
          <ProgressBar value={progress.pct} color={subject.color} label={l(subject.name)} />
          <span className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors group-hover:text-accent">
            {locked ? t('learn.card.preview') : progress.pct > 0 ? t('learn.card.continue') : t('learn.card.start')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" aria-hidden />
          </span>
        </div>
      </div>
    </motion.article>
  );
}
