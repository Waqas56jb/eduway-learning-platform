import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Crown, Lightbulb, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  sendTutorMessage,
  useAiAllowance,
  useAiConversation,
  useAiConversations,
  useAiSuggestions,
  useCreateConversation,
  useRateMessage,
} from '@/api/aiTutor';
import { useAppConfig } from '@/api/appSettings';
import { useSubjects } from '@/api/catalog';
import { errorMessage, isApiError } from '@/api/client';
import { keys } from '@/api/keys';
import { uploadFile } from '@/api/storage';
import type { AiAllowance, ConversationDto } from '@/api/types';
import { Button, ProgressRing, Seo, SubjectIcon, useToast } from '@/components/ui';
import { TutorAvatar, TutorChat } from '@/components/student/TutorChat';
import { Composer } from '@/components/student/tutor/Composer';
import {
  TUTOR_SUBJECT_KEY,
  newId,
  studentContent,
  toChatMessage,
  type ChatMessage,
} from '@/components/student/tutor/tutorEngine';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { readStore, writeStore } from '@/lib/storage';
import { cn } from '@/lib/utils';
import type { SubjectId } from '@/types';
import { lockedPlansPath } from '@/lib/plans';

/** Feature flag (PUB-01 `featureFlags`) that enables image attachments in the tutor composer. */
const ATTACH_FLAG = 'ai_tutor_attachments';

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

/**
 * AI tutor. One thread per subject = the newest conversation of that subject (AIT-03/05); "New chat"
 * creates a fresh one (AIT-04). Answers stream over SSE (AIT-08, falls back to polling AIT-09); the
 * allowance pill reads AIT-01 and is updated from the stream's meta/done events.
 */
