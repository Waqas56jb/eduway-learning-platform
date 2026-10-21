import { motion } from 'framer-motion';
import { Crown, Lightbulb, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ProgressRing, Seo, SubjectIcon, useToast } from '@/components/ui';
import { TutorAvatar, TutorChat } from '@/components/student/TutorChat';
import { Composer } from '@/components/student/tutor/Composer';
import {
  TUTOR_STORE_KEY,
  TUTOR_SUBJECT_KEY,
  TUTOR_SUBJECTS,
  findAnswer,
  newId,
  seedAll,
  seedConversation,
  studentContent,
  type ChatMessage,
  type Conversations,
} from '@/components/student/tutor/tutorEngine';
import { getSubject, tutorSuggestions } from '@/data';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { useStudent } from '@/hooks/useProgress';
import { readStore, writeStore } from '@/lib/storage';
import { cn } from '@/lib/utils';
import type { SubjectId } from '@/types';

/** Clipboard API with a legacy fallback (unfocused documents, older WebViews, plain http). */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

function loadConversations(): Conversations {
  const stored = readStore<Partial<Conversations>>(TUTOR_STORE_KEY, {});
  const seeded = seedAll();
  for (const s of TUTOR_SUBJECTS) {
    const list = stored[s];
    if (Array.isArray(list) && list.length) seeded[s] = list;
  }
  return seeded;
}

