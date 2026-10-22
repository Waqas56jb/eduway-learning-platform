import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Check, Eye, GitCompareArrows, Layers, ListChecks, Lock, Repeat, Shuffle, Target, Timer, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApiQuery } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useLookups } from '@/api/lookups';
import { useLessonOptions } from '@/api/content';
import { quizRulesApi, type QuizRuleVM } from '@/api/assessments';
import { useEffectiveQuizRule } from '@/api/drilldown';
import { useLang, useLocalize } from '@/hooks/useLocale';
import { fmtDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, Field, Select, SkeletonCard } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';

type RuleKey = 'questionCount' | 'poolSize' | 'passThreshold' | 'alternativeSets' | 'retryPolicy' | 'maxRetries' | 'cooldownMinutes' | 'randomize' | 'showExplanation' | 'requireCompletionToUnlock';
type RuleValues = Pick<QuizRuleVM, RuleKey>;

const ROWS: { key: RuleKey; label: string; icon: ReactNode }[] = [
  { key: 'questionCount', label: 'assessments.quiz.questionCount', icon: <ListChecks /> },
  { key: 'poolSize', label: 'assessments.quiz.poolSize', icon: <Layers /> },
  { key: 'passThreshold', label: 'assessments.quiz.passThreshold', icon: <Target /> },
  { key: 'alternativeSets', label: 'assessments.quiz.alternativeSets', icon: <Layers /> },
  { key: 'retryPolicy', label: 'assessments.quiz.retryPolicy', icon: <Repeat /> },
  { key: 'maxRetries', label: 'assessments.quiz.maxRetries', icon: <Repeat /> },
  { key: 'cooldownMinutes', label: 'assessments.quiz.cooldownMinutes', icon: <Timer /> },
  { key: 'randomize', label: 'assessments.quiz.randomize', icon: <Shuffle /> },
  { key: 'showExplanation', label: 'assessments.quiz.showExplanation', icon: <Eye /> },
  { key: 'requireCompletionToUnlock', label: 'assessments.quiz.requireCompletion', icon: <Lock /> },
];

