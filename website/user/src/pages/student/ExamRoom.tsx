import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  CloudOff,
  CloudUpload,
  Crown,
  Eraser,
  FileX2,
  Flag,
  LayoutGrid,
  Keyboard,
  LogOut,
  Send,
  TimerOff,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useSubjectLookup } from '@/api/catalog';
import { errorMessage, idempotencyKey, isApiError, sendKeepalive, type ApiError } from '@/api/client';
import { examsApi, useInvalidateExams, useStartExam } from '@/api/exams';
import type { ExamAttemptState } from '@/api/types';
import { ExamTimer } from '@/components/student/ExamTimer';
import { QuestionNavigator } from '@/components/student/exam/QuestionNavigator';
import { QuizCard } from '@/components/student/QuizCard';
import { Badge, Button, EmptyState, LogoMark, Modal, ProgressBar, Seo, SubjectIcon } from '@/components/ui';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';

/**
 * Exam room. EXM-03 starts the attempt or resumes the active one (server-assembled paper, no answers);
 * the countdown is server-authoritative (`endsAt` corrected by the client/server clock skew); state is
 * autosaved with a monotonic `seq` (EXM-05) every `autosaveSeconds` and shortly after each change;
 * flags go through EXM-06; submission (manual or on expiry) is idempotent (EXM-07 + Idempotency-Key).
 */
export default function ExamRoom() {
  const { examId } = useParams();
  const { t } = useTranslation();
  const start = useStartExam();
  const [attempt, setAttempt] = useState<ExamAttemptState | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!examId) return;
    setAttempt(null);
    setError(null);
    start.mutate(examId, { onSuccess: setAttempt, onError: setError });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  if (error || !examId) {
    const locked = !!error?.isLocked;
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream p-4">
        <Seo title={t('practice.room.notFound.title')} />
        <EmptyState
          className="w-full max-w-lg"
          icon={locked ? <Crown className="h-7 w-7" /> : <FileX2 className="h-7 w-7" />}
          title={error && error.status !== 404 ? errorMessage(error) : t('practice.room.notFound.title')}
          body={error && error.status !== 404 ? undefined : t('practice.room.notFound.body')}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              {locked && (
                <Button to="/student/subscription" variant="gold" leftIcon={<Crown className="h-4 w-4" />}>
                  {t('learn.subject.upgrade')}
                </Button>
              )}
              <Button to="/student/exams" leftIcon={<ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />}>
                {t('practice.room.backToExams')}
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream" role="status" aria-live="polite">
        <Seo title={t('common.loading')} />
        <LogoMark className="h-12 w-12 animate-pulse" />
        <p className="text-sm font-semibold text-muted">{t('practice.room.preparing')}</p>
      </div>
    );
  }

  if (attempt.status !== 'in_progress') {
    return <RedirectToResult attemptId={attempt.attemptId} />;
  }

  return <ExamRoomSession key={attempt.attemptId} initial={attempt} />;
}

function RedirectToResult({ attemptId }: { attemptId: string }) {
  const navigate = useNavigate();
  useEffect(() => navigate(`/student/exams/result/${attemptId}`, { replace: true }), [attemptId, navigate]);
  return null;
}

