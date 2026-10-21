import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Award, CheckCircle2, Clock, ListChecks, Target, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Attempt } from '@/types';
import { cn } from '@/utils/cn';
import { fmtDateTime, fmtDuration, fmtNumber, fmtPercent } from '@/utils/format';
import { useAttempts } from '@/store/assessments';
import { useQuestions } from '@/store/questions';
import { useStudents } from '@/store/core';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, DataTable, FilterSelect, Modal, ProgressBar, StatCard, StatusBadge } from '@/components/ui';
import { DifficultyBadge, QuestionText } from '@/components/forms/QuestionForm';

const scoreTone = (s: number) => (s >= 80 ? 'success' : s >= 60 ? 'warning' : 'danger') as 'success' | 'warning' | 'danger';

function AttemptDetail({ attempt, onClose }: { attempt: Attempt | null; onClose: () => void }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const questions = useQuestions((s) => s.items);
  const students = useStudents((s) => s.items);
  const student = students.find((s) => s.id === attempt?.studentId);
  const correct = attempt?.answers.filter((a) => a.correct).length ?? 0;
  const answered = attempt?.answers.filter((a) => a.selectedOptionId).length ?? 0;

  return (
    <Modal
      open={!!attempt}
      onClose={onClose}
      size="xl"
      title={attempt ? L(attempt, 'title') : ''}
      description={
        attempt && student ? (
          <span className="flex flex-wrap items-center gap-2">
            <Link to={`/users/${student.id}`} className="font-medium text-accent hover:underline" onClick={onClose}>
              {L(student, 'name')}
            </Link>
            · {fmtDateTime(attempt.date)}
          </span>
        ) : undefined
      }
    >
      {attempt && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: t('assessments.attempts.score'), value: fmtPercent(attempt.score), cls: `text-${scoreTone(attempt.score)}` },
              { label: t('assessments.attempts.correct'), value: `${correct} / ${attempt.answers.length}`, cls: 'text-primary' },
              { label: t('assessments.attempts.answered'), value: `${answered} / ${attempt.answers.length}`, cls: 'text-primary' },
              { label: t('assessments.attempts.time'), value: fmtDuration(attempt.timeSec), cls: 'text-primary' },
            ].map((k) => (
              <div key={k.label} className="rounded-xl bg-surface-2 p-3">
                <div className={cn('kpi-num text-2xl', k.cls)}>{k.value}</div>
                <div className="text-[11px] text-muted">{k.label}</div>
              </div>
            ))}
          </div>
          <ol className="space-y-3">
            {attempt.answers.map((a, i) => {
              const q = questions.find((x) => x.id === a.questionId);
              const sel = q?.options.find((o) => o.id === a.selectedOptionId);
              const right = q?.options.find((o) => o.correct);
              return (
                <li key={a.questionId} className={cn('rounded-xl border p-4', !a.selectedOptionId ? 'border-line' : a.correct ? 'border-success/40 bg-success/[0.04]' : 'border-danger/40 bg-danger/[0.04]')}>
                  <div className="flex items-start gap-3">
                    <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold', !a.selectedOptionId ? 'bg-ink/5 text-muted' : a.correct ? 'bg-success text-white' : 'bg-danger text-white')}>
                      {!a.selectedOptionId ? i + 1 : a.correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                        <span className="font-mono font-semibold text-primary" dir="ltr">
                          {q?.code ?? a.questionId}
                        </span>
                        {q && <DifficultyBadge value={q.difficulty} />}
                        <span className="ms-auto flex items-center gap-1 num">
                          <Clock className="h-3 w-3" /> {a.timeSec ? `${a.timeSec}s` : '—'}
                        </span>
                      </div>
                      <div className="mt-1.5 text-sm text-ink">{q ? <QuestionText text={L(q, 'body')} /> : t('assessments.attempts.removedQuestion')}</div>
                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        <div className={cn('rounded-lg px-3 py-2', !sel ? 'bg-ink/5 text-muted' : a.correct ? 'bg-success/10' : 'bg-danger/10')}>
                          <div className="mb-0.5 font-semibold text-muted">{t('assessments.attempts.studentAnswer')}</div>
                          {sel ? <QuestionText text={L(sel, 'text')} /> : t('assessments.attempts.notAnswered')}
                        </div>
                        {!a.correct && right && (
                          <div className="rounded-lg bg-success/10 px-3 py-2">
                            <div className="mb-0.5 font-semibold text-muted">{t('assessments.attempts.correctAnswer')}</div>
                            <QuestionText text={L(right, 'text')} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Modal>
  );
}

export default function Attempts() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const loading = useMockLoading();
  const attempts = useAttempts((s) => s.items);
  const students = useStudents((s) => s.items);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<Attempt | null>(null);

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const data = useMemo(() => attempts.filter((a) => (!kind || a.kind === kind) && (!status || a.status === status)), [attempts, kind, status]);

  const finished = attempts.filter((a) => a.status === 'passed' || a.status === 'failed');
  const avg = finished.length ? finished.reduce((s, a) => s + a.score, 0) / finished.length : 0;
  const passRate = finished.length ? (finished.filter((a) => a.status === 'passed').length / finished.length) * 100 : 0;
  const avgTime = attempts.length ? attempts.reduce((s, a) => s + a.timeSec, 0) / attempts.length : 0;

  const columns = useMemo<ColumnDef<Attempt, unknown>[]>(
    () => [
      {
        id: 'student',
        accessorFn: (a) => L(studentById.get(a.studentId), 'name'),
        header: t('common.student'),
        meta: { label: t('common.student') },
        cell: ({ row }) => {
          const s = studentById.get(row.original.studentId);
          return (
            <span className="flex items-center gap-2.5 whitespace-nowrap">
              <Avatar name={s?.name_en ?? '?'} src={s?.avatar} size="sm" />
              <span>
                <span className="block font-medium text-ink">{L(s, 'name')}</span>
                <span className="block text-[11px] text-muted" dir="ltr">
                  {s?.mobile}
                </span>
              </span>
            </span>
          );
        },
      },
      {
        id: 'assessment',
        accessorFn: (a) => L(a, 'title'),
        header: t('assessments.attempts.assessment'),
        meta: { label: t('assessments.attempts.assessment') },
        cell: ({ row }) => (
          <div className="min-w-[14rem]">
            <div className="text-[13px] text-ink">{L(row.original, 'title')}</div>
            <Badge tone={row.original.kind === 'exam' ? 'purple' : 'info'} className="mt-1">
              {t(`assessments.attempts.kind.${row.original.kind}`)}
            </Badge>
          </div>
        ),
      },
      {
        id: 'score',
        accessorKey: 'score',
        header: t('assessments.attempts.score'),
        meta: { label: t('assessments.attempts.score') },
        cell: ({ row }) => (
          <div className="flex w-32 items-center gap-2">
            <ProgressBar value={row.original.score} tone={scoreTone(row.original.score)} className="flex-1" label={t('assessments.attempts.score')} />
            <span className="w-10 text-end text-xs font-semibold num">{row.original.score}%</span>
          </div>
        ),
      },
      {
        id: 'questions',
        accessorFn: (a) => a.answers.length,
        header: t('assessments.attempts.questions'),
        meta: { label: t('assessments.attempts.questions'), align: 'end' },
        cell: ({ row }) => `${row.original.answers.filter((a) => a.correct).length}/${row.original.answers.length}`,
      },
      { id: 'time', accessorKey: 'timeSec', header: t('assessments.attempts.time'), meta: { label: t('assessments.attempts.time'), align: 'end' }, cell: ({ row }) => fmtDuration(row.original.timeSec) },
      { id: 'status', accessorKey: 'status', header: t('common.status'), meta: { label: t('common.status') }, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: 'date', accessorKey: 'date', header: t('common.date'), meta: { label: t('common.date') }, cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted">{fmtDateTime(row.original.date)}</span> },
    ],
    [t, L, studentById],
  );

  return (
    <>
      <PageHeader title={t('assessments.attempts.title')} subtitle={t('assessments.attempts.subtitle')} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('assessments.attempts.statTotal')} value={fmtNumber(attempts.length)} icon={<ListChecks />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('assessments.attempts.statAvg')} value={fmtPercent(avg)} icon={<Target />} color="#2563EB" />
        <StatCard loading={loading} label={t('assessments.attempts.statPass')} value={fmtPercent(passRate)} icon={<Award />} color="#16A34A" />
        <StatCard loading={loading} label={t('assessments.attempts.statTime')} value={fmtDuration(avgTime)} icon={<Clock />} color="#C9A24A" />
      </div>
      <DataTable
        data={data}
        columns={columns}
        loading={loading}
        onRowClick={setOpen}
        initialSort={[{ id: 'date', desc: true }]}
        exportName={can('assessments', 'export') ? 'attempts' : undefined}
        searchText={(a) => {
          const s = studentById.get(a.studentId);
          return `${s?.name_en ?? ''} ${s?.name_ar ?? ''} ${s?.mobile ?? ''} ${a.title_en} ${a.title_ar}`;
        }}
        toolbar={
          <>
            <FilterSelect label={t('common.type')} value={kind} onChange={setKind} options={(['quiz', 'exam'] as const).map((k) => ({ value: k, label: t(`assessments.attempts.kind.${k}`) }))} />
            <FilterSelect label={t('common.status')} value={status} onChange={setStatus} options={(['passed', 'failed', 'in_progress', 'abandoned'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />
          </>
        }
      />
      <AttemptDetail attempt={open} onClose={() => setOpen(null)} />
    </>
  );
}
