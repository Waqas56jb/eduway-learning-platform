import { useMemo, useState, type ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Layers, Lock, Pencil, Plus, Repeat, Shuffle, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/utils/cn';
import { useCan } from '@/store/auth';
import { useLang, useLocalize } from '@/hooks/useLocale';
import { errorMessage, isApiError } from '@/api/client';
import { exportRequest, useApiMutation, useApiQuery, useExport, usePagedList } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useLookups } from '@/api/lookups';
import { useLessonOptions } from '@/api/content';
import { quizRulesApi, type QuizRuleVM, type QuizRuleWriteDto } from '@/api/assessments';

type QuizRule = QuizRuleVM;

/** Starting values for a subject without a stored default (server upserts on save). */
const BASE_RULE: Omit<QuizRule, 'id' | 'scope' | 'subjectId' | 'lessonId' | 'subject' | 'lesson'> = {
  questionCount: 10,
  poolSize: 30,
  randomize: true,
  alternativeSets: 3,
  passThreshold: 60,
  retryPolicy: 'unlimited',
  maxRetries: 3,
  cooldownMinutes: 60,
  showExplanation: true,
  requireCompletionToUnlock: false,
};
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, DataTable, Drawer, Field, Input, Select, SkeletonCard, Switch, useConfirm } from '@/components/ui';

const schema = z
  .object({
    lessonId: z.string().nullable(),
    questionCount: z.coerce.number().int().min(1).max(50),
    poolSize: z.coerce.number().int().min(1).max(200),
    randomize: z.boolean(),
    alternativeSets: z.coerce.number().int().min(1).max(5),
    passThreshold: z.coerce.number().int().min(0).max(100),
    retryPolicy: z.enum(['unlimited', 'limited', 'cooldown']),
    maxRetries: z.coerce.number().int().min(0).max(10),
    cooldownMinutes: z.coerce.number().int().min(1).max(10080),
    showExplanation: z.boolean(),
    requireCompletionToUnlock: z.boolean(),
  })
  .refine((v) => v.poolSize >= v.questionCount, { path: ['poolSize'], message: 'pool' });
type Form = z.infer<typeof schema>;

function YesNo({ on }: { on: boolean }) {
  return on ? <Check className="h-4 w-4 text-success" aria-label="yes" /> : <X className="h-4 w-4 text-muted" aria-label="no" />;
}

interface EditorState {
  mode: 'subject' | 'lesson-new' | 'lesson-edit';
  rule: QuizRule;
}

