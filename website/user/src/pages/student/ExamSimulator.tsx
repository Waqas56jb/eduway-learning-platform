import {
  ArrowRight,
  Award,
  CloudUpload,
  Flag,
  History,
  Hourglass,
  ListChecks,
  Lock,
  Play,
  RotateCcw,
  ShieldCheck,
  Target,
  TimerOff,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useLearningSettings } from '@/api/appSettings';
import { useSubjectLookup } from '@/api/catalog';
import { useAvailableExams, useExamAttempts } from '@/api/exams';
import {
  ErrorState,
  Badge,
  Button,
  fadeUp,
  HoverCard,
  Modal,
  PageHeader,
  Reveal,
  Seo,
  Skeleton,
  SkeletonList,
  SmartImage,
  SubjectBadgeIcon,
} from '@/components/ui';
import { useLang } from '@/hooks/useLang';
import { IMAGES } from '@/lib/images';
import { cn, formatClock } from '@/lib/utils';
import type { ExamBlueprint } from '@/types';

const RULES = [
  { k: 'timed', icon: Hourglass },
  { k: 'autosave', icon: CloudUpload },
  { k: 'flag', icon: Flag },
  { k: 'autoSubmit', icon: TimerOff },
] as const;

export default function ExamSimulator() {
  const { t } = useTranslation();
  const { l, fmtDate } = useLang();
  const navigate = useNavigate();
  // EXM-01 available papers (+ per-user attempts/best/active attempt), EXM-09 history, PUB-01 default pass mark.
  const examsQ = useAvailableExams();
  const attemptsQ = useExamAttempts();
  const { examDefaultPassMark } = useLearningSettings();
  const subjectOf = useSubjectLookup();
  const exams = useMemo(() => examsQ.data ?? [], [examsQ.data]);
  const ready = !examsQ.isLoading;
  const [confirm, setConfirm] = useState<ExamBlueprint | null>(null);

  const history = useMemo(
    () =>
      (attemptsQ.data?.items ?? [])
        .filter((a) => a.status !== 'in_progress')
        .map((a) => ({ id: a.id, examId: a.examId, title: a.title, subjectSlug: a.subjectSlug, date: a.date, pct: Math.round(a.score), passed: a.passed }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [attemptsQ.data],
  );

  const totalQuestions = exams.reduce((n, e) => n + e.questionCount, 0);

  return (
    <>
      <Seo title={t('practice.exams.seoTitle')} description={t('practice.exams.seoDescription')} />
      <PageHeader title={t('practice.exams.title')} subtitle={t('practice.exams.subtitle')} />

      <Reveal>
        <section
          aria-labelledby="exam-hero-title"
          className="relative overflow-hidden rounded-3xl bg-navy-grad p-6 text-white shadow-lift sm:p-10"
        >
          <SmartImage
            src={IMAGES.writing}
            alt=""
            aria-hidden
            wrapperClassName="!absolute inset-0 opacity-[0.12]"
            className="h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute -end-20 -top-24 h-72 w-72 rounded-full bg-accent/25 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-24 -start-10 h-56 w-56 rounded-full bg-accent/10 blur-3xl" aria-hidden />
          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <span className="eyebrow">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                {t('practice.exams.hero.eyebrow')}
              </span>
              <h2 id="exam-hero-title" className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">
                {t('practice.exams.hero.titleStart')} <span className="text-gold-grad">{t('practice.exams.hero.titleHighlight')}</span>
              </h2>
              <p className="mt-3 max-w-xl text-white/70">{t('practice.exams.hero.body')}</p>
              <dl className="mt-6 flex flex-wrap gap-6">
                <div>
                  <dt className="text-xs text-white/55">{t('practice.exams.hero.papers')}</dt>
                  <dd className="text-2xl font-bold text-accent-light num">{exams.length}</dd>
                </div>
                <div>
                  <dt className="text-xs text-white/55">{t('practice.exams.hero.questions')}</dt>
                  <dd className="text-2xl font-bold text-accent-light num">{totalQuestions}</dd>
                </div>
                <div>
                  <dt className="text-xs text-white/55">{t('practice.exams.hero.passMark')}</dt>
                  <dd className="text-2xl font-bold text-accent-light num">{examDefaultPassMark}%</dd>
                </div>
              </dl>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {RULES.map((r) => (
                <li key={r.k} className="glass-navy flex items-start gap-3 rounded-2xl border border-white/10 p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-light">
                    <r.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-white">{t(`practice.exams.rules.${r.k}.title`)}</span>
                    <span className="text-xs text-white/60">{t(`practice.exams.rules.${r.k}.body`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </Reveal>

      <section aria-labelledby="blueprints-title" className="mt-12">
        <h2 id="blueprints-title" className="text-2xl font-bold text-primary">
          {t('practice.exams.blueprints')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('practice.exams.blueprintsSub')}</p>
        {examsQ.isError ? (
          <ErrorState className="mt-6" onRetry={() => void examsQ.refetch()} />
        ) : !ready ? (
          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((e) => (
              <div key={e} className="card space-y-4 p-6">
                <div className="flex gap-3">
                  <Skeleton className="h-12 w-12" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <Reveal staggerChildren={0.08} className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {exams.map((e) => (
              <BlueprintCard
                key={e.id}
                exam={e}
                attemptsLeft={e.attemptsLeft}
                best={e.bestScore ?? undefined}
                onStart={() => setConfirm(e)}
                onResume={() => navigate(`/student/exams/${e.id}/room`)}
              />
            ))}
          </Reveal>
        )}
      </section>

      <section aria-labelledby="recent-title" className="mt-12">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-accent" aria-hidden />
          <h2 id="recent-title" className="text-2xl font-bold text-primary">
            {t('practice.exams.recent')}
          </h2>
        </div>
        {attemptsQ.isLoading ? (
          <SkeletonList rows={3} className="mt-5" />
        ) : history.length === 0 ? (
          <p className="card mt-5 p-6 text-center text-sm text-muted">{t('practice.exams.noHistory')}</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {history.map((h) => {
              const subject = subjectOf(h.subjectSlug);
              const exam = { title: h.title };
              const pass = h.passed;
              return (
                <li key={h.id}>
                  <Link
                    to={`/student/exams/result/${h.id}`}
                    className="card group flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-lift sm:p-5"
                  >
                    <SubjectBadgeIcon id={h.subjectSlug} color={subject?.color ?? '#0B1F3A'} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-semibold text-primary sm:line-clamp-1">{l(exam.title)}</span>
                      <span className="text-xs text-muted">{fmtDate(h.date, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </span>
                    <span className="text-end">
                      <span className={cn('block text-xl font-bold num', pass ? 'text-success' : 'text-danger')}>{h.pct}%</span>
                      <Badge tone={pass ? 'success' : 'danger'} className="mt-0.5">
                        {pass ? t('practice.result.passed') : t('practice.result.failed')}
                      </Badge>
                    </span>
                    <ArrowRight className="hidden h-5 w-5 shrink-0 text-muted transition group-hover:text-accent rtl:-scale-x-100 sm:block" aria-hidden />
                    <span className="sr-only">{t('practice.exams.viewResult')}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm ? l(confirm.title) : undefined}
        description={t('practice.exams.confirm.body')}
        footer={
          <>
            <Button variant="subtle" onClick={() => setConfirm(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="gold"
              leftIcon={<Play className="h-4 w-4 rtl:-scale-x-100" />}
              onClick={() => confirm && navigate(`/student/exams/${confirm.id}/room`)}
            >
              {t('practice.exams.confirm.ready')}
            </Button>
          </>
        }
      >
        {confirm && (
          <>
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-primary/5 p-3">
                <dt className="text-xs text-muted">{t('practice.exams.card.questions')}</dt>
                <dd className="text-xl font-bold text-primary num">{confirm.questionCount}</dd>
              </div>
              <div className="rounded-2xl bg-primary/5 p-3">
                <dt className="text-xs text-muted">{t('practice.exams.card.duration')}</dt>
                <dd className="text-xl font-bold text-primary num">{t('common.minutes', { count: confirm.durationMin })}</dd>
              </div>
              <div className="rounded-2xl bg-accent/10 p-3">
                <dt className="text-xs text-muted">{t('practice.exams.card.passMark')}</dt>
                <dd className="text-xl font-bold text-[#8A6A1F] num">{confirm.passMark}%</dd>
              </div>
            </dl>
            <h3 className="mt-6 font-sans text-sm font-bold tracking-normal text-primary">{t('practice.exams.confirm.rulesTitle')}</h3>
            <ul className="mt-3 space-y-2.5">
              {(['r1', 'r2', 'r3', 'r4', 'r5'] as const).map((k) => (
                <li key={k} className="flex items-start gap-2.5 text-sm text-ink">
                  <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                  {t(`practice.exams.confirm.${k}`)}
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>
    </>
  );
}

function BlueprintCard({
  exam,
  attemptsLeft,
  best,
  onStart,
  onResume,
}: {
  exam: ExamBlueprint;
  attemptsLeft: number;
  best?: number;
  onStart: () => void;
  onResume: () => void;
}) {
  const { t } = useTranslation();
  const { l, fmtDate } = useLang();
  const subject = useSubjectLookup()(exam.subjectSlug) ?? { id: exam.subjectSlug, color: '#0B1F3A', name: { en: '', ar: '' } };
  const inProgress = exam.activeAttempt;
  const remaining = inProgress ? Math.max(0, Math.round((new Date(inProgress.endsAt).getTime() - Date.now()) / 1000)) : 0;
  const noAttempts = attemptsLeft === 0 && !inProgress;
  const notOpen = !exam.available && !inProgress;
  const locked = noAttempts || notOpen || exam.locked;

  return (
    <HoverCard variants={fadeUp} className="flex h-full flex-col overflow-hidden p-0">
      <div className="h-1.5" style={{ backgroundColor: subject.color }} aria-hidden />
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start gap-3">
          <SubjectBadgeIcon id={exam.subjectSlug} color={subject.color} size={48} />
          <div className="min-w-0">
            <h3 className="font-sans text-lg font-bold leading-snug tracking-normal text-primary">{l(exam.title)}</h3>
            <p className="text-xs font-semibold" style={{ color: subject.color }}>
              {l(subject.name)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">{l(exam.description)}</p>

        <dl className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-cream p-3 text-center">
          <div>
            <dt className="text-[11px] text-muted">{t('practice.exams.card.questions')}</dt>
            <dd className="font-bold text-primary num">{exam.questionCount}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted">{t('practice.exams.card.duration')}</dt>
            <dd className="font-bold text-primary num">{t('common.minutes', { count: exam.durationMin })}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted">{t('practice.exams.card.passMark')}</dt>
            <dd className="font-bold text-primary num">{exam.passMark}%</dd>
          </div>
        </dl>

        <div className="mt-5 flex items-center justify-between gap-3 text-sm">
          <div>
            <p className="text-xs text-muted">{t('practice.exams.card.attempts')}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="flex gap-1" aria-hidden>
                {Array.from({ length: exam.attemptsTotal }).map((_, i) => (
                  <span key={i} className={cn('h-2 w-5 rounded-full', i < attemptsLeft ? 'bg-accent' : 'bg-primary/10')} />
                ))}
              </span>
              <span className="text-xs font-semibold text-primary num">
                {t('practice.exams.card.attemptsLeft', { left: attemptsLeft, total: exam.attemptsTotal })}
              </span>
            </div>
          </div>
          {typeof best === 'number' ? (
            <div className="text-end">
              <p className="text-xs text-muted">{t('practice.exams.card.best')}</p>
              <p className={cn('flex items-center justify-end gap-1 font-bold num', best >= exam.passMark ? 'text-success' : 'text-danger')}>
                <Award className="h-4 w-4" aria-hidden />
                {best}%
              </p>
            </div>
          ) : (
            <Badge tone="gold">
              <Target className="h-3 w-3" aria-hidden />
              {t('practice.exams.card.notTaken')}
            </Badge>
          )}
        </div>

        <div className="mt-auto pt-6">
          {inProgress ? (
            <Button variant="gold" fullWidth onClick={onResume} leftIcon={<RotateCcw className="h-4 w-4" />}>
              {t('practice.exams.card.resume', { time: formatClock(remaining) })}
            </Button>
          ) : exam.locked ? (
            <Button fullWidth variant="outline" to="/student/subscription" leftIcon={<Lock className="h-4 w-4" />}>
              {t('learn.subject.upgrade')}
            </Button>
          ) : (
            <Button
              fullWidth
              onClick={onStart}
              disabled={locked}
              leftIcon={locked ? <Lock className="h-4 w-4" /> : <Play className="h-4 w-4 rtl:-scale-x-100" />}
            >
              {notOpen
                ? t('practice.exams.card.opensOn', { date: fmtDate(exam.availableFrom, { day: 'numeric', month: 'short' }) })
                : noAttempts
                  ? t('practice.exams.card.noAttempts')
                  : t('practice.exams.card.start')}
            </Button>
          )}
        </div>
      </div>
    </HoverCard>
  );
}