interface RoomState {
  order: string[];
  answers: Record<string, string | null>;
  flagged: string[];
  current: number;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline';

function ExamRoomSession({ initial }: { initial: ExamAttemptState }) {
  const { t } = useTranslation();
  const { l } = useLang();
  const navigate = useNavigate();
  const invalidateExams = useInvalidateExams();
  const exam = initial.exam;
  const subject = useSubjectLookup()(exam.subjectSlug);
  const attemptId = initial.attemptId;
  const questionsById = useRef(new Map(initial.questions.map((q) => [q.id, q])));

  const [session, setSession] = useState<RoomState>(() => ({
    order: initial.order.length ? initial.order : initial.questions.map((q) => q.id),
    answers: { ...initial.answers },
    flagged: [...initial.flagged],
    current: initial.currentIndex ?? 0,
  }));
  // Server-authoritative deadline in local clock terms: endsAt − (serverNow − localNow).
  const [endAt, setEndAt] = useState(() => {
    const skew = new Date(initial.serverNow).getTime() - Date.now();
    return new Date(initial.endsAt).getTime() - skew;
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState(() => (initial.lastSavedAt ? new Date(initial.lastSavedAt).getTime() : Date.now()));
  const [now, setNow] = useState(() => Date.now());
  const [submitOpen, setSubmitOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [timeUpId, setTimeUpId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const submittedRef = useRef(false);
  const seq = useRef(0);
  const dirty = useRef(false);
  const submitKey = useRef(idempotencyKey());
  const autosaveSeconds = Math.max(5, initial.autosaveSeconds || 15);

  const questions = session.order.map((id) => questionsById.current.get(id)).filter((q): q is NonNullable<typeof q> => !!q);
  const total = questions.length;
  const current = Math.min(session.current, total - 1);
  const q = questions[current];
  const answeredCount = session.order.filter((id) => session.answers[id] !== null && session.answers[id] !== undefined).length;
  const unanswered = total - answeredCount;

  const goToResult = useCallback(
    (id: string) => {
      invalidateExams();
      navigate(`/student/exams/result/${id}`, { replace: true });
    },
    [invalidateExams, navigate],
  );

  /* ------------------------------------------------------------ autosave (EXM-05) */

  const autosaveBody = () => {
    const s = sessionRef.current;
    seq.current += 1;
    return { answers: s.answers, flagged: s.flagged, currentIndex: s.current, clientSavedAt: new Date().toISOString(), seq: seq.current };
  };

  const save = useCallback(async () => {
    if (submittedRef.current || !dirty.current) return;
    dirty.current = false;
    setSaveStatus('saving');
    try {
      const res = await examsApi.autosave(attemptId, autosaveBody());
      const skew = new Date(res.serverNow).getTime() - Date.now();
      setEndAt(new Date(res.endsAt).getTime() - skew);
      setSavedAt(Date.now());
      setSaveStatus('saved');
    } catch (e) {
      if (isApiError(e) && (e.reason === 'EXAM_ALREADY_SUBMITTED' || e.reason === 'EXAM_TIME_OVER')) {
        submittedRef.current = true;
        setDone(true);
        setTimeUpId(attemptId);
        return;
      }
      dirty.current = true; // retry on the next tick
      setSaveStatus('offline');
    }
     
  }, [attemptId]);

  // Every change → save shortly after (debounced); plus the periodic cadence for safety.
  const initialRef = useRef(session);
  useEffect(() => {
    if (submittedRef.current) return;
    if (session === initialRef.current) return;
    dirty.current = true;
    const id = window.setTimeout(() => void save(), 1200);
    return () => window.clearTimeout(id);
  }, [session, save]);

  useEffect(() => {
    const id = window.setInterval(() => void save(), autosaveSeconds * 1000);
    return () => window.clearInterval(id);
  }, [save, autosaveSeconds]);

  // Leaving the tab / page: flush the latest state with a keepalive request.
  useEffect(() => {
    const flush = () => {
      if (submittedRef.current || !dirty.current) return;
      dirty.current = false;
      sendKeepalive('PUT', `/exams/attempts/${attemptId}/autosave`, autosaveBody());
    };
    const onVis = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
      flush();
    };
     
  }, [attemptId]);

  // Refresh the "Saved x min ago" label.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Warn before closing / reloading the tab while the exam is running.
  useEffect(() => {
    if (done) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [done]);

  const go = useCallback(
    (i: number) => setSession((s) => ({ ...s, current: Math.max(0, Math.min(s.order.length - 1, i)) })),
    [],
  );

  const select = useCallback(
    (choice: number) => {
      if (!q) return;
      const optionId = q.options[choice]?.id ?? null;
      setSession((s) => ({ ...s, answers: { ...s.answers, [q.id]: optionId } }));
    },
    [q],
  );

  const clearAnswer = () => q && setSession((s) => ({ ...s, answers: { ...s.answers, [q.id]: null } }));

  const toggleFlag = useCallback(() => {
    if (!q) return;
    const on = !sessionRef.current.flagged.includes(q.id);
    setSession((s) => ({ ...s, flagged: on ? [...s.flagged, q.id] : s.flagged.filter((f) => f !== q.id) }));
    // EXM-06 (best effort — the flag set is also part of every autosave).
    examsApi
      .flag(attemptId, q.id, on)
      .then((res) => setSession((s) => ({ ...s, flagged: res.flagged })))
      .catch(() => undefined);
  }, [q, attemptId]);

  /* ------------------------------------------------------------ submit (EXM-07) */

  const submit = useCallback(
    async (auto: boolean) => {
      if (submittedRef.current && !submitError) return;
      submittedRef.current = true;
      setSubmitting(true);
      setSubmitError(null);
      const s = sessionRef.current;
      seq.current += 1;
      try {
        const res = await examsApi.submit(
          attemptId,
          { reason: auto ? 'timeout' : 'manual', answers: s.answers, flagged: s.flagged, seq: seq.current },
          submitKey.current,
        );
        setDone(true);
        setSubmitOpen(false);
        setExitOpen(false);
        setNavOpen(false);
        if (auto) setTimeUpId(res.attemptId);
        else goToResult(res.attemptId);
      } catch (e) {
        if (isApiError(e) && e.reason === 'EXAM_ALREADY_SUBMITTED') {
          setDone(true);
          if (auto) setTimeUpId(attemptId);
          else goToResult(attemptId);
          return;
        }
        if (auto) {
          // The server's auto-submit job finalises the paper at endsAt + grace anyway.
          setDone(true);
          setTimeUpId(attemptId);
          return;
        }
        submittedRef.current = false;
        setSubmitError(errorMessage(e));
      } finally {
        setSubmitting(false);
      }
    },
    [attemptId, goToResult, submitError],
  );

  // After an automatic submission, move on to the result shortly.
  useEffect(() => {
    if (!timeUpId) return;
    const id = window.setTimeout(() => goToResult(timeUpId), 5000);
    return () => window.clearTimeout(id);
  }, [timeUpId, goToResult]);

  const anyModal = submitOpen || exitOpen || navOpen || !!timeUpId;

  // N / P / F shortcuts (QuizCard handles 1-4 / A-D).
  useEffect(() => {
    if (anyModal || done) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'n') go(current + 1);
      else if (k === 'p') go(current - 1);
      else if (k === 'f') toggleFlag();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anyModal, done, current, go, toggleFlag]);

  const saving = saveStatus === 'saving';
  const savedMinutes = Math.floor((now - savedAt) / 60_000);
  const saveLabel = saving
    ? t('practice.room.save.saving')
    : saveStatus === 'offline'
      ? t('practice.room.save.offline')
      : savedMinutes < 1
        ? t('practice.room.save.justNow')
        : t('practice.room.save.minutesAgo', { count: savedMinutes });

  const saveIndicator = (cls?: string) => (
    <span className={cn('items-center gap-1.5 text-xs font-medium text-muted', cls)} aria-live="polite">
      {saving ? (
        <CloudUpload className="h-4 w-4 animate-pulse text-accent" aria-hidden />
      ) : saveStatus === 'offline' ? (
        <CloudOff className="h-4 w-4 text-danger" aria-hidden />
      ) : (
        <span className="relative inline-flex text-success" aria-hidden>
          <Cloud className="h-4 w-4" />
          <Check className="absolute inset-0 m-auto h-2 w-2 translate-y-px" strokeWidth={4} />
        </span>
      )}
      {saveLabel}
    </span>
  );

  if (!q) return null;
  const isFlagged = session.flagged.includes(q.id);
  const isAnswered = session.answers[q.id] !== null && session.answers[q.id] !== undefined;
  const selectedIndex = isAnswered ? q.options.findIndex((o) => o.id === session.answers[q.id]) : -1;

  return (
    <div className="min-h-screen bg-cream">
      <Seo title={t('practice.room.seoTitle', { title: l(exam.title) })} description={l(exam.description)} />

      <header className="sticky top-0 z-40 border-b border-primary/10 bg-white/95 backdrop-blur">
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 sm:h-[72px] sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark className="h-9 w-9 shrink-0" />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-bold text-primary">{l(exam.title)}</p>
              <p className="flex items-center gap-1 truncate text-xs text-muted">
                {subject && <SubjectIcon id={subject.slug} icon={subject.icon} className="h-3 w-3" style={{ color: subject.color }} />}
                {subject && l(subject.name)} · {t('common.questions', { count: total })}
              </p>
            </div>
          </div>
          <ExamTimer endAt={endAt} onExpire={() => void submit(true)} stopped={done} />
          <div className="flex items-center justify-end gap-2">
            {saveIndicator('hidden xl:inline-flex')}
            <Button size="sm" variant="gold" onClick={() => setSubmitOpen(true)} leftIcon={<Send className="h-4 w-4 rtl:-scale-x-100" />}>
              <span className="hidden sm:inline">{t('practice.room.submit')}</span>
              <span className="sr-only sm:hidden">{t('practice.room.submit')}</span>
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setExitOpen(true)} aria-label={t('practice.room.exit')} className="h-9 w-9">
              <LogOut className="h-4 w-4 rtl:-scale-x-100" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 pb-32 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:pb-12 lg:pt-8">
        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-primary num">
              {t('practice.room.answeredOf', { done: answeredCount, total })}
            </p>
            {saveIndicator('inline-flex xl:hidden')}
          </div>
          <ProgressBar value={(answeredCount / Math.max(1, total)) * 100} label={t('practice.room.progressLabel')} className="mb-6" />

          <AnimatePresence mode="wait">
            <motion.div
              key={q.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
            >
              <QuizCard
                question={q}
                selected={selectedIndex >= 0 ? selectedIndex : null}
                onSelect={select}
                mode="exam"
                index={current}
                total={total}
                showBookmark={false}
                keyboard={!anyModal && !done}
                className={cn('transition-shadow', isFlagged && 'ring-2 ring-accent/60')}
              />
            </motion.div>
          </AnimatePresence>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={isFlagged ? 'gold' : 'subtle'}
                size="sm"
                onClick={toggleFlag}
                aria-pressed={isFlagged}
                leftIcon={<Flag className={cn('h-4 w-4', isFlagged && 'fill-primary')} />}
              >
                {isFlagged ? t('practice.room.unflag') : t('practice.room.flag')}
              </Button>
              {isAnswered && (
                <Button variant="ghost" size="sm" onClick={clearAnswer} leftIcon={<Eraser className="h-4 w-4" />}>
                  {t('practice.room.clearAnswer')}
                </Button>
              )}
            </div>
            <div className="hidden gap-2 lg:flex">
              <Button variant="subtle" onClick={() => go(current - 1)} disabled={current === 0} leftIcon={<ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />}>
                {t('common.previous')}
              </Button>
              {current === total - 1 ? (
                <Button variant="gold" onClick={() => setSubmitOpen(true)} leftIcon={<Send className="h-4 w-4 rtl:-scale-x-100" />}>
                  {t('practice.room.submit')}
                </Button>
              ) : (
                <Button onClick={() => go(current + 1)} rightIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}>
                  {t('common.next')}
                </Button>
              )}
            </div>
          </div>

          <p className="mt-6 hidden items-center gap-2 text-xs text-muted md:flex">
            <Keyboard className="h-4 w-4" aria-hidden />
            {t('practice.room.shortcuts')}
          </p>
        </div>

        <aside className="hidden lg:block" aria-label={t('practice.room.nav.title')}>
          <div className="card sticky top-24 p-5">
            <h2 className="mb-4 font-sans text-base font-bold tracking-normal text-primary">{t('practice.room.nav.title')}</h2>
            <QuestionNavigator order={session.order} answers={session.answers} flagged={session.flagged} current={current} onJump={go} />
            <Button variant="primary" fullWidth className="mt-6" onClick={() => setSubmitOpen(true)} leftIcon={<Send className="h-4 w-4 rtl:-scale-x-100" />}>
              {t('practice.room.submitExam')}
            </Button>
          </div>
        </aside>
      </main>

      {/* Mobile bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-primary/10 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <Button variant="subtle" size="icon" className="h-11 w-11 shrink-0" onClick={() => go(current - 1)} disabled={current === 0} aria-label={t('common.previous')}>
            <ArrowLeft className="h-5 w-5 rtl:-scale-x-100" />
          </Button>
          <Button variant="ghost" fullWidth className="border border-primary/10" onClick={() => setNavOpen(true)} leftIcon={<LayoutGrid className="h-4 w-4" />}>
            <span className="num">{t('practice.room.nav.open', { done: answeredCount, total })}</span>
            {session.flagged.length > 0 && (
              <Badge tone="gold" className="!px-1.5 !py-0">
                <Flag className="h-3 w-3" aria-hidden />
                {session.flagged.length}
              </Badge>
            )}
          </Button>
          {current === total - 1 ? (
            <Button variant="gold" size="icon" className="h-11 w-11 shrink-0" onClick={() => setSubmitOpen(true)} aria-label={t('practice.room.submit')}>
              <Send className="h-5 w-5 rtl:-scale-x-100" />
            </Button>
          ) : (
            <Button size="icon" className="h-11 w-11 shrink-0" onClick={() => go(current + 1)} aria-label={t('common.next')}>
              <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
            </Button>
          )}
        </div>
      </div>

      <Modal open={navOpen} onClose={() => setNavOpen(false)} title={t('practice.room.nav.title')}>
        <QuestionNavigator
          order={session.order}
          answers={session.answers}
          flagged={session.flagged}
          current={current}
          onJump={(i) => {
            go(i);
            setNavOpen(false);
          }}
        />
      </Modal>

      <Modal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title={t('practice.room.confirmSubmit.title')}
        description={t('practice.room.confirmSubmit.body')}
        footer={
          <>
            <Button variant="subtle" onClick={() => setSubmitOpen(false)}>
              {t('practice.room.confirmSubmit.back')}
            </Button>
            <Button variant="gold" loading={submitting} onClick={() => void submit(false)} leftIcon={<Send className="h-4 w-4 rtl:-scale-x-100" />}>
              {t('practice.room.confirmSubmit.confirm')}
            </Button>
          </>
        }
      >
        <dl className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-primary/5 p-3">
            <dt className="text-xs text-muted">{t('practice.room.nav.answered')}</dt>
            <dd className="text-2xl font-bold text-primary num">{answeredCount}</dd>
          </div>
          <div className={cn('rounded-2xl p-3', unanswered ? 'bg-danger/10' : 'bg-primary/5')}>
            <dt className="text-xs text-muted">{t('practice.room.nav.unanswered')}</dt>
            <dd className={cn('text-2xl font-bold num', unanswered ? 'text-danger' : 'text-primary')}>{unanswered}</dd>
          </div>
          <div className="rounded-2xl bg-accent/10 p-3">
            <dt className="text-xs text-muted">{t('practice.room.nav.flagged')}</dt>
            <dd className="text-2xl font-bold text-[#8A6A1F] num">{session.flagged.length}</dd>
          </div>
        </dl>
        {submitError && (
          <p role="alert" className="mt-4 rounded-2xl bg-danger/10 p-3 text-sm font-semibold text-danger">
            {submitError}
          </p>
        )}
        {(unanswered > 0 || session.flagged.length > 0) && (
          <div role="alert" className="mt-4 flex gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-[#92400E]">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div className="space-y-1">
              {unanswered > 0 && <p>{t('practice.room.confirmSubmit.unanswered', { count: unanswered })}</p>}
              {session.flagged.length > 0 && (
                <p>{t('practice.room.confirmSubmit.flagged', { count: session.flagged.length })}</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        size="sm"
        title={t('practice.room.confirmExit.title')}
        description={t('practice.room.confirmExit.body')}
        footer={
          <>
            <Button variant="subtle" onClick={() => setExitOpen(false)}>
              {t('practice.room.confirmExit.stay')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                void save();
                invalidateExams();
                navigate('/student/exams');
              }}
              leftIcon={<LogOut className="h-4 w-4 rtl:-scale-x-100" />}
            >
              {t('practice.room.confirmExit.leave')}
            </Button>
          </>
        }
      />

      <Modal
        open={!!timeUpId}
        onClose={() => undefined}
        persistent
        size="sm"
        footer={
          <Button
            variant="gold"
            fullWidth
            onClick={() => timeUpId && goToResult(timeUpId)}
          >
            {t('practice.room.timeUp.cta')}
          </Button>
        }
      >
        <div className="text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10 text-danger">
            <TimerOff className="h-8 w-8" aria-hidden />
          </span>
          <h2 className="mt-5 text-2xl font-bold text-primary">{t('practice.room.timeUp.title')}</h2>
          <p className="mt-2 text-muted">{t('practice.room.timeUp.body')}</p>
        </div>
      </Modal>
    </div>
  );
}