/** ADM-QZR-06 — resolve the quiz rule a lesson actually runs with and compare it to its subject default. */
export default function EffectiveQuizRule() {
  const { t } = useTranslation();
  const L = useLocalize();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const subjects = useLookups().subjects;
  const subjectId = params.get('subjectId') ?? '';
  const lessonId = params.get('lessonId') ?? '';

  const optionsQ = useLessonOptions({ excludeArchived: true });
  const lessons = useMemo(
    () =>
      [...(optionsQ.data?.items ?? [])]
        .filter((l) => !subjectId || (l.subjectId ?? l.subject?.id) === subjectId)
        .sort((a, b) => (a.subject?.name.en ?? '').localeCompare(b.subject?.name.en ?? '') || a.order - b.order),
    [optionsQ.data, subjectId],
  );
  const lesson = optionsQ.data?.items.find((l) => l.id === lessonId);

  const ruleQ = useEffectiveQuizRule(lessonId || undefined);
  const defaultsQ = useApiQuery(qk.quizRules.list({ scope: 'subject' }), () => quizRulesApi.list({ scope: 'subject', pageSize: 100 }));
  const rule = ruleQ.data;
  const subjectDefault = rule ? defaultsQ.data?.items.find((r) => r.subjectId === rule.subjectId) : undefined;

  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const fmt = (key: RuleKey, r: RuleValues): ReactNode => {
    const v = r[key];
    if (typeof v === 'boolean')
      return v ? (
        <span className="inline-flex items-center gap-1 text-success">
          <Check className="h-3.5 w-3.5" />
          {t('common.yes')}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-muted">
          <X className="h-3.5 w-3.5" />
          {t('common.no')}
        </span>
      );
    if (key === 'retryPolicy') return t(`assessments.quiz.retry.${r.retryPolicy}`);
    if (key === 'passThreshold') return `${v}%`;
    if (key === 'cooldownMinutes') return `${v} ${t('common.minutes')}`;
    return String(v);
  };
  /** Fields that do not apply under the current retry policy. */
  const notApplicable = (key: RuleKey, r: RuleValues) => (key === 'maxRetries' && r.retryPolicy === 'unlimited') || (key === 'cooldownMinutes' && r.retryPolicy !== 'cooldown');

  const subjectName = rule?.subject ? rule.subject.name[lang] : lesson?.subject ? lesson.subject.name[lang] : '—';
  const diffCount = rule && subjectDefault && rule.source === 'lesson' ? ROWS.filter((row) => !notApplicable(row.key, rule) && rule[row.key] !== subjectDefault[row.key]).length : 0;

  return (
    <>
      <PageHeader
        title={t('drilldown.quizPreview.title')}
        subtitle={t('drilldown.quizPreview.subtitle')}
        actions={
          <ButtonLink to="/assessments/quiz-rules" variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>
            {t('drilldown.quizPreview.manage')}
          </ButtonLink>
        }
      />

      <Card className="mb-6">
        <CardBody className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Field label={t('common.subject')} htmlFor="eqr-subject">
            <Select
              id="eqr-subject"
              value={subjectId}
              onChange={(e) => setParam({ subjectId: e.target.value, lessonId: '' })}
              options={[{ value: '', label: t('common.all') }, ...subjects.map((s) => ({ value: s.id, label: L(s, 'name') }))]}
            />
          </Field>
          <Field label={t('common.lesson')} htmlFor="eqr-lesson" hint={optionsQ.error ? undefined : t('drilldown.quizPreview.lessonHint', { count: lessons.length })}>
            <Select
              id="eqr-lesson"
              value={lessonId}
              disabled={optionsQ.isLoading}
              placeholder={optionsQ.isLoading ? t('common.loading') : t('assessments.quiz.selectLesson')}
              onChange={(e) => setParam({ lessonId: e.target.value })}
              options={lessons.map((l) => ({ value: l.id, label: `${l.subject ? l.subject.name[lang] : ''} · ${l.order}. ${L(l, 'title')}` }))}
            />
          </Field>
          {optionsQ.error && <QueryError compact className="md:col-span-2" error={optionsQ.error} onRetry={() => optionsQ.refetch()} />}
        </CardBody>
      </Card>

      {!lessonId ? (
        <Card>
          <EmptyState icon={<BookOpen className="h-8 w-8 text-accent" />} title={t('drilldown.quizPreview.pickTitle')} hint={t('drilldown.quizPreview.pickHint')} />
        </Card>
      ) : ruleQ.isLoading ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <SkeletonCard lines={10} className="xl:col-span-2" />
          <SkeletonCard lines={5} />
        </div>
      ) : ruleQ.error || !rule ? (
        ruleQ.error && ruleQ.error.code === 'NOT_FOUND' ? (
          <Card>
            <EmptyState title={t('drilldown.quizPreview.notFound')} hint={t('drilldown.quizPreview.notFoundHint')} />
          </Card>
        ) : (
          <QueryError error={ruleQ.error} onRetry={() => ruleQ.refetch()} />
        )
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="overflow-hidden xl:col-span-2">
            <div className="h-1" style={{ background: rule.subject?.color }} />
            <CardHeader
              icon={<ListChecks className="h-4 w-4" />}
              title={lesson ? L(lesson, 'title') : (rule.lesson?.title[lang] ?? t('common.lesson'))}
              subtitle={`${subjectName}${lesson ? ` · ${t('assessments.quiz.lessonNo', { n: lesson.order })}` : ''}`}
              action={
                <Badge tone={rule.source === 'lesson' ? 'accent' : 'info'} dot>
                  {rule.source === 'lesson' ? t('drilldown.quizPreview.sourceLesson') : t('drilldown.quizPreview.sourceSubject')}
                </Badge>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-start text-xs text-muted">
                    <th className="px-5 py-2.5 text-start font-medium">{t('drilldown.quizPreview.setting')}</th>
                    <th className="px-5 py-2.5 text-start font-medium">{t('drilldown.quizPreview.effective')}</th>
                    {rule.source === 'lesson' && <th className="px-5 py-2.5 text-start font-medium">{t('drilldown.quizPreview.subjectDefault')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ROWS.map((row) => {
                    const na = notApplicable(row.key, rule);
                    const differs = rule.source === 'lesson' && !!subjectDefault && !na && rule[row.key] !== subjectDefault[row.key];
                    return (
                      <tr key={row.key} className={cn(differs && 'bg-accent/[0.05]', na && 'text-muted')}>
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-2 text-ink/80 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-muted">
                            {row.icon}
                            {t(row.label)}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-semibold num">
                          {na ? <span className="text-xs font-normal text-muted">{t('assessments.quiz.notApplicable')}</span> : fmt(row.key, rule)}
                          {differs && (
                            <Badge tone="accent" className="ms-2">
                              {t('drilldown.quizPreview.overridden')}
                            </Badge>
                          )}
                        </td>
                        {rule.source === 'lesson' && (
                          <td className="px-5 py-3 text-muted num">{subjectDefault ? (notApplicable(row.key, subjectDefault) ? '—' : fmt(row.key, subjectDefault)) : defaultsQ.isLoading ? '…' : '—'}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader icon={<GitCompareArrows className="h-4 w-4" />} title={t('drilldown.quizPreview.resolution')} />
              <CardBody className="space-y-3 text-sm">
                <p className="text-muted">{rule.source === 'lesson' ? t('drilldown.quizPreview.resolutionLesson') : t('drilldown.quizPreview.resolutionSubject', { subject: subjectName })}</p>
                {rule.source === 'lesson' && subjectDefault && (
                  <p className="font-medium text-ink">{diffCount ? t('drilldown.quizPreview.diffCount', { count: diffCount }) : t('drilldown.quizPreview.noDiff')}</p>
                )}
                {rule.updatedAt && rule.id && (
                  <p className="text-xs text-muted">
                    {t('common.updated')}: {fmtDateTime(rule.updatedAt)}
                  </p>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<Eye className="h-4 w-4" />} title={t('drilldown.quizPreview.studentView')} />
              <CardBody>
                <ul className="space-y-2.5 text-sm text-ink/80">
                  <li>{t('drilldown.quizPreview.sumQuestions', { count: rule.questionCount, pool: rule.poolSize })}</li>
                  <li>{t('drilldown.quizPreview.sumPass', { pct: rule.passThreshold })}</li>
                  <li>
                    {rule.retryPolicy === 'unlimited'
                      ? t('drilldown.quizPreview.sumRetryUnlimited')
                      : rule.retryPolicy === 'limited'
                        ? t('drilldown.quizPreview.sumRetryLimited', { count: rule.maxRetries })
                        : t('drilldown.quizPreview.sumRetryCooldown', { count: rule.maxRetries, minutes: rule.cooldownMinutes })}
                  </li>
                  <li>{rule.randomize ? t('drilldown.quizPreview.sumRandom', { count: rule.alternativeSets }) : t('drilldown.quizPreview.sumFixed')}</li>
                  <li>{rule.showExplanation ? t('drilldown.quizPreview.sumExplain') : t('drilldown.quizPreview.sumNoExplain')}</li>
                  {rule.requireCompletionToUnlock && <li>{t('drilldown.quizPreview.sumGated')}</li>}
                </ul>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
