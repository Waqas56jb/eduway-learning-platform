import { motion } from 'framer-motion';
import { ArrowRight, BookOpenCheck, Compass, Eye, GraduationCap, HeartHandshake, Lightbulb, ShieldCheck, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AnimatedCounter,
  Avatar,
  Badge,
  Button,
  HoverCard,
  Reveal,
  RevealItem,
  SectionHeading,
  Seo,
  SkeletonCard,
  SmartImage,
  SubjectBadgeIcon,
  useMockLoading,
} from '@/components/ui';
import { governorates, subjects } from '@/data';
import { useLang } from '@/hooks/useLang';
import { AVATARS, IMAGES } from '@/lib/images';
import type { SubjectId } from '@/types';

interface TextItem {
  title: string;
  body: string;
}
interface Milestone extends TextItem {
  year: string;
}

const VALUE_ICONS = [Target, HeartHandshake, ShieldCheck, Lightbulb];

const TEACHER_META: Record<SubjectId, { avatar: string; years: number; students: number }> = {
  math: { avatar: AVATARS[0], years: 18, students: 14200 },
  physics: { avatar: AVATARS[2], years: 15, students: 12800 },
  chemistry: { avatar: AVATARS[3], years: 12, students: 11300 },
  biology: { avatar: AVATARS[5], years: 14, students: 10900 },
  english: { avatar: AVATARS[7], years: 10, students: 9600 },
};

