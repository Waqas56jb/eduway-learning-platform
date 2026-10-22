import { CalendarRange, ClipboardCheck, GraduationCap, Plus, Timer, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSaveSettings, useSettingsSection, type LearningSettings } from '@/api/settings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Field, Input, SkeletonCard, TagInput } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { ReadOnlyNotice, SaveBar, Section, useCanEditSettings, useDraft } from './_shared';

const EMPTY: LearningSettings = {
  quizQuestionCount: 10,
  quizPassMark: 60,
  examDefaultPassMark: 50,
  practiceSessionSizes: [10, 20, 30],
  practiceMaxSize: 50,
  dailyGoalMinutes: 30,
  watchHeartbeatSeconds: 10,
  examAutosaveSeconds: 15,
  examGraceSeconds: 30,
  gradeBands: [],
  heatmapLevels: [],
};

type NumKey = { [K in keyof LearningSettings]: LearningSettings[K] extends number ? K : never }[keyof LearningSettings];

const toNums = (v: string[]) =>
  [...new Set(v.map((s) => Math.round(Number(s))).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);

export default function LearningSettingsPage() {
  const { t } = useTranslation();
  const q = useSettingsSection('learning');
  const save = useSaveSettings('learning');
  const loading = q.isLoading;
  const value = q.data ?? EMPTY;
  const { draft, set, dirty, reset } = useDraft(value);
  const editable = useCanEditSettings();

  const num = (key: NumKey, min: number, max: number) => ({
    type: 'number' as const,
    min,
    max,
    dir: 'ltr' as const,
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, Number(e.target.value) || 0),
    onBlur: () => set(key, Math.max(min, Math.min(max, draft[key] || min))),
  });

  const sizesTooBig = draft.practiceSessionSizes.some((s) => s > draft.practiceMaxSize);
  const bandsInvalid = draft.gradeBands.some((b) => !b.key.trim() || b.min < 0 || b.min > 100) || new Set(draft.gradeBands.map((b) => b.key.trim())).size !== draft.gradeBands.length;

  const onSave = () => {
    if (sizesTooBig || bandsInvalid || draft.practiceSessionSizes.length === 0) return;
    save.mutate({ ...draft, gradeBands: [...draft.gradeBands].map((b) => ({ key: b.key.trim(), min: b.min })).sort((a, b) => b.min - a.min) });
  };

  const setBand = (i: number, patch: Partial<LearningSettings['gradeBands'][number]>) => set('gradeBands', draft.gradeBands.map((b, k) => (k === i ? { ...b, ...patch } : b)));

  return (
    <div>
      <PageHeader title={t('settings.learning.title')} subtitle={t('settings.learning.subtitle')} />
      {!editable && <ReadOnlyNotice />}
      {q.error && !q.data ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} />
      ) : loading ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </div>
      ) : (
        <fieldset disabled={!editable} className="grid gap-6 xl:grid-cols-2">
          <Section title={t('settings.learning.quizzes')} subtitle={t('settings.learning.quizzesHint')} icon={<ClipboardCheck className="h-4 w-4" />}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('settings.learning.quizQuestionCount')}>
                <Input {...num('quizQuestionCount', 1, 100)} />
              </Field>
              <Field label={t('settings.learning.quizPassMark')}>
                <Input {...num('quizPassMark', 0, 100)} suffix="%" />
              </Field>
              <Field label={t('settings.learning.examDefaultPassMark')}>
                <Input {...num('examDefaultPassMark', 0, 100)} suffix="%" />
              </Field>
            </div>
          </Section>

          <Section title={t('settings.learning.practice')} subtitle={t('settings.learning.practiceHint')} icon={<GraduationCap className="h-4 w-4" />}>
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <Field label={t('settings.learning.practiceSessionSizes')} hint={t('settings.learning.listHint')} error={sizesTooBig ? t('settings.learning.sizesTooBig') : draft.practiceSessionSizes.length === 0 ? t('errors.required') : undefined}>
                <TagInput value={draft.practiceSessionSizes.map(String)} onChange={(v) => set('practiceSessionSizes', toNums(v))} disabled={!editable} aria-label={t('settings.learning.practiceSessionSizes')} />
              </Field>
              <Field label={t('settings.learning.practiceMaxSize')}>
                <Input {...num('practiceMaxSize', 1, 500)} />
              </Field>
            </div>
            <Field label={t('settings.learning.dailyGoalMinutes')} className="max-w-xs">
              <Input {...num('dailyGoalMinutes', 1, 600)} suffix={t('common.minutes')} />
            </Field>
          </Section>

          <Section title={t('settings.learning.timing')} subtitle={t('settings.learning.timingHint')} icon={<Timer className="h-4 w-4" />}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('settings.learning.watchHeartbeat')}>
                <Input {...num('watchHeartbeatSeconds', 5, 120)} suffix={t('common.seconds')} />
              </Field>
              <Field label={t('settings.learning.examAutosave')}>
                <Input {...num('examAutosaveSeconds', 5, 300)} suffix={t('common.seconds')} />
              </Field>
              <Field label={t('settings.learning.examGrace')}>
                <Input {...num('examGraceSeconds', 0, 600)} suffix={t('common.seconds')} />
              </Field>
            </div>
          </Section>

          <Section title={t('settings.learning.bands')} subtitle={t('settings.learning.bandsHint')} icon={<CalendarRange className="h-4 w-4" />}>
            <div className="space-y-2">
              {draft.gradeBands.map((b, i) => (
                <div key={i} className="flex items-end gap-2">
                  <Field label={i === 0 ? t('settings.learning.bandKey') : undefined} className="flex-1">
                    <Input dir="ltr" value={b.key} invalid={!b.key.trim()} onChange={(e) => setBand(i, { key: e.target.value })} />
                  </Field>
                  <Field label={i === 0 ? t('settings.learning.bandMin') : undefined} className="w-32">
                    <Input type="number" min={0} max={100} dir="ltr" value={b.min} onChange={(e) => setBand(i, { min: Number(e.target.value) || 0 })} suffix="%" />
                  </Field>
                  <Button variant="ghost" size="icon-sm" className="mb-1 text-danger hover:bg-danger/10" onClick={() => set('gradeBands', draft.gradeBands.filter((_, k) => k !== i))} aria-label={t('actions.remove')}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {bandsInvalid && <p className="text-xs font-medium text-danger">{t('settings.learning.bandsInvalid')}</p>}
              <Button variant="secondary" size="sm" onClick={() => set('gradeBands', [...draft.gradeBands, { key: '', min: 0 }])} icon={<Plus className="h-4 w-4" />}>
                {t('settings.learning.addBand')}
              </Button>
            </div>
            <Field label={t('settings.learning.heatmapLevels')} hint={t('settings.learning.heatmapHint')}>
              <TagInput value={draft.heatmapLevels.map(String)} onChange={(v) => set('heatmapLevels', toNums(v))} disabled={!editable} aria-label={t('settings.learning.heatmapLevels')} />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {draft.heatmapLevels.map((m, i) => (
                <Badge key={m} tone="accent">
                  {t('settings.learning.levelN', { level: i + 1, minutes: m })}
                </Badge>
              ))}
            </div>
          </Section>
        </fieldset>
      )}
      {editable && <SaveBar dirty={dirty} onSave={onSave} onReset={reset} saving={save.isPending} />}
    </div>
  );
}
