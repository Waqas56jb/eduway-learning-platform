import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowRight, BatteryFull, Bot, CheckCircle2, SendHorizontal, Signal, Wifi } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Reveal } from '@/components/ui';
import { Formula } from '@/components/ui/MathText';
import { cn } from '@/lib/utils';

const BULLETS = ['steps', 'bilingual', 'curriculum', 'always'] as const;

/** Timeline (ms after the phone scrolls into view) for: question, typing, answer, follow-up. */
const TIMELINE = [300, 1100, 2700, 4300];

export function AiTutorShowcase() {
  const { t } = useTranslation();
  return (
    <section className="section relative overflow-hidden bg-cream">
      <div className="absolute -end-40 top-20 h-[30rem] w-[30rem] rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div className="container relative grid items-center gap-16 lg:grid-cols-2">
        <Reveal>
          <span className="eyebrow">{t('landing.ai.eyebrow')}</span>
          <h2 className="section-title mt-4">
            {t('landing.ai.titleStart')} <span className="text-gold-grad">{t('landing.ai.titleHighlight')}</span>
          </h2>
          <p className="section-sub">{t('landing.ai.subtitle')}</p>
          <ul className="mt-8 space-y-4">
            {BULLETS.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                </span>
                <span className="font-medium text-primary/85">{t(`landing.ai.bullets.${b}`)}</span>
              </li>
            ))}
          </ul>
          <Button
            to="/register"
            variant="primary"
            size="lg"
            className="mt-10"
            rightIcon={<ArrowRight className="h-5 w-5 rtl:-scale-x-100" aria-hidden />}
          >
            {t('landing.ai.cta')}
          </Button>
        </Reveal>

        <Reveal delay={0.15} className="flex justify-center lg:justify-end">
          <PhoneChat />
        </Reveal>
      </div>
    </section>
  );
}

function PhoneChat() {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-120px' });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setStep(TIMELINE.length);
      return;
    }
    const timers = TIMELINE.map((ms, i) => window.setTimeout(() => setStep(i + 1), ms));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [inView, reduce]);

  return (
    <div className="relative">
      <div className="absolute -inset-10 rounded-full bg-accent/20 blur-3xl" aria-hidden />
      <figure
        ref={ref}
        aria-label={t('landing.ai.chat.label')}
        className="relative h-[600px] w-[300px] rounded-[3rem] border-[10px] border-[#0a1628] bg-[#0a1628] shadow-[0_50px_100px_-30px_rgba(11,31,58,0.55)] ring-1 ring-primary/20 sm:w-[320px]"
      >
        <div className="relative flex h-full flex-col overflow-hidden rounded-[2.3rem] bg-cream">
          {/* Notch */}
          <div className="absolute inset-x-0 top-0 z-20 mx-auto h-6 w-28 rounded-b-2xl bg-[#0a1628]" aria-hidden />

          {/* Status bar */}
          <div className="flex items-center justify-between bg-primary px-6 pb-1 pt-2.5 text-[11px] font-semibold text-white" dir="ltr" aria-hidden>
            <span className="num">{t('landing.ai.chat.time')}</span>
            <span className="flex items-center gap-1">
              <Signal className="h-3 w-3" />
              <Wifi className="h-3 w-3" />
              <BatteryFull className="h-4 w-4" />
            </span>
          </div>

          {/* Chat header */}
          <div className="flex items-center gap-3 bg-primary px-4 pb-4 pt-3 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-grad text-primary">
              <Bot className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{t('landing.ai.chat.name')}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-white/70">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                {t('landing.ai.chat.online')}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden px-3.5 py-4" aria-live="polite">
            <AnimatePresence initial={false}>
              {step >= 1 && (
                <Bubble key="q" from="student">
                  {t('landing.ai.chat.question')}
                </Bubble>
              )}
              {step === 2 && (
                <motion.div
                  key="typing"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex w-fit items-center gap-1 rounded-2xl rounded-ss-sm bg-white px-4 py-3 shadow-soft"
                >
                  <span className="sr-only">{t('landing.ai.chat.typing')}</span>
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className="h-1.5 w-1.5 rounded-full bg-primary/40"
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: d * 0.15 }}
                      aria-hidden
                    />
                  ))}
                </motion.div>
              )}
              {step >= 3 && (
                <Bubble key="a" from="tutor">
                  <p>{t('landing.ai.chat.answerIntro')}</p>
                  <div className="my-2 rounded-xl bg-primary/[0.04] px-2 py-1 text-primary ring-1 ring-accent/30">
                    <Formula tex="\varepsilon = -N\,\frac{d\Phi_B}{dt}" block className="my-1" />
                  </div>
                  <p>{t('landing.ai.chat.answerOutro')}</p>
                </Bubble>
              )}
              {step >= 4 && (
                <Bubble key="thanks" from="student">
                  {t('landing.ai.chat.thanks')}
                </Bubble>
              )}
            </AnimatePresence>
          </div>

          {/* Composer */}
          <div className="flex items-center gap-2 border-t border-primary/5 bg-white px-3 py-3" aria-hidden>
            <span className="flex-1 rounded-full bg-cream px-4 py-2 text-xs text-muted">{t('landing.ai.chat.input')}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-accent">
              <SendHorizontal className="h-4 w-4 rtl:-scale-x-100" />
            </span>
          </div>
        </div>
      </figure>
    </div>
  );
}

function Bubble({ from, children }: { from: 'student' | 'tutor'; children: ReactNode }) {
  const student = from === 'student';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-soft',
        student ? 'self-end rounded-se-sm bg-gold-grad font-medium text-primary' : 'self-start rounded-ss-sm bg-white text-ink',
      )}
    >
      {children}
    </motion.div>
  );
}
