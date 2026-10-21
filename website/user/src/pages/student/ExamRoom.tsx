import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  CloudUpload,
  Eraser,
  FileX2,
  Flag,
  LayoutGrid,
  Keyboard,
  LogOut,
  Send,
  TimerOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ExamTimer } from '@/components/student/ExamTimer';
import { QuestionNavigator } from '@/components/student/exam/QuestionNavigator';
import {
  clearExamSession,
  readExamSession,
  writeExamSession,
  type ExamSession,
} from '@/components/student/exam/examUtils';
import { QuizCard } from '@/components/student/QuizCard';
import { Badge, Button, EmptyState, LogoMark, Modal, ProgressBar, Seo, SubjectIcon } from '@/components/ui';
import { getExam, getQuestion, getSubject } from '@/data';
import { useLang } from '@/hooks/useLang';
import { useStudent } from '@/hooks/useProgress';
import { cn, shuffle } from '@/lib/utils';
import type { ExamBlueprint, Question } from '@/types';

export default function ExamRoom() {
  const { examId } = useParams();
  const exam = getExam(examId);
  const { t } = useTranslation();

  if (!exam) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream p-4">
        <Seo title={t('practice.room.notFound.title')} />
        <EmptyState
          className="w-full max-w-lg"
          icon={<FileX2 className="h-7 w-7" />}
          title={t('practice.room.notFound.title')}
          body={t('practice.room.notFound.body')}
          action={
            <Button to="/student/exams" leftIcon={<ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />}>
              {t('practice.room.backToExams')}
            </Button>
          }
        />
      </div>
    );
  }
  return <ExamRoomSession key={exam.id} exam={exam} />;
}

const newSession = (exam: ExamBlueprint): ExamSession => {
  const now = Date.now();
  return {
    examId: exam.id,
    startedAt: now,
    endAt: now + exam.durationMin * 60_000,
    order: shuffle(exam.questionIds),
    answers: {},
    flagged: [],
    current: 0,
    savedAt: now,
  };
};

function ExamRoomSession({ exam }: { exam: ExamBlueprint }) {
  const { t } = useTranslation();
  const { l } = useLang();
  const navigate = useNavigate();
  const { saveAttempt, addMistake } = useStudent();
  const subject = getSubject(exam.subjectId);

  const [session, setSession] = useState<ExamSession>(() => readExamSession(exam) ?? newSession(exam));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(session.savedAt);
  const [now, setNow] = useState(() => Date.now());
  const [submitOpen, setSubmitOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [timeUpId, setTimeUpId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const sessionRef = useRef(session);
  const submittedRef = useRef(false);
  const firstSave = useRef(true);

  const questions = useMemo(
    () => session.order.map((id) => getQuestion(id)).filter((q): q is Question => !!q),
    [session.order],
  );
  const total = questions.length;
  const current = Math.min(session.current, total - 1);
  const q = questions[current];
  const answeredCount = session.order.filter((id) => session.answers[id] !== null && session.answers[id] !== undefined).length;
  const unanswered = total - answeredCount;

  // Autosave every change (answers, flags, position).
  useEffect(() => {
    sessionRef.current = session;
    if (submittedRef.current) return;
    writeExamSession({ ...session, savedAt: Date.now() });
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    setSaving(true);
    const id = window.setTimeout(() => {
      setSaving(false);
      setSavedAt(Date.now());
    }, 650);
    return () => window.clearTimeout(id);
  }, [session]);

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
      setSession((s) => ({ ...s, answers: { ...s.answers, [q.id]: choice } }));
    },
    [q],
  );

  const clearAnswer = () => q && setSession((s) => ({ ...s, answers: { ...s.answers, [q.id]: null } }));

  const toggleFlag = useCallback(() => {
    if (!q) return;
    setSession((s) => ({
      ...s,
      flagged: s.flagged.includes(q.id) ? s.flagged.filter((f) => f !== q.id) : [...s.flagged, q.id],
    }));
  }, [q]);

  const submit = useCallback(
    (auto: boolean) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      const s = sessionRef.current;
      const finished = Date.now();
      const id = `att-${finished}`;
      const answers = Object.fromEntries(s.order.map((qid) => [qid, s.answers[qid] ?? null]));
      saveAttempt({
        id,
        examId: exam.id,
        answers,
        flagged: s.flagged,
        questionIds: s.order,
        // Derived from the deadline so an auto-submitted paper always reports the full duration.
        timeSpentSec: Math.max(0, Math.min(exam.durationMin * 60, Math.round(exam.durationMin * 60 - (s.endAt - finished) / 1000))),
        finishedAt: new Date(finished).toISOString(),
        autoSubmitted: auto,
      });
      for (const qid of s.order) {
        const ans = answers[qid];
        const question = getQuestion(qid);
        if (question && ans !== null && ans !== question.correctIndex) addMistake(qid, ans, 'exam');
      }
      clearExamSession(exam.id);
      setDone(true);
      setSubmitOpen(false);
      setExitOpen(false);
      setNavOpen(false);
      if (auto) setTimeUpId(id);
      else navigate(`/student/exams/result/${id}`, { replace: true });
    },
    [exam, saveAttempt, addMistake, navigate],
  );

  // After an automatic submission, move on to the result shortly.
  useEffect(() => {
    if (!timeUpId) return;
    const id = window.setTimeout(() => navigate(`/student/exams/result/${timeUpId}`, { replace: true }), 5000);
    return () => window.clearTimeout(id);
  }, [timeUpId, navigate]);

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

  const savedMinutes = Math.floor((now - savedAt) / 60_000);
  const saveLabel = saving
    ? t('practice.room.save.saving')
    : savedMinutes < 1
      ? t('practice.room.save.justNow')
      : t('practice.room.save.minutesAgo', { count: savedMinutes });

  const saveIndicator = (cls?: string) => (
    <span className={cn('items-center gap-1.5 text-xs font-medium text-muted', cls)} aria-live="polite">
      {saving ? (
        <CloudUpload className="h-4 w-4 animate-pulse text-accent" aria-hidden />
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
                {subject && <SubjectIcon id={subject.id} className="h-3 w-3" style={{ color: subject.color }} />}
                {subject && l(subject.name)} · {t('common.questions', { count: total })}
              </p>
            </div>
          </div>
          <ExamTimer endAt={session.endAt} onExpire={() => submit(true)} stopped={done} />
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
                selected={session.answers[q.id] ?? null}
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
            <Button variant="gold" onClick={() => submit(false)} leftIcon={<Send className="h-4 w-4 rtl:-scale-x-100" />}>
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
            <Button variant="danger" onClick={() => navigate('/student/exams')} leftIcon={<LogOut className="h-4 w-4 rtl:-scale-x-100" />}>
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
            onClick={() => timeUpId && navigate(`/student/exams/result/${timeUpId}`, { replace: true })}
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