function RuleDrawer({ state, onClose }: { state: EditorState | null; onClose: () => void }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const lang = useLang();
  const qc = useQueryClient();
  const subjects = useLookups().subjects;
  const rule = state?.rule;
  const optionsQ = useLessonOptions({ withoutQuizOverride: true, excludeArchived: true }, state?.mode === 'lesson-new');
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<Form>({ resolver: zodResolver(schema), values: rule ? { ...rule } : undefined });

  const lessonOptions =
    state?.mode === 'lesson-edit' && rule?.lesson
      ? [{ value: rule.lesson.id, label: rule.lesson.title[lang] }]
      : (optionsQ.data?.items ?? [])
          .sort((a, b) => (a.subject?.name.en ?? '').localeCompare(b.subject?.name.en ?? '') || a.order - b.order)
          .map((l) => ({ value: l.id, label: `${l.subject ? l.subject.name[lang] : ''} · ${l.order}. ${L(l, 'title')}` }));

  const onSubmit = async (v: Form) => {
    if (!state || !rule) return;
    const body: QuizRuleWriteDto = {
      questionCount: v.questionCount,
      poolSize: v.poolSize,
      randomize: v.randomize,
      alternativeSets: v.alternativeSets,
      passThreshold: v.passThreshold,
      retryPolicy: v.retryPolicy,
      maxRetries: v.maxRetries,
      cooldownMinutes: v.cooldownMinutes,
      showExplanation: v.showExplanation,
      requireCompletionToUnlock: v.requireCompletionToUnlock,
    };
    setSaving(true);
    try {
      if (state.mode === 'lesson-new') {
        if (!v.lessonId) {
          toast.error(t('assessments.quiz.selectLesson'));
          return;
        }
        await quizRulesApi.create({ ...body, lessonId: v.lessonId });
        toast.success(t('toast.created', { entity: t('assessments.quiz.override') }));
      } else if (state.mode === 'subject') {
        await quizRulesApi.upsertSubject(rule.subjectId, body);
        toast.success(t('toast.updated', { entity: t('assessments.quiz.rule') }));
      } else {
        await quizRulesApi.update(rule.id, body);
        toast.success(t('toast.updated', { entity: t('assessments.quiz.rule') }));
      }
      await Promise.all([qc.invalidateQueries({ queryKey: qk.quizRules.all }), qc.invalidateQueries({ queryKey: qk.lessons.all })]);
      reset();
      onClose();
    } catch (e) {
      toast.error(isApiError(e) && e.status === 409 ? t('assessments.quiz.overrideExists') : errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const err = (k: keyof Form) => (errors[k] ? (k === 'poolSize' && errors[k]?.message === 'pool' ? t('assessments.quiz.poolTooSmall') : t('errors.required')) : undefined);
  const subject = subjects.find((s) => s.id === rule?.subjectId) ?? (rule?.subject ? { name_en: rule.subject.name.en, name_ar: rule.subject.name.ar } : undefined);
  const policy = watch('retryPolicy');

  return (
    <Drawer
      open={!!state}
      onClose={onClose}
      title={state?.mode === 'subject' ? t('assessments.quiz.editDefault', { subject: L(subject, 'name') }) : state?.mode === 'lesson-new' ? t('assessments.quiz.newOverride') : t('assessments.quiz.editOverride')}
      description={state?.mode === 'subject' ? t('assessments.quiz.defaultHint') : t('assessments.quiz.overrideHint')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" form="quiz-rule-form" loading={saving}>
            {t('actions.saveChanges')}
          </Button>
        </>
      }
    >
      {rule && (
        <form id="quiz-rule-form" className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          {state?.mode !== 'subject' && (
            <Field label={t('common.lesson')} required error={errors.lessonId ? t('errors.required') : undefined}>
              <Select
                disabled={state?.mode === 'lesson-edit'}
                placeholder={t('assessments.quiz.selectLesson')}
                options={lessonOptions}
                value={watch('lessonId') ?? ''}
                onChange={(e) => setValue('lessonId', e.target.value || null, { shouldValidate: true })}
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('assessments.quiz.questionCount')} error={err('questionCount')} hint={t('assessments.quiz.questionCountHint')}>
              <Input type="number" min={1} max={50} invalid={!!errors.questionCount} {...register('questionCount')} />
            </Field>
            <Field label={t('assessments.quiz.poolSize')} error={err('poolSize')} hint={t('assessments.quiz.poolSizeHint')}>
              <Input type="number" min={1} max={200} invalid={!!errors.poolSize} {...register('poolSize')} />
            </Field>
            <Field label={t('assessments.quiz.passThreshold')} error={err('passThreshold')}>
              <Input type="number" min={0} max={100} suffix="%" invalid={!!errors.passThreshold} {...register('passThreshold')} />
            </Field>
            <Field label={t('assessments.quiz.alternativeSets')} hint={t('assessments.quiz.alternativeSetsHint')}>
              <div className="flex gap-1.5" role="radiogroup" aria-label={t('assessments.quiz.alternativeSets')}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={Number(watch('alternativeSets')) === n}
                    onClick={() => setValue('alternativeSets', n, { shouldDirty: true })}
                    className={cn('h-10 flex-1 rounded-lg border text-sm font-semibold transition num', Number(watch('alternativeSets')) === n ? 'border-accent bg-accent/10 text-primary' : 'border-line text-muted hover:border-accent/50')}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('assessments.quiz.retryPolicy')}>
              <Select {...register('retryPolicy')} options={(['unlimited', 'limited', 'cooldown'] as const).map((p) => ({ value: p, label: t(`assessments.quiz.retry.${p}`) }))} />
            </Field>
            <Field label={t('assessments.quiz.maxRetries')} hint={policy === 'unlimited' ? t('assessments.quiz.notApplicable') : undefined}>
              <Input type="number" min={0} max={10} disabled={policy === 'unlimited'} {...register('maxRetries')} />
            </Field>
            {policy === 'cooldown' && (
              <Field label={t('assessments.quiz.cooldownMinutes')} error={errors.cooldownMinutes ? t('errors.required') : undefined}>
                <Input type="number" min={1} suffix={t('common.minutes')} invalid={!!errors.cooldownMinutes} {...register('cooldownMinutes')} />
              </Field>
            )}
          </div>
          <div className="space-y-4 rounded-xl border border-line bg-surface-2 p-4">
            <Switch label={t('assessments.quiz.randomize')} description={t('assessments.quiz.randomizeHint')} checked={watch('randomize')} onChange={(v) => setValue('randomize', v, { shouldDirty: true })} />
            <Switch label={t('assessments.quiz.showExplanation')} description={t('assessments.quiz.showExplanationHint')} checked={watch('showExplanation')} onChange={(v) => setValue('showExplanation', v, { shouldDirty: true })} />
            <Switch label={t('assessments.quiz.requireCompletion')} description={t('assessments.quiz.requireCompletionHint')} checked={watch('requireCompletionToUnlock')} onChange={(v) => setValue('requireCompletionToUnlock', v, { shouldDirty: true })} />
          </div>
        </form>
      )}
    </Drawer>
  );
}

export default function QuizRules() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const lang = useLang();
  const subjects = useLookups().subjects;
  const [editor, setEditor] = useState<EditorState | null>(null);
  const canEdit = can('assessments', 'edit');

  const defaultsQ = useApiQuery(qk.quizRules.list({ scope: 'subject' }), () => quizRulesApi.list({ scope: 'subject', pageSize: 100 }));
  const loading = defaultsQ.isLoading;
  const defaults = subjects.map((s) => ({
    subject: s,
    rule:
      defaultsQ.data?.items.find((r) => r.subjectId === s.id) ??
      ({ ...BASE_RULE, id: `default-${s.id}`, scope: 'subject', subjectId: s.id, lessonId: null, subject: null, lesson: null } as QuizRule),
  }));
  const overridesList = usePagedList<QuizRule>({ key: qk.quizRules.list, fetcher: quizRulesApi.list, filters: { scope: 'lesson' } });
  const overrides = overridesList.items;
  const removeMut = useApiMutation((id: string) => quizRulesApi.remove(id), {
    invalidate: [qk.quizRules.all, qk.lessons.all],
    success: () => t('toast.deleted', { entity: t('assessments.quiz.override') }),
  });
  const exp = useExport('/admin/quiz-rules/export', 'quiz-overrides');

  const columns = useMemo<ColumnDef<QuizRule, unknown>[]>(
    () => [
      {
        id: 'lesson',
        accessorFn: (r) => r.lesson?.title[lang] ?? '',
        header: t('common.lesson'),
        enableSorting: false,
        meta: { label: t('common.lesson') },
        cell: ({ row }) => {
          const l = row.original.lesson;
          const s = row.original.subject;
          return (
            <div className="min-w-[14rem]">
              <div className="font-medium text-ink">{l?.title[lang] ?? '—'}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s?.color }} />
                {s?.name[lang]} · {t('assessments.quiz.lessonNo', { n: l?.order ?? '—' })}
              </div>
            </div>
          );
        },
      },
      { id: 'count', enableSorting: false, accessorKey: 'questionCount', header: t('assessments.quiz.questionsShort'), meta: { label: t('assessments.quiz.questionCount'), align: 'end' } },
      { id: 'pool', enableSorting: false, accessorKey: 'poolSize', header: t('assessments.quiz.pool'), meta: { label: t('assessments.quiz.poolSize'), align: 'end' } },
      { id: 'sets', enableSorting: false, accessorKey: 'alternativeSets', header: t('assessments.quiz.sets'), meta: { label: t('assessments.quiz.alternativeSets'), align: 'end' } },
      { id: 'pass', enableSorting: false, accessorKey: 'passThreshold', header: t('assessments.quiz.pass'), meta: { label: t('assessments.quiz.passThreshold'), align: 'end' }, cell: ({ row }) => `${row.original.passThreshold}%` },
      {
        id: 'retry',
        accessorKey: 'retryPolicy',
        enableSorting: false,
        header: t('assessments.quiz.retryPolicy'),
        meta: { label: t('assessments.quiz.retryPolicy') },
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs">
            {t(`assessments.quiz.retry.${row.original.retryPolicy}`)}
            {row.original.retryPolicy !== 'unlimited' && <span className="text-muted"> · {row.original.maxRetries}×</span>}
          </span>
        ),
      },
      { id: 'random', enableSorting: false, accessorKey: 'randomize', header: t('assessments.quiz.randomShort'), meta: { label: t('assessments.quiz.randomize'), align: 'center' }, cell: ({ row }) => <span className="inline-flex justify-center"><YesNo on={row.original.randomize} /></span> },
      { id: 'expl', enableSorting: false, accessorKey: 'showExplanation', header: t('assessments.quiz.explShort'), meta: { label: t('assessments.quiz.showExplanation'), align: 'center' }, cell: ({ row }) => <span className="inline-flex justify-center"><YesNo on={row.original.showExplanation} /></span> },
      { id: 'unlock', enableSorting: false, accessorKey: 'requireCompletionToUnlock', header: t('assessments.quiz.unlockShort'), meta: { label: t('assessments.quiz.requireCompletion'), align: 'center' }, cell: ({ row }) => <span className="inline-flex justify-center"><YesNo on={row.original.requireCompletionToUnlock} /></span> },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row }) =>
          canEdit ? (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon-sm" aria-label={t('actions.edit')} onClick={() => setEditor({ mode: 'lesson-edit', rule: row.original })}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {can('assessments', 'delete') && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hover:text-danger"
                  aria-label={t('actions.delete')}
                  onClick={async () => {
                    const ok = await confirm({ title: t('assessments.quiz.removeOverrideTitle'), body: t('assessments.quiz.removeOverrideBody'), confirmText: t('actions.remove') });
                    if (!ok) return;
                    removeMut.mutate(row.original.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, lang, canEdit, can, confirm],
  );

  const stat = (icon: ReactNode, label: string, value: ReactNode) => (
    <div className="flex items-center justify-between gap-2 py-1.5 text-xs">
      <span className="flex items-center gap-1.5 text-muted [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
        {label}
      </span>
      <span className="font-semibold text-ink num">{value}</span>
    </div>
  );

  return (
    <>
      <PageHeader
        title={t('assessments.quiz.title')}
        subtitle={t('assessments.quiz.subtitle')}
        actions={
          canEdit && (
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                const base = defaults[0]?.rule ?? ({ ...BASE_RULE, subjectId: '', subject: null } as QuizRule);
                setEditor({ mode: 'lesson-new', rule: { ...base, id: 'new', scope: 'lesson', lessonId: null, lesson: null } });
              }}
            >
              {t('assessments.quiz.newOverride')}
            </Button>
          )
        }
      />

      <h2 className="mb-3 text-sm font-semibold text-ink">{t('assessments.quiz.subjectDefaults')}</h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} lines={5} />)
          : defaults.map(({ subject, rule }) => (
              <Card key={subject.id} className="relative overflow-hidden">
                <div className="h-1" style={{ background: subject.color }} />
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-ink">{L(subject, 'name')}</h3>
                    {canEdit && (
                      <Button variant="ghost" size="icon-sm" aria-label={`${t('actions.edit')} ${L(subject, 'name')}`} onClick={() => setEditor({ mode: 'subject', rule: rule! })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="kpi-num text-3xl text-primary">{rule!.questionCount}</span>
                    <span className="text-xs text-muted">/ {t('assessments.quiz.poolOf', { n: rule!.poolSize })}</span>
                  </div>
                  <div className="mt-3 divide-y divide-line border-t border-line">
                    {stat(<Check />, t('assessments.quiz.passThreshold'), `${rule!.passThreshold}%`)}
                    {stat(<Layers />, t('assessments.quiz.alternativeSets'), rule!.alternativeSets)}
                    {stat(<Repeat />, t('assessments.quiz.retryPolicy'), t(`assessments.quiz.retry.${rule!.retryPolicy}`))}
                    {stat(<Shuffle />, t('assessments.quiz.randomize'), rule!.randomize ? t('common.on') : t('common.off'))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {rule!.requireCompletionToUnlock && (
                      <Badge tone="accent" icon={<Lock className="h-3 w-3" />}>
                        {t('assessments.quiz.gated')}
                      </Badge>
                    )}
                    {rule!.showExplanation && <Badge tone="info">{t('assessments.quiz.explanations')}</Badge>}
                  </div>
                </div>
              </Card>
            ))}
      </div>

      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{t('assessments.quiz.lessonOverrides')}</h2>
          <p className="text-xs text-muted">{t('assessments.quiz.lessonOverridesHint')}</p>
        </div>
      </div>
      <DataTable
        data={overrides}
        columns={columns}
        loading={overridesList.isLoading}
        error={overridesList.error}
        onRetry={() => overridesList.refetch()}
        server={overridesList.server}
        onExport={can('assessments', 'export') ? (ids) => exp.mutate(exportRequest('csv', overridesList.exportFilters, ids)) : undefined}
        exporting={exp.isPending}
        emptyTitle={t('assessments.quiz.noOverrides')}
        emptyHint={t('assessments.quiz.noOverridesHint')}
      />

      <RuleDrawer state={editor} onClose={() => setEditor(null)} />
    </>
  );
}