export default function AiTutor() {
  const { t, i18n } = useTranslation();
  const { l, fmtNumber } = useLang();
  const { user } = useAuth();
  const { aiUsed, aiQuota, consumeAiQuestion } = useStudent();
  const toast = useToast();

  const [subject, setSubject] = useState<SubjectId>(() => {
    const s = readStore<string>(TUTOR_SUBJECT_KEY, 'math');
    return (TUTOR_SUBJECTS as string[]).includes(s) ? (s as SubjectId) : 'math';
  });
  const [convos, setConvos] = useState<Conversations>(loadConversations);
  const [pending, setPending] = useState<SubjectId | null>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const timer = useRef<number>();

  useEffect(() => writeStore(TUTOR_STORE_KEY, convos), [convos]);
  useEffect(() => writeStore(TUTOR_SUBJECT_KEY, subject), [subject]);

  // Keep the active subject chip visible in the horizontally scrolling row (phones).
  const chipsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = chipsRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!row || !chip) return;
    const r = row.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    if (c.left < r.left + 16 || c.right > r.right - 16) {
      row.scrollBy({ left: c.left + c.width / 2 - (r.left + r.width / 2), behavior: 'smooth' });
    }
  }, [subject]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const subj = getSubject(subject);
  const messages = convos[subject];
  const left = Math.max(0, aiQuota - aiUsed);
  const locked = left === 0;
  const busy = pending !== null || streamingId !== null;
  const studentTurns = messages.filter((m) => m.role === 'student').length;
  const asked = new Set(messages.filter((m) => m.role === 'student').map((m) => m.content.en.trim().toLowerCase()));
  const extraSuggestion = useMemo(
    () => ({
      en: i18n.getFixedT('en')(`account.tutor.moreSuggestions.${subject}`),
      ar: i18n.getFixedT('ar')(`account.tutor.moreSuggestions.${subject}`),
    }),
    [i18n, subject],
  );
  const freshSuggestions = [...tutorSuggestions[subject], extraSuggestion]
    .filter(
      (s) => !asked.has(s.en.trim().toLowerCase()) && !asked.has(s.ar.trim().toLowerCase()),
    )
    .slice(0, 3);

  const send = useCallback(
    (text: string) => {
      if (busy) return;
      if (!consumeAiQuestion()) {
        toast.error(t('account.tutor.quotaTitle'), t('account.tutor.quotaBody'));
        return;
      }
      const target = subject;
      const q: ChatMessage = { id: newId('s'), role: 'student', content: studentContent(text), at: new Date().toISOString() };
      setConvos((c) => ({ ...c, [target]: [...c[target], q] }));
      setPending(target);
      timer.current = window.setTimeout(
        () => {
          const a: ChatMessage = { id: newId('t'), role: 'tutor', content: findAnswer(text, target), at: new Date().toISOString() };
          setConvos((c) => ({ ...c, [target]: [...c[target], a] }));
          setPending(null);
          setStreamingId(a.id);
        },
        1200 + Math.random() * 800,
      );
    },
    [busy, consumeAiQuestion, subject, t, toast],
  );

  const rate = useCallback(
    (id: string, rating: 'up' | 'down') => {
      const current = convos[subject].find((m) => m.id === id)?.rating;
      setConvos((c) => ({
        ...c,
        [subject]: c[subject].map((m) => (m.id === id ? { ...m, rating: m.rating === rating ? undefined : rating } : m)),
      }));
      // Thank the student when they rate, not when they undo a rating.
      if (current !== rating) toast.success(t('account.tutor.feedbackThanks'), t('account.tutor.feedbackBody'));
    },
    [convos, subject, t, toast],
  );

  const copy = useCallback(
    async (text: string) => {
      const ok = await copyText(text.replace(/\*\*/g, ''));
      if (ok) toast.success(t('toast.copied'));
      else toast.error(t('toast.error'));
      return ok;
    },
    [t, toast],
  );

  const newChat = () => {
    window.clearTimeout(timer.current);
    setPending(null);
    setStreamingId(null);
    setConvos((c) => ({ ...c, [subject]: seedConversation(subject, false) }));
    toast.info(t('account.tutor.newChatDone'));
  };

  const welcomeText = useMemo(
    () => t('account.tutor.welcome', { name: l(user?.firstName), subject: l(subj?.name) }),
    [t, l, user, subj],
  );

  const suggestions =
    studentTurns <= 1 && !busy && !locked && freshSuggestions.length > 0 ? (
      <div className="ps-11">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Lightbulb className="h-3.5 w-3.5 text-accent" aria-hidden />
          {t('account.tutor.tryAsking')}
        </p>
        <div className="flex flex-wrap gap-2">
          {freshSuggestions.map((s) => (
            <motion.button
              key={s.en}
              type="button"
              whileHover={{ y: -2 }}
              onClick={() => send(l(s))}
              className="rounded-xl border border-accent/30 bg-white px-3.5 py-2 text-start text-sm font-medium text-primary shadow-sm transition-colors hover:border-accent hover:bg-accent/5"
            >
              {l(s)}
            </motion.button>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <>
      <Seo title={t('account.tutor.seoTitle')} description={t('account.tutor.seoDescription')} />
      <section
        aria-labelledby="tutor-title"
        className="card -mx-1 flex h-[calc(100svh-12.6rem)] min-h-[460px] flex-col overflow-hidden sm:mx-0 lg:h-[calc(100vh-10rem)] lg:min-h-[560px]"
      >
        {/* Header */}
        <header className="relative border-b border-primary/5 bg-gradient-to-b from-cream/80 to-white px-4 pb-3 pt-4 sm:px-6">
          <div
            className="pointer-events-none absolute -top-16 end-10 h-32 w-32 rounded-full bg-accent/20 blur-3xl"
            aria-hidden
          />
          <div className="relative flex items-center gap-3">
            <div className="relative">
              <TutorAvatar size={44} />
              <span className="absolute -bottom-0.5 -end-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-success" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h1 id="tutor-title" className="truncate font-sans text-lg font-bold text-primary rtl:font-display sm:text-xl">
                {t('account.tutor.name')}
              </h1>
              <p className="flex items-center gap-1.5 text-xs font-medium text-success">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                {t('account.tutor.online')}
              </p>
            </div>
            <div
              className={cn(
                'hidden items-center gap-2 rounded-full border px-2 py-1 pe-3 sm:flex',
                locked ? 'border-danger/20 bg-danger/5' : 'border-accent/30 bg-white',
              )}
              aria-label={t('account.tutor.allowanceAria', { left, total: aiQuota })}
              role="status"
            >
              <ProgressRing value={(left / aiQuota) * 100} size={26} stroke={3.5} color={locked ? '#DC2626' : '#C9A24A'} />
              <span className="text-xs font-semibold text-primary num">
                {t('account.tutor.allowance', { left: fmtNumber(left), total: fmtNumber(aiQuota) })}
              </span>
            </div>
            <Button
              variant="subtle"
              size="sm"
              onClick={newChat}
              leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />}
              aria-label={t('account.tutor.newChat')}
            >
              <span className="hidden md:inline">{t('account.tutor.newChat')}</span>
            </Button>
          </div>

          <div className="relative mt-3 flex items-center gap-3">
            <div
              ref={chipsRef}
              role="radiogroup"
              aria-label={t('account.tutor.subjectsLabel')}
              className="scrollbar-none -mx-4 flex flex-1 gap-2 overflow-x-auto px-4 [mask-image:linear-gradient(90deg,transparent,#000_16px,#000_calc(100%-16px),transparent)] sm:mx-0 sm:px-0 sm:[mask-image:none]"
            >
              {TUTOR_SUBJECTS.map((id) => {
                const s = getSubject(id);
                if (!s) return null;
                const active = id === subject;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setStreamingId(null);
                      setSubject(id);
                    }}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200',
                      active ? 'shadow-sm' : 'border-primary/10 bg-white text-muted hover:border-primary/20 hover:text-primary',
                    )}
                    style={active ? { backgroundColor: `${s.color}14`, borderColor: `${s.color}55`, color: s.color } : undefined}
                  >
                    <SubjectIcon id={id} className="h-3.5 w-3.5" />
                    {l(s.name)}
                  </button>
                );
              })}
            </div>
            <div
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-1.5 py-1 pe-2.5 sm:hidden',
                locked ? 'border-danger/20 bg-danger/5' : 'border-accent/30 bg-white',
              )}
              aria-label={t('account.tutor.allowanceAria', { left, total: aiQuota })}
              role="status"
            >
              <ProgressRing value={(left / aiQuota) * 100} size={20} stroke={3} color={locked ? '#DC2626' : '#C9A24A'} />
              <span className="text-[11px] font-semibold text-primary num">
                {fmtNumber(left)}/{fmtNumber(aiQuota)}
              </span>
            </div>
          </div>
        </header>

        {/* Messages */}
        <TutorChat
          key={subject}
          messages={messages}
          typing={pending === subject}
          streamingId={streamingId}
          welcomeText={welcomeText}
          onStreamDone={() => setStreamingId(null)}
          onRate={rate}
          onCopy={copy}
          footer={suggestions}
        />

        {/* Composer */}
        <div className="border-t border-primary/5 bg-cream/60 px-3 pb-3 pt-3 sm:px-6 sm:pb-4">
          <div className="mx-auto max-w-3xl">
            {locked ? (
              <div className="flex flex-col items-start gap-3 rounded-2xl bg-navy-grad p-4 text-white sm:flex-row sm:items-center">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent-light">
                  <Crown className="h-5 w-5" aria-hidden />
                </span>
                <div className="flex-1">
                  <p className="font-semibold">{t('account.tutor.quotaTitle')}</p>
                  <p className="text-sm text-white/70">{t('account.tutor.quotaBody')}</p>
                </div>
                <Button variant="gold" size="sm" to="/student/subscription">
                  {t('account.tutor.quotaCta')}
                </Button>
              </div>
            ) : (
              <>
                {left <= 5 && (
                  <p className="mb-2 text-center text-xs font-semibold text-[#B45309]">
                    {t('account.tutor.lowQuota', { n: fmtNumber(left) })}
                  </p>
                )}
                <Composer
                  placeholder={t('account.tutor.placeholder', { subject: l(subj?.name) })}
                  compactPlaceholder={t('account.tutor.placeholderShort')}
                  busy={busy}
                  onSend={send}
                  onAttach={() => toast.info(t('account.tutor.attachSoon'), t('account.tutor.attachSoonBody'))}
                />
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