export default function About() {
  const { t } = useTranslation();
  const { l, fmtNumber } = useLang();
  const ready = useMockLoading(600);

  const values = t('pages.about.values.items', { returnObjects: true }) as unknown as TextItem[];
  const milestones = t('pages.about.timeline.items', { returnObjects: true }) as unknown as Milestone[];

  const totalQuestions = subjects.reduce((s, x) => s + x.questionsCount, 0);
  const impact = [
    { to: 48000, suffix: '+', label: t('pages.about.impact.students') },
    // Platform-wide catalogue size (matches the landing stats band; mock data only ships a sample).
    { to: 850, suffix: '+', label: t('pages.about.impact.lessons') },
    { to: totalQuestions, suffix: '+', label: t('pages.about.impact.questions') },
    { to: governorates.length, suffix: '', label: t('pages.about.impact.governorates') },
    { to: 94, suffix: '%', label: t('pages.about.impact.passRate') },
  ];

  return (
    <>
      <Seo title={t('pages.about.seoTitle')} description={t('pages.about.seoDescription')} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-primary pb-24 pt-36 md:pb-32 md:pt-44">
        <SmartImage
          src={IMAGES.studentBooks}
          alt=""
          priority
          wrapperClassName="!absolute inset-0 -z-10"
          overlay="bg-gradient-to-b from-primary/90 via-primary/75 to-primary"
        />
        <div className="pointer-events-none absolute -top-20 end-0 -z-10 h-96 w-96 rounded-full bg-accent/20 blur-3xl" aria-hidden />
        <div className="container">
          <Reveal className="max-w-3xl">
            <span className="eyebrow">
              <Compass className="h-3.5 w-3.5" aria-hidden />
              {t('pages.about.hero.eyebrow')}
            </span>
            <h1 className="mt-6 text-4xl font-bold text-white sm:text-5xl md:text-6xl">
              {t('pages.about.hero.titleStart')} <span className="text-gold-grad">{t('pages.about.hero.titleHighlight')}</span>{' '}
              {t('pages.about.hero.titleEnd')}
            </h1>
            <p className="mt-6 text-lg text-white/75 md:text-xl">{t('pages.about.hero.subtitle')}</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button to="/register" variant="gold" size="lg" rightIcon={<ArrowRight className="h-5 w-5 rtl:-scale-x-100" aria-hidden />}>
                {t('pages.about.hero.ctaPrimary')}
              </Button>
              <a href="#teachers" className="inline-flex h-14 items-center justify-center rounded-xl border border-white/25 bg-white/10 px-7 font-semibold text-white backdrop-blur-md transition hover:bg-white/20">
                {t('pages.about.hero.ctaSecondary')}
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Story / mission */}
      <section className="section overflow-hidden">
        <div className="container grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <Reveal className="relative order-2 lg:order-1">
            <div className="grid grid-cols-5 grid-rows-[repeat(6,3.5rem)] gap-4 sm:grid-rows-[repeat(6,4.5rem)]">
              <SmartImage
                src={IMAGES.classroom}
                alt={t('pages.about.story.imageAlts.classroom')}
                wrapperClassName="col-span-3 row-span-4 rounded-3xl shadow-lift"
              />
              <SmartImage
                src={IMAGES.library}
                alt={t('pages.about.story.imageAlts.library')}
                wrapperClassName="col-span-2 row-span-3 rounded-3xl shadow-soft"
              />
              <SmartImage
                src={IMAGES.studentLaptop}
                alt={t('pages.about.story.imageAlts.laptop')}
                wrapperClassName="col-span-2 col-start-4 row-span-3 rounded-3xl shadow-soft"
              />
              <div className="col-span-3 row-span-2 flex items-center gap-4 rounded-3xl bg-primary p-5 text-white shadow-lift">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold-grad text-primary">
                  <GraduationCap className="h-6 w-6" aria-hidden />
                </span>
                <div>
                  <p className="num font-display text-2xl font-bold text-accent-light">2021</p>
                  <p className="text-sm text-white/70">{t('pages.about.story.since')}</p>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-10 -start-10 -z-10 h-56 w-56 rounded-full bg-accent/20 blur-3xl" aria-hidden />
          </Reveal>

          <Reveal className="order-1 lg:order-2" delay={0.1}>
            <span className="eyebrow">{t('pages.about.story.eyebrow')}</span>
            <h2 className="section-title mt-4">{t('pages.about.story.title')}</h2>
            <p className="mt-6 text-lg text-muted">{t('pages.about.story.p1')}</p>
            <p className="mt-4 text-muted">{t('pages.about.story.p2')}</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {(['mission', 'vision'] as const).map((k) => {
                const Icon = k === 'mission' ? BookOpenCheck : Eye;
                return (
                  <div key={k} className="card p-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-lg font-bold text-primary">{t(`pages.about.story.${k}.title`)}</h3>
                    <p className="mt-1.5 text-sm text-muted">{t(`pages.about.story.${k}.body`)}</p>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Values */}
      <section className="section bg-white">
        <div className="container">
          <SectionHeading
            eyebrow={t('pages.about.values.eyebrow')}
            title={t('pages.about.values.title')}
            subtitle={t('pages.about.values.subtitle')}
          />
          <Reveal as="ul" staggerChildren={0.1} className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v, i) => {
              const Icon = VALUE_ICONS[i % VALUE_ICONS.length];
              return (
                <RevealItem as="li" key={v.title}>
                  <HoverCard className="group h-full p-7">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-accent-light transition-colors group-hover:bg-gold-grad group-hover:text-primary">
                      <Icon className="h-6 w-6" aria-hidden />
                    </span>
                    <h3 className="mt-6 text-xl font-bold text-primary">{v.title}</h3>
                    <p className="mt-2 text-sm text-muted">{v.body}</p>
                  </HoverCard>
                </RevealItem>
              );
            })}
          </Reveal>
        </div>
      </section>

      {/* Impact */}
      <section className="relative overflow-hidden bg-navy-grad py-20 md:py-24">
        <div className="pointer-events-none absolute -top-24 start-1/3 h-72 w-72 rounded-full bg-accent/20 blur-3xl" aria-hidden />
        <div className="container relative">
          <SectionHeading light eyebrow={t('pages.about.impact.eyebrow')} title={t('pages.about.impact.title')} />
          <ul className="mt-14 grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-5">
            {impact.map((s, i) => (
              <li key={s.label} className={i === impact.length - 1 ? 'col-span-2 text-center md:col-span-1' : 'text-center'}>
                <p className="font-display text-4xl font-bold text-gold-grad md:text-5xl" dir="ltr">
                  <AnimatedCounter to={s.to} suffix={s.suffix} />
                </p>
                <p className="mx-auto mt-2 text-sm text-white/70">{s.label}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Teachers */}
      <section id="teachers" className="section scroll-mt-20">
        <div className="container">
          <SectionHeading
            eyebrow={t('pages.about.teachers.eyebrow')}
            title={t('pages.about.teachers.title')}
            subtitle={t('pages.about.teachers.subtitle')}
          />
          <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {ready
              ? subjects.map((s, i) => {
                  const meta = TEACHER_META[s.id];
                  return (
                    <motion.li
                      key={s.id}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: i * 0.08 }}
                    >
                      <HoverCard className="relative flex h-full flex-col overflow-hidden p-6">
                        <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: s.color }} aria-hidden />
                        <div className="flex items-center justify-between">
                          <Avatar src={meta.avatar} alt={l(s.teacher)} size={72} className="ring-4 ring-cream" />
                          <SubjectBadgeIcon id={s.id} color={s.color} size={40} />
                        </div>
                        <h3 className="mt-5 font-sans text-lg font-bold tracking-normal text-primary rtl:font-display">{l(s.teacher)}</h3>
                        <Badge color={s.color} className="mt-2 self-start">
                          {l(s.name)}
                        </Badge>
                        <p className="mt-4 flex-1 text-sm text-muted">{t(`pages.about.teachers.bios.${s.id}`)}</p>
                        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-primary/5 pt-4 text-xs">
                          <div>
                            <dt className="text-muted">{t('pages.about.teachers.experience')}</dt>
                            <dd className="mt-0.5 font-bold text-primary">{t('pages.about.teachers.years', { count: meta.years })}</dd>
                          </div>
                          <div>
                            <dt className="text-muted">{t('pages.about.teachers.taught')}</dt>
                            <dd className="num mt-0.5 font-bold text-primary">{fmtNumber(meta.students)}+</dd>
                          </div>
                        </dl>
                      </HoverCard>
                    </motion.li>
                  );
                })
              : subjects.map((s) => (
                  <li key={s.id}>
                    <SkeletonCard media={false} lines={4} className="h-80" />
                  </li>
                ))}
          </ul>
        </div>
      </section>

      {/* Timeline */}
      <section className="section bg-white">
        <div className="container grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <SectionHeading
            align="start"
            eyebrow={t('pages.about.timeline.eyebrow')}
            title={t('pages.about.timeline.title')}
            subtitle={t('pages.about.timeline.subtitle')}
            className="lg:sticky lg:top-28 lg:self-start"
          />
          <Reveal as="ul" staggerChildren={0.1} className="relative space-y-8 border-s-2 border-primary/10 ps-8">
            {milestones.map((m, i) => (
              <RevealItem as="li" key={m.year} className="relative">
                <span
                  className={
                    i === milestones.length - 1
                      ? 'absolute -start-[2.65rem] top-1 h-5 w-5 rounded-full bg-gold-grad shadow-glow ring-4 ring-white'
                      : 'absolute -start-[2.65rem] top-1 h-5 w-5 rounded-full border-2 border-accent bg-white ring-4 ring-white'
                  }
                  aria-hidden
                />
                <p className="num font-display text-2xl font-bold text-accent">{m.year}</p>
                <h3 className="mt-1 text-xl font-bold text-primary">{m.title}</h3>
                <p className="mt-2 text-muted">{m.body}</p>
              </RevealItem>
            ))}
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="section">
        <div className="container">
          <Reveal className="relative overflow-hidden rounded-3xl bg-navy-grad px-6 py-14 text-center shadow-lift sm:px-12 md:py-20">
            <div className="pointer-events-none absolute -top-24 start-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-accent/25 blur-3xl" aria-hidden />
            <h2 className="relative mx-auto max-w-2xl text-3xl font-bold text-white md:text-5xl">
              {t('pages.about.cta.title')}
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-white/70 md:text-lg">{t('pages.about.cta.subtitle')}</p>
            <div className="relative mt-10 flex flex-wrap justify-center gap-3">
              <Button to="/register" variant="gold" size="lg">
                {t('pages.about.cta.primary')}
              </Button>
              <Button to="/contact" variant="glass" size="lg">
                {t('pages.about.cta.secondary')}
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
