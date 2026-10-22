import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Award, CheckCircle2, Clock, Flag, ListChecks, Target, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { fmtDateTime, fmtDuration, fmtNumber, fmtPercent } from '@/utils/format';
import { useCan } from '@/store/auth';
import { useLang } from '@/hooks/useLocale';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, DataTable, DateRangePicker, EmptyState, FilterSelect, Modal, ProgressBar, Skeleton, StatCard, StatusBadge } from '@/components/ui';
import { DifficultyBadge, QuestionText } from '@/components/forms/QuestionForm';
import { rangeFromPreset, type DateRange } from '@/store/ui';
import { errorMessage } from '@/api/client';
import { exportRequest, useApiQuery, useExport, usePagedList } from '@/api/hooks';
import { qk } from '@/api/keys';
import { attemptsApi, type AttemptVM } from '@/api/assessments';

const scoreTone = (s: number) => (s >= 80 ? 'success' : s >= 60 ? 'warning' : 'danger') as 'success' | 'warning' | 'danger';

function AttemptDetail({ attempt, onClose }: { attempt: AttemptVM | null; onClose: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useApiQuery(qk.attempts.detail(attempt?.id), () => attemptsApi.get(attempt!.id), { enabled: !!attempt });
  const d = q.data;
  const answers = d?.answers ?? [];
  const correct = answers.filter((a) => a.correct).length;
  const answered = answers.filter((a) => a.selectedOptionId || a.selectedText).length;
  const student = attempt?.student;

  return (
    <Modal
      open={!!attempt}
      onClose={onClose}
      size="xl"
      title={attempt ? (lang === 'ar' ? attempt.title_ar : attempt.title_en) : ''}
      description={
        attempt && student ? (
          <span className="flex flex-wrap items-center gap-2">
            <Link to={`/users/${student.id}`} className="font-medium text-accent hover:underline" onClick={onClose}>
              {student.name[lang]}
            </Link>
            · {fmtDateTime(attempt.date)}
            {attempt.platform && <Badge tone="slate">{attempt.platform.toUpperCase()}</Badge>}
          </span>
        ) : undefined
      }
    >
      {attempt && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: t('assessments.attempts.score'), value: fmtPercent(attempt.score), cls: `text-${scoreTone(attempt.score)}` },
              { label: t('assessments.attempts.correct'), value: `${d ? correct : attempt.correct} / ${d ? answers.length : attempt.total}`, cls: 'text-primary' },
              { label: t('assessments.attempts.answered'), value: d ? `${answered} / ${answers.length}` : '—', cls: 'text-primary' },
              { label: t('assessments.attempts.time'), value: fmtDuration(attempt.timeSec), cls: 'text-primary' },
            ].map((k) => (
              <div key={k.label} className="rounded-xl bg-surface-2 p-3">
                <div className={cn('kpi-num text-2xl', k.cls)}>{k.value}</div>
                <div className="text-[11px] text-muted">{k.label}</div>
              </div>
            ))}
          </div>
          {q.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : q.isError ? (
            <EmptyState compact title={t('api.loadFailed')} hint={errorMessage(q.error)} action={<Button size="sm" variant="secondary" onClick={() => q.refetch()}>{t('api.retry')}</Button>} />
          ) : (
            <ol className="space-y-3">
              {answers.map((a, i) => {
                const hasAnswer = !!(a.selectedOptionId || a.selectedText);
                return (
                  <li key={`${a.questionId}-${i}`} className={cn('rounded-xl border p-4', !hasAnswer ? 'border-line' : a.correct ? 'border-success/40 bg-success/[0.04]' : 'border-danger/40 bg-danger/[0.04]')}>
                    <div className="flex items-start gap-3">
                      <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold', !hasAnswer ? 'bg-ink/5 text-muted' : a.correct ? 'bg-success text-white' : 'bg-danger text-white')}>
                        {!hasAnswer ? i + 1 : a.correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                          <span className="font-mono font-semibold text-primary" dir="ltr">
                            {a.code ?? a.questionId.slice(0, 8)}
                          </span>
                          {a.difficulty && <DifficultyBadge value={a.difficulty} />}
                          {a.flagged && <Flag className="h-3 w-3 text-warning" aria-label="flagged" />}
                          <span className="ms-auto flex items-center gap-1 num">
                            <Clock className="h-3 w-3" /> {a.timeSec ? `${a.timeSec}s` : '—'}
                          </span>
                        </div>
                        <div className="mt-1.5 text-sm text-ink">{a.body ? <QuestionText text={a.body[lang]} /> : t('assessments.attempts.removedQuestion')}</div>
                        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                          <div className={cn('rounded-lg px-3 py-2', !hasAnswer ? 'bg-ink/5 text-muted' : a.correct ? 'bg-success/10' : 'bg-danger/10')}>
                            <div className="mb-0.5 font-semibold text-muted">{t('assessments.attempts.studentAnswer')}</div>
                            {a.selectedText ? <QuestionText text={a.selectedText[lang]} /> : t('assessments.attempts.notAnswered')}
                          </div>
                          {!a.correct && a.correctText && (
                            <div className="rounded-lg bg-success/10 px-3 py-2">
                              <div className="mb-0.5 font-semibold text-muted">{t('assessments.attempts.correctAnswer')}</div>
                              <QuestionText text={a.correctText[lang]} />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Attempts() {
  const { t } = useTranslation();
  const lang = useLang();
  const can = useCan();
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [platform, setPlatform] = useState('');
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset('90d'));
  const [open, setOpen] = useState<AttemptVM | null>(null);

  const filters = useMemo(() => ({ kind, status, platform, from: range.from, to: range.to }), [kind, status, platform, range]);
  const list = usePagedList<AttemptVM>({ key: qk.attempts.list, fetcher: attemptsApi.list, filters, initialSort: '-date' });
  const statsQ = useApiQuery(qk.attempts.sub('stats', filters), () => attemptsApi.stats(filters));
  const loading = statsQ.isLoading;
  const st = statsQ.data;
  const exp = useExport('/admin/attempts/export', 'attempts');

  const columns = useMemo<ColumnDef<AttemptVM, unknown>[]>(
    () => [
      {
        id: 'student',
        accessorFn: (a) => a.student?.name[lang] ?? '',
        header: t('common.student'),
        enableSorting: false,
        meta: { label: t('common.student') },
        cell: ({ row }) => {
          const s = row.original.student;
          return (
            <span className="flex items-center gap-2.5 whitespace-nowrap">
              <Avatar name={s?.name.en ?? '?'} src={s?.avatarUrl ?? undefined} size="sm" />
              <span>
                <span className="block font-medium text-ink">{s?.name[lang] ?? '—'}</span>
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
        accessorFn: (a) => (lang === 'ar' ? a.title_ar : a.title_en),
        header: t('assessments.attempts.assessment'),
        enableSorting: false,
        meta: { label: t('assessments.attempts.assessment') },
        cell: ({ row }) => (
          <div className="min-w-[14rem]">
            <div className="text-[13px] text-ink">{lang === 'ar' ? row.original.title_ar : row.original.title_en}</div>
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
            <span className="w-10 text-end text-xs font-semibold num">{Math.round(row.original.score)}%</span>
          </div>
        ),
      },
      {
        id: 'questions',
        accessorFn: (a) => a.total,
        header: t('assessments.attempts.questions'),
        enableSorting: false,
        meta: { label: t('assessments.attempts.questions'), align: 'end' },
        cell: ({ row }) => `${row.original.correct}/${row.original.total}`,
      },
      { id: 'timeSec', accessorKey: 'timeSec', header: t('assessments.attempts.time'), meta: { label: t('assessments.attempts.time'), align: 'end' }, cell: ({ row }) => fmtDuration(row.original.timeSec) },
      { id: 'status', accessorKey: 'status', header: t('common.status'), meta: { label: t('common.status') }, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: 'date', accessorKey: 'date', header: t('common.date'), meta: { label: t('common.date') }, cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted">{fmtDateTime(row.original.date)}</span> },
    ],
    [t, lang],
  );

  return (
    <>
      <PageHeader title={t('assessments.attempts.title')} subtitle={t('assessments.attempts.subtitle')} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('assessments.attempts.statTotal')} value={fmtNumber(st?.total ?? 0)} icon={<ListChecks />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('assessments.attempts.statAvg')} value={fmtPercent(st?.avgScore ?? 0)} icon={<Target />} color="#2563EB" />
        <StatCard loading={loading} label={t('assessments.attempts.statPass')} value={fmtPercent(st?.passRate ?? 0)} icon={<Award />} color="#16A34A" />
        <StatCard loading={loading} label={t('assessments.attempts.statTime')} value={fmtDuration(st?.avgTimeSec ?? 0)} icon={<Clock />} color="#C9A24A" />
      </div>
      <DataTable
        data={list.items}
        columns={columns}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        server={list.server}
        onRowClick={setOpen}
        onExport={can('assessments', 'export') ? (ids) => exp.mutate(exportRequest('csv', list.exportFilters, ids)) : undefined}
        exporting={exp.isPending}
        toolbar={
          <>
            <FilterSelect label={t('common.type')} value={kind} onChange={setKind} options={(['quiz', 'exam', 'practice'] as const).map((k) => ({ value: k, label: t(`assessments.attempts.kind.${k}`) }))} />
            <FilterSelect label={t('common.status')} value={status} onChange={setStatus} options={(['passed', 'failed', 'in_progress', 'abandoned'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />
            <FilterSelect
              label={t('assessments.attempts.platform')}
              value={platform}
              onChange={setPlatform}
              options={(['web', 'ios', 'android'] as const).map((p) => ({ value: p, label: p === 'ios' ? 'iOS' : p === 'android' ? 'Android' : 'Web' }))}
            />
            <DateRangePicker value={range} onChange={setRange} align="start" />
          </>
        }
      />
      <AttemptDetail attempt={open} onClose={() => setOpen(null)} />
    </>
  );
}
