import { motion, type Variants } from 'framer-motion';
import { ArrowRight, CheckCircle2, Circle, Flame, Play } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Modal, ProgressBar, ProgressRing, SmartImage, Stars } from '@/components/ui';
import { getLesson } from '@/data';
import { useLang } from '@/hooks/useLang';
import { AVATARS, IMAGES } from '@/lib/images';
import { cn } from '@/lib/utils';

const DEMO_VIDEO = 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4';

const ease = [0.22, 1, 0.36, 1] as const;
const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease } },
};

export function Hero() {
  const { t } = useTranslation();
  const { fmtNumber } = useLang();
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden bg-primary text-white">
      {/* Background image + direction-aware navy overlay */}
      <SmartImage
        src={IMAGES.hero}
        alt={t('landing.hero.bgAlt')}
        priority
        wrapperClassName="!absolute inset-0 -z-20 bg-primary"
        className="scale-105"
      />
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-r from-primary/95 via-primary/75 to-primary/20 rtl:bg-gradient-to-l"
        aria-hidden
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-primary via-transparent to-primary/50" aria-hidden />
      <div className="absolute -top-32 end-[10%] -z-10 h-[28rem] w-[28rem] rounded-full bg-accent/25 blur-3xl" aria-hidden />
      <div className="absolute -bottom-40 start-[-10%] -z-10 h-[24rem] w-[24rem] rounded-full bg-accent/10 blur-3xl" aria-hidden />

      <div className="container grid items-center gap-14 pb-28 pt-32 lg:grid-cols-[1.15fr_1fr] lg:pt-36">
        <motion.div variants={container} initial="hidden" animate="show" className="max-w-2xl">
          <motion.span variants={item} className="eyebrow border-accent/50 bg-accent/15 text-accent-light">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            {t('landing.hero.eyebrow')}
          </motion.span>

          <motion.h1
            variants={item}
            className="mt-6 text-5xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-6xl md:text-7xl rtl:leading-[1.25]"
          >
            {t('landing.hero.titleStart')}{' '}
            <span className="text-gold-grad">{t('landing.hero.titleHighlight')}</span> {t('landing.hero.titleEnd')}
          </motion.h1>

          <motion.p variants={item} className="mt-6 text-lg leading-relaxed text-white/75 md:text-xl">
            {t('landing.hero.subtitle')}
          </motion.p>

          <motion.div variants={item} className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              to="/register"
              variant="gold"
              size="lg"
              rightIcon={<ArrowRight className="h-5 w-5 rtl:-scale-x-100" aria-hidden />}
            >
              {t('landing.hero.ctaPrimary')}
            </Button>
            <Button
              variant="glass"
              size="lg"
              onClick={() => setDemoOpen(true)}
              leftIcon={
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-primary">
                  <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
                </span>
              }
            >
              {t('landing.hero.ctaDemo')}
            </Button>
          </motion.div>

          <motion.div variants={item} className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex -space-x-3 rtl:space-x-reverse">
              {AVATARS.slice(0, 5).map((src) => (
                <Avatar key={src} src={src} alt={t('landing.hero.avatarAlt')} size={44} className="ring-2 ring-primary" />
              ))}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Stars value={5} size={15} />
                <span className="sr-only">{t('landing.hero.rating')}</span>
              </div>
              <p className="mt-1 text-sm text-white/70">
                <strong className="num font-bold text-white">{t('landing.hero.students', { n: fmtNumber(12000) })}</strong>{' '}
                {t('landing.hero.studentsSub')}
              </p>
            </div>
          </motion.div>
        </motion.div>

        <HeroMock />
      </div>

      <a
        href="#subjects"
        aria-label={t('landing.hero.scroll')}
        className="group absolute inset-x-0 bottom-7 mx-auto hidden w-fit flex-col items-center gap-2 text-white/60 transition hover:text-white sm:flex"
      >
        <span className="flex h-10 w-6 justify-center rounded-full border-2 border-white/40 pt-2 transition group-hover:border-accent">
          <span className="h-2 w-1 rounded-full bg-accent animate-scrolldot motion-reduce:animate-none" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] rtl:tracking-normal">
          {t('landing.hero.scroll')}
        </span>
      </a>

      <Modal
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        title={t('landing.hero.demoTitle')}
        description={t('landing.hero.demoDescription')}
        size="xl"
      >
        <video
          src={DEMO_VIDEO}
          controls
          autoPlay
          playsInline
          poster={IMAGES.hero}
          className="aspect-video w-full rounded-2xl bg-primary"
        >
          {t('landing.hero.videoUnsupported')}
        </video>
      </Modal>
    </section>
  );
}