export default function AiTutor() {
  const { t, i18n } = useTranslation();
  const { l, lang, fmtNumber } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: subjects = [] } = useSubjects();
  const { data: config } = useAppConfig();
  const allowanceQ = useAiAllowance();
  const createConversation = useCreateConversation();
  const rateMessage = useRateMessage();

  const [subject, setSubject] = useState<SubjectId>(() => readStore<string>(TUTOR_SUBJECT_KEY, 'math'));
  useEffect(() => writeStore(TUTOR_SUBJECT_KEY, subject), [subject]);
  // Fall back to the first subject when the remembered one no longer exists.
  useEffect(() => {
    if (subjects.length && !subjects.some((s) => s.slug === subject)) setSubject(subjects[0].slug);
  }, [subjects, subject]);

  const conversationsQ = useAiConversations(subject);
  const [activeId, setActiveId] = useState<Record<string, string | null>>({});
  const conversationId = activeId[subject] !== undefined ? activeId[subject] : (conversationsQ.data?.items[0]?.id ?? null);
  const conversationQ = useAiConversation(conversationId);
  const suggestionsQ = useAiSuggestions(subject);

  // In-flight messages (optimistic student bubble + the streaming tutor answer) and rating overrides.
  const [local, setLocal] = useState<ChatMessage[]>([]);
  const [ratings, setRatings] = useState<Record<string, 'up' | 'down' | undefined>>({});
  const [pending, setPending] = useState<SubjectId | null>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamingLive, setStreamingLive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

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

  const subj = subjects.find((s) => s.slug === subject);
  const serverMessages = useMemo(() => (conversationQ.data?.messages ?? []).map(toChatMessage), [conversationQ.data]);
  const welcome: ChatMessage = useMemo(
    () => ({ id: `welcome-${subject}`, role: 'tutor', kind: 'welcome', content: studentContent(''), at: new Date().toISOString() }),
    [subject],
  );
  const messages = useMemo(() => {
    const base = serverMessages.length ? serverMessages : [welcome];
    const ids = new Set(base.map((m) => m.id));
    return [...base, ...local.filter((m) => !ids.has(m.id))].map((m) => (m.id in ratings ? { ...m, rating: ratings[m.id] } : m));
  }, [serverMessages, welcome, local, ratings]);

  const allowance = allowanceQ.data;
  const aiQuota = allowance?.quota ?? 0;
  const left = allowance?.remaining ?? 0;
  const disabledReason = allowance && !allowance.enabled ? allowance.disabledReason : null;
  const locked = !!allowance && (!allowance.enabled || left === 0);
  // A "New chat" still being created counts as busy: a question sent meanwhile went to the previous
  // conversation and vanished from view once the new (empty) one became active.
  const busy = pending !== null || streamingId !== null || uploading || createConversation.isPending;
  const studentTurns = messages.filter((m) => m.role === 'student').length;
  const asked = new Set(messages.filter((m) => m.role === 'student').map((m) => m.content.en.trim().toLowerCase()));
  const extraSuggestion = useMemo(
    () => ({
      en: i18n.getFixedT('en')(`account.tutor.moreSuggestions.${subject}`, { defaultValue: '' }),
      ar: i18n.getFixedT('ar')(`account.tutor.moreSuggestions.${subject}`, { defaultValue: '' }),
    }),
    [i18n, subject],
  );
  const freshSuggestions = [...(suggestionsQ.data ?? []), extraSuggestion]
    .filter((s) => s.en || s.ar)
    .filter((s) => !asked.has(s.en.trim().toLowerCase()) && !asked.has(s.ar.trim().toLowerCase()))
    .slice(0, 3);

  const setAllowance = useCallback((a: AiAllowance | null | undefined) => {
    if (a) qc.setQueryData(keys.aiAllowance, a);
  }, [qc]);

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (conversationId) return conversationId;
    const conv = await createConversation.mutateAsync({ subjectId: subject });
    setActiveId((m) => ({ ...m, [subject]: conv.id }));
    return conv.id;
  }, [conversationId, createConversation, subject]);

  const finishStream = useCallback(
    (convId: string) => {
      setStreamingId(null);
      setStreamingLive(false);
      // Swap the local bubbles for the persisted thread.
      void qc.invalidateQueries({ queryKey: keys.aiConversation(convId) }).then(() => setLocal([]));
      void qc.invalidateQueries({ queryKey: [...keys.ai, 'conversations'] });
    },
    [qc],
  );
  const lastConv = useRef<string | null>(null);

  const send = useCallback(
    async (text: string, attachmentFileKey?: string) => {
      if (busy) return;
      if (locked) {
        toast.error(t('account.tutor.quotaTitle'), t('account.tutor.quotaBody'));
        return;
      }
      const target = subject;
      const tempId = newId('s');
      setLocal((xs) => [...xs, { id: tempId, role: 'student', content: studentContent(text), at: new Date().toISOString() }]);
      setPending(target);
      const controller = new AbortController();
      abortRef.current = controller;
      let tutorId: string | null = null;
      try {
        const convId = await ensureConversation();
        lastConv.current = convId;
        const result = await sendTutorMessage(
          convId,
          { text, lang, clientMessageId: tempId, attachmentFileKey },
          {
            onMeta: ({ studentMessage, tutorMessageId, allowance: a }) => {
              tutorId = tutorMessageId;
              setAllowance(a);
              setLocal((xs) => [
                ...xs.map((m) => (m.id === tempId ? toChatMessage(studentMessage) : m)),
                { id: tutorMessageId, role: 'tutor', content: studentContent(''), at: new Date().toISOString(), status: 'streaming' },
              ]);
              setPending(null);
              setStreamingLive(true);
              setStreamingId(tutorMessageId);
            },
            onDelta: (delta) => {
              setLocal((xs) => xs.map((m) => (m.id === tutorId ? { ...m, content: studentContent(m.content.en + delta) } : m)));
            },
          },
          controller.signal,
        );
        const final = toChatMessage(result.message);
        setLocal((xs) => {
          const has = xs.some((m) => m.id === final.id);
          return has ? xs.map((m) => (m.id === final.id ? { ...final, content: final.content.en ? final.content : m.content } : m)) : [...xs, final];
        });
        setPending(null);
        if (result.allowance) setAllowance(result.allowance);
        else void qc.invalidateQueries({ queryKey: keys.aiAllowance });
        if (!tutorId) {
          setStreamingId(final.id);
        }
        setStreamingLive(false);
        if (result.message.status === 'failed' || result.message.status === 'blocked') {
          toast.error(t(result.message.status === 'blocked' ? 'errors.reasons.AI_BLOCKED_CONTENT' : 'errors.UNKNOWN'));
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setPending(null);
        setStreamingId(null);
        setStreamingLive(false);
        setLocal((xs) => xs.filter((m) => m.id !== tempId && m.id !== tutorId));
        if (isApiError(e)) {
          const a = e.details.allowance as AiAllowance | undefined;
          if (a) setAllowance(a);
          else if (e.reason?.startsWith('AI_') || e.isLocked) void qc.invalidateQueries({ queryKey: keys.aiAllowance });
          if (e.isLocked) {
            toast.show({
              type: 'warning',
              title: errorMessage(e),
              action: { label: t('errors.viewPlans'), onClick: () => navigate(lockedPlansPath(e.locked)) },
            });
            return;
          }
        }
        toast.error(errorMessage(e));
      }
    },
    [busy, locked, subject, ensureConversation, lang, setAllowance, qc, toast, t, navigate],
  );

  const rate = useCallback(
    (id: string, rating: 'up' | 'down') => {
      const current = messages.find((m) => m.id === id)?.rating;
      const next = current === rating ? undefined : rating;
      setRatings((r) => ({ ...r, [id]: next }));
      rateMessage.mutate(
        { id, rating: next ?? null },
        {
          onSuccess: (m) => {
            if (conversationId)
              qc.setQueryData<ConversationDto>(keys.aiConversation(conversationId), (c) =>
                c ? { ...c, messages: c.messages.map((x) => (x.id === m.id ? m : x)) } : c,
              );
          },
          onError: () => setRatings((r) => ({ ...r, [id]: current })),
        },
      );
      // Thank the student when they rate, not when they undo a rating.
      if (current !== rating) toast.success(t('account.tutor.feedbackThanks'), t('account.tutor.feedbackBody'));
    },
    [messages, rateMessage, conversationId, qc, t, toast],
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
    abortRef.current?.abort();
    setPending(null);
    setStreamingId(null);
    setStreamingLive(false);
    setLocal([]);
    createConversation.mutate(
      { subjectId: subject },
      {
        onSuccess: (conv) => {
          setActiveId((m) => ({ ...m, [subject]: conv.id }));
          toast.info(t('account.tutor.newChatDone'));
        },
      },
    );
  };

  // Image attachments (STO-01 purpose ai_attachment) when the feature flag is on; otherwise the
  // existing "coming soon" notice.
  const attachEnabled = !!config?.featureFlags?.[ATTACH_FLAG];
  const onAttach = () => {
    if (!attachEnabled) {
      toast.info(t('account.tutor.attachSoon'), t('account.tutor.attachSoonBody'));
      return;
    }
    fileRef.current?.click();
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const fileKey = await uploadFile(file, 'ai_attachment');
      setUploading(false);
      await send('', fileKey);
    } catch (e) {
      setUploading(false);
      toast.error(errorMessage(e));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
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
              key={s.en || s.ar}
              type="button"
              whileHover={{ y: -2 }}
              onClick={() => void send(l(s))}
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
              <ProgressRing value={aiQuota ? (left / aiQuota) * 100 : 0} size={26} stroke={3.5} color={locked ? '#DC2626' : '#C9A24A'} />
              <span className="text-xs font-semibold text-primary num">
                {t('account.tutor.allowance', { left: fmtNumber(left), total: fmtNumber(aiQuota) })}
              </span>
            </div>
            <Button
              variant="subtle"
              size="sm"
              onClick={newChat}
              loading={createConversation.isPending}
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
              {subjects.map((s) => {
                const id = s.slug;
                const active = id === subject;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      if (busy) abortRef.current?.abort();
                      setPending(null);
                      setStreamingId(null);
                      setStreamingLive(false);
                      setLocal([]);
                      setSubject(id);
                    }}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200',
                      active ? 'shadow-sm' : 'border-primary/10 bg-white text-muted hover:border-primary/20 hover:text-primary',
                    )}
                    style={active ? { backgroundColor: `${s.color}14`, borderColor: `${s.color}55`, color: s.color } : undefined}
                  >
                    <SubjectIcon id={id} icon={s.icon} className="h-3.5 w-3.5" />
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
              <ProgressRing value={aiQuota ? (left / aiQuota) * 100 : 0} size={20} stroke={3} color={locked ? '#DC2626' : '#C9A24A'} />
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
          streamingLive={streamingLive}
          welcomeText={welcomeText}
          onStreamDone={() => (lastConv.current ? finishStream(lastConv.current) : setStreamingId(null))}
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
                  <p className="font-semibold">
                    {disabledReason === 'NOT_INCLUDED'
                      ? t('errors.locked.AI_NOT_INCLUDED')
                      : disabledReason === 'GLOBAL'
                        ? t('errors.reasons.AI_GLOBALLY_DISABLED')
                        : disabledReason === 'USER'
                          ? t('errors.reasons.AI_DISABLED')
                          : t('account.tutor.quotaTitle')}
                  </p>
                  <p className="text-sm text-white/70">
                    {disabledReason ? t('account.tutor.disabledBody') : t('account.tutor.quotaBody')}
                    {!disabledReason && allowance?.resetsAt && (
                      <> {t('account.tutor.resetsOn', { date: new Date(allowance.resetsAt).toLocaleDateString(lang === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB') })}</>
                    )}
                  </p>
                </div>
                {(disabledReason === 'NOT_INCLUDED' || !disabledReason) && (
                  <Button variant="gold" size="sm" to="/student/subscription">
                    {t('account.tutor.quotaCta')}
                  </Button>
                )}
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
                  onSend={(text) => void send(text)}
                  onAttach={onAttach}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
