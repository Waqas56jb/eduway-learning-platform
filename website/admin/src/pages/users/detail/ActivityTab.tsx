import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Bot, CheckCircle2, ClipboardCheck, GraduationCap, PlayCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BarChart } from '@/components/charts';
import { Badge, Card, CardBody, CardHeader, EmptyState, ProgressBar, StatusBadge } from '@/components/ui';
import { useLocalize } from '@/hooks/useLocale';
import { useLessons, useSubjects } from '@/store/core';
import type { Student } from '@/types';
import { cn } from '@/utils/cn';
import { fmtDateTime, fmtDuration, fmtNumber, fmtPercent, fmtRelative } from '@/utils/format';
import { generateActivity } from '../activity';

export function ActivityTab({ student }: { student: Student }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const lessons = useLessons((s) => s.items);
  const subjects = useSubjects((s) => s.items);
  const act = useMemo(() => generateActivity(student, lessons), [student, lessons]);

  const lesson = (id: string) => lessons.find((l) => l.id === id);
  const subjectOf = (id: string) => subjects.find((s) => s.id === lesson(id)?.subjectId);
  const subjectByKey = (k: string) => subjects.find((s) => s.key === k);

  const empty = act.watch.length === 0 && act.exams.length === 0 && act.aiRecent.length === 0;
  if (empty) {
    return (
      <Card>
        <EmptyState title={t('users.activity.noActivity')} hint=" " />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title={t('users.activity.watch')} icon={<PlayCircle className="h-4 w-4" />} action={<Badge>{act.watch.length}</Badge>} />
        {act.watch.length === 0 ? (
          <EmptyState compact hint=" " />
        ) : (
          <ul className="divide-y divide-line">
            {act.watch.map((w) => {
              const l = lesson(w.lessonId);
              const s = subjectOf(w.lessonId);
              return (
                <li key={w.id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: s?.color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{L(l, 'title')}</div>
                      <div className="text-xs text-muted">
                        {L(s, 'name')} · {fmtRelative(w.at)}
                      </div>
                    </div>
                    {w.completed ? (
                      <Badge tone="success" icon={<CheckCircle2 className="h-3 w-3" />}>
                        {t('users.activity.completed')}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted num">
                        {t('users.activity.watched', { watched: fmtDuration(w.watchedSec), total: fmtDuration(w.durationSec) })}
                      </span>
                    )}
                  </div>
                  <ProgressBar value={w.watchedSec} max={w.durationSec} size="xs" tone={w.completed ? 'success' : 'accent'} className="mt-2 ms-4 w-auto" />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={t('users.activity.quizzes')} icon={<ClipboardCheck className="h-4 w-4" />} action={<Badge>{act.quizzes.length}</Badge>} />
        {act.quizzes.length === 0 ? (
          <EmptyState compact hint=" " />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-5 py-2 text-start font-semibold">{t('common.lesson')}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t('users.activity.score')}</th>
                  <th className="px-5 py-2 text-end font-semibold">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {act.quizzes.map((q) => (
                  <tr key={q.id} className="border-t border-line">
                    <td className="px-5 py-2.5">
                      <div className="max-w-[16rem] truncate font-medium text-ink">{L(lesson(q.lessonId), 'title')}</div>
                      <div className="text-xs text-muted">{fmtDateTime(q.at)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      <div className={cn('font-semibold num', q.passed ? 'text-success' : 'text-danger')}>{fmtPercent(q.score)}</div>
                      <div className="text-[11px] text-muted num">{t('users.activity.correct', { correct: q.correct, total: q.total })}</div>
                    </td>
                    <td className="px-5 py-2.5 text-end">
                      <StatusBadge status={q.passed ? 'passed' : 'failed'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title={t('users.activity.exams')} icon={<GraduationCap className="h-4 w-4" />} action={<Badge>{act.exams.length}</Badge>} />
        {act.exams.length === 0 ? (
          <EmptyState compact hint=" " />
        ) : (
          <ul className="divide-y divide-line">
            {act.exams.map((e) => (
              <li key={e.id} className="flex items-center gap-4 px-5 py-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line bg-surface-2">
                  <span className={cn('kpi-num text-base', e.score >= 50 ? 'text-success' : 'text-danger')}>{e.score}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{L(e, 'title')}</div>
                  <div className="text-xs text-muted">
                    {fmtDateTime(e.at)} · {t('users.activity.duration')}: {fmtNumber(e.durationMin)} {t('common.minutes')}
                  </div>
                </div>
                <StatusBadge status={e.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={t('users.activity.ai')} icon={<Bot className="h-4 w-4" />} action={<Badge tone="accent">{fmtNumber(student.aiQuestionsUsed)}</Badge>} />
        <CardBody>
          <BarChart
            data={act.aiDaily}
            xKey="date"
            height={160}
            xFormat={(d) => format(parseISO(d), 'd/M')}
            series={[{ key: 'questions', label: t('users.activity.questions'), color: '#EA580C' }]}
            valueFormat={(v) => fmtNumber(v)}
          />
          {act.aiRecent.length > 0 && (
            <>
              <div className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('users.activity.aiRecent')}</div>
              <ul className="space-y-2">
                {act.aiRecent.map((q) => {
                  const s = subjectByKey(q.subject);
                  return (
                    <li key={q.id} className="flex items-start gap-2.5 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: s?.color }} />
                      <span className="min-w-0 flex-1 text-ink/85">{L(q, 'text')}</span>
                      <span className="shrink-0 text-[11px] text-muted">{fmtRelative(q.at)}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