/** Layered glass "app preview" shown on large screens. Purely illustrative. */
function HeroMock() {
  const { t } = useTranslation();
  const { l } = useLang();
  const lesson = getLesson('physics-l6');
  const goals = [
    { key: 'lesson', done: true },
    { key: 'quiz', done: true },
    { key: 'review', done: false },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 1, delay: 0.5, ease }}
      className="relative hidden h-[520px] lg:block"
      role="img"
      aria-label={t('landing.hero.mock.label')}
    >
      {/* Main lesson player card */}
      <div className="absolute inset-x-6 top-10 animate-float motion-reduce:animate-none">
        <div className="glass rotate-[-2deg] rounded-3xl p-4 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)] rtl:rotate-[2deg]">
          <div className="relative overflow-hidden rounded-2xl">
            <SmartImage
              src={lesson?.thumbnail ?? IMAGES.physics}
              alt=""
              wrapperClassName="aspect-[16/9]"
              overlay="bg-gradient-to-t from-primary/80 via-primary/10 to-transparent"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-primary shadow-glow">
                <Play className="ms-1 h-6 w-6 fill-current" aria-hidden />
              </span>
            </span>
            <span className="absolute start-4 top-4 rounded-full bg-primary/70 px-3 py-1 text-[11px] font-semibold text-accent-light backdrop-blur">
              {t('landing.hero.mock.nowPlaying')}
            </span>
          </div>
          <div className="px-1 pb-1 pt-4">
            <p className="text-xs font-semibold text-accent-light">{t('landing.hero.mock.subject')}</p>
            <p className="mt-1 font-display text-xl font-bold text-white">{l(lesson?.title)}</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                <div className="h-full w-[64%] rounded-full bg-gold-grad" />
              </div>
              <span className="num text-xs text-white/70" dir="ltr">
                {t('landing.hero.mock.time')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress ring card */}
      <div className="absolute -bottom-2 start-0 animate-float motion-reduce:animate-none [animation-delay:-2s]">
        <div className="glass-navy flex rotate-[-5deg] items-center gap-4 rounded-2xl p-4 pe-6 shadow-lift rtl:rotate-[5deg]">
          <ProgressRing value={72} size={68} stroke={7} trackColor="rgba(255,255,255,0.12)">
            <span className="num text-sm font-bold text-white">72%</span>
          </ProgressRing>
          <div>
            <p className="text-sm font-bold text-white">{t('landing.hero.mock.overall')}</p>
            <p className="text-xs text-white/60">{t('landing.hero.mock.overallSub')}</p>
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-accent-light">
              <Flame className="h-3.5 w-3.5" aria-hidden />
              {t('landing.hero.mock.streak')}
            </p>
          </div>
        </div>
      </div>

      {/* Today's goal card */}
      <div className="absolute -top-2 end-0 animate-float motion-reduce:animate-none [animation-delay:-4s]">
        <div className="w-60 rotate-[4deg] rounded-2xl bg-white p-4 text-primary shadow-lift rtl:rotate-[-4deg]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">{t('landing.hero.mock.goalTitle')}</p>
            <span className="num rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-[#8A6A1F]" dir="ltr">
              {t('landing.hero.mock.goalMeta')}
            </span>
          </div>
          <ProgressBar value={66} gold size="xs" className="mt-3" />
          <ul className="mt-3 space-y-2">
            {goals.map((g) => (
              <li key={g.key} className="flex items-center gap-2 text-xs">
                {g.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-primary/25" aria-hidden />
                )}
                <span className={cn(g.done ? 'text-muted line-through' : 'font-medium')}>
                  {t(`landing.hero.mock.goals.${g.key}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}
