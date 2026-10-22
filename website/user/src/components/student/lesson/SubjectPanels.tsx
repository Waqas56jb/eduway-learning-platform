import { ArrowRight, ClipboardList, Clock3, FileQuestion, Medal, RotateCcw, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuestionStats, useSubjectExams } from '@/api/catalog';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, HoverCard, Skeleton, SkeletonList } from '@/components/ui';
import { Formula, MathText } from '@/components/ui/MathText';
import { useLang } from '@/hooks/useLang';
import type { Difficulty, Subject } from '@/types';

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];
const DIFF_COLOR: Record<Difficulty, string> = { easy: '#059669', medium: '#F59E0B', hard: '#DC2626' };

export function QuestionBankPanel({ subject }: { subject: Subject }) {
  const { t } = useTranslation();
  const { l, fmtNumber } = useLang();
  // CAT-03: real published-question counts by difficulty and unit + 3 sample questions.
  const { data, isLoading, isError, refetch } = useQuestionStats(subject.slug);
  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="grid gap-6 lg:grid-cols-5" aria-busy="true">
        <Skeleton className="h-96 rounded-2xl lg:col-span-3" />
        <SkeletonList rows={3} className="lg:col-span-2" />
      </div>
    );
  }
  const totals = data.byDifficulty;
  const units = [...data.byUnit]
    .sort((a, b) => a.order - b.order)
    .map((u) => ({ unit: { id: u.unitId, title: u.title }, total: u.total, counts: { easy: u.easy, medium: u.medium, hard: u.hard } as Record<Difficulty, number> }));
  const samples = data.samples;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="p-5 sm:p-6 lg:col-span-3">
        <CardHeader
          title={t('learn.subject.bank.title')}
          subtitle={t('learn.subject.bank.subtitle', { total: fmtNumber(data.total) })}
        />
        <div className="mt-5 grid grid-cols-3 gap-3">
          {DIFFS.map((d) => (
            <div key={d} className="rounded-2xl border border-primary/5 p-3 text-center sm:p-4">
              <p className="text-xl font-bold num sm:text-2xl" style={{ color: DIFF_COLOR[d] }}>
                {fmtNumber(totals[d])}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-muted">{t(`common.difficulty.${d}`)}</p>
            </div>
          ))}
        </div>

        <h4 className="mt-7 font-sans text-sm font-bold tracking-normal text-primary">{t('learn.subject.bank.byUnit')}</h4>
        <ul className="mt-3 space-y-4">
          {units.map(({ unit, total, counts }, i) => (
            <li key={unit.id}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-semibold text-ink">
                  <span className="text-muted">{t('learn.list.unit', { n: i + 1 })} · </span>
                  {l(unit.title)}
                </span>
                <span className="shrink-0 font-bold text-primary num">{fmtNumber(total)}</span>
              </div>
              <div
                className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-primary/5"
                role="img"
                aria-label={DIFFS.map((d) => `${t(`common.difficulty.${d}`)}: ${counts[d]}`).join(', ')}
              >
                {DIFFS.map((d) => (
                  <span
                    key={d}
                    className="h-full first:rounded-s-full last:rounded-e-full"
                    style={{ width: `${(counts[d] / Math.max(1, total)) * 100}%`, backgroundColor: DIFF_COLOR[d] }}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-4 text-xs text-muted">
          {DIFFS.map((d) => (
            <span key={d} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DIFF_COLOR[d] }} aria-hidden />
              {t(`common.difficulty.${d}`)}
            </span>
          ))}
        </div>
      </Card>

      <div className="flex flex-col gap-4 lg:col-span-2">
        <h3 className="font-sans text-base font-bold tracking-normal text-primary rtl:font-display">
          {t('learn.subject.bank.samples')}
        </h3>
        {samples.map((q) => (
          <Card key={q.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={subject.color}>{l(q.topic)}</Badge>
              <Badge tone={q.difficulty === 'easy' ? 'success' : q.difficulty === 'medium' ? 'warning' : 'danger'}>
                {t(`common.difficulty.${q.difficulty}`)}
              </Badge>
            </div>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-primary">
              <MathText text={l(q.text)} />
            </p>
            {q.formula && (
              <div className="mt-2 overflow-x-auto rounded-lg bg-cream px-3 py-1 text-sm">
                <Formula tex={q.formula} />
              </div>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <FileQuestion className="h-3.5 w-3.5" aria-hidden />
              {t('learn.subject.bank.options', { count: q.options.length })}
            </p>
          </Card>
        ))}
        <Button
          to={`/student/question-bank?subject=${subject.slug}`}
          variant="gold"
          fullWidth
          rightIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}
        >
          {t('learn.subject.bank.practice', { subject: l(subject.name) })}
        </Button>
      </div>
    </div>
  );
}

export function ExamsPanel({ subject }: { subject: Subject }) {
  const { t } = useTranslation();
  const { l } = useLang();
  // CAT-04: published blueprints for this subject with the caller's attempts/best score.
  const { data: list = [], isLoading, isError, refetch } = useSubjectExams(subject.slug);
  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isLoading) return <SkeletonList rows={2} />;

  if (!list.length) {
    return (
      <EmptyState
        icon={<ClipboardList className="h-7 w-7" />}
        title={t('learn.subject.exams.emptyTitle')}
        body={t('learn.subject.exams.emptyBody', { subject: l(subject.name) })}
        action={
          <Button to="/student/exams" variant="primary" rightIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}>
            {t('learn.subject.exams.open')}
          </Button>
        }
      />
    );
  }

  return (
    <ul className="grid gap-5 md:grid-cols-2">
      {list.map((e) => (
        <li key={e.id}>
          <HoverCard className="relative flex h-full flex-col overflow-hidden p-6">
            <span className="absolute inset-y-0 start-0 w-1" style={{ backgroundColor: subject.color }} aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-accent">
                <ClipboardList className="h-5 w-5" aria-hidden />
              </span>
              {typeof e.bestScore === 'number' && (
                <Badge tone="gold">
                  <Medal className="h-3.5 w-3.5" aria-hidden />
                  {t('learn.subject.exams.best', { score: e.bestScore })}
                </Badge>
              )}
            </div>
            <h3 className="mt-4 font-sans text-lg font-bold tracking-normal text-primary rtl:font-display">{l(e.title)}</h3>
            <p className="mt-1 text-sm text-muted">{l(e.description)}</p>
            <ul className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
              <li className="rounded-xl bg-primary/[0.03] p-2.5">
                <FileQuestion className="mx-auto h-4 w-4 text-accent" aria-hidden />
                <p className="mt-1 font-semibold text-primary num">{t('common.questions', { count: e.questionCount })}</p>
              </li>
              <li className="rounded-xl bg-primary/[0.03] p-2.5">
                <Clock3 className="mx-auto h-4 w-4 text-accent" aria-hidden />
                <p className="mt-1 font-semibold text-primary num">{t('common.minutes', { count: e.durationMin })}</p>
              </li>
              <li className="rounded-xl bg-primary/[0.03] p-2.5">
                <RotateCcw className="mx-auto h-4 w-4 text-accent" aria-hidden />
                <p className="mt-1 font-semibold text-primary num">
                  {t('learn.subject.exams.attempts', { left: e.attemptsLeft, total: e.attemptsTotal })}
                </p>
              </li>
            </ul>
            <div className="mt-auto flex items-center justify-between gap-3 pt-6">
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Target className="h-3.5 w-3.5" aria-hidden />
                {t('learn.subject.exams.passMark', { pct: e.passMark })}
              </span>
              <Button
                to={e.available && e.attemptsLeft > 0 && !e.locked ? `/student/exams/${e.id}/room` : '/student/exams'}
                size="sm"
                rightIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}
              >
                {e.activeAttempt ? t('common.resume') : t('learn.subject.exams.start')}
              </Button>
            </div>
          </HoverCard>
        </li>
      ))}
    </ul>
  );
}
