import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpenText,
  Cpu,
  Lightbulb,
  Lock,
  Plus,
  Power,
  Search,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserX,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useDebounce } from '@/hooks/useMisc';
import { useApiQuery } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useLookups } from '@/api/lookups';
import { flatRef } from '@/api/adapters';
import type { Localized } from '@/api/types';
import {
  aiApi,
  useAiModels,
  useAiSettings,
  useSaveAiSettings,
  useToggleAi,
  useToggleUserAi,
  type AiProvider,
  type AiSettingsDto,
  type AiSettingsPatch,
} from '@/api/aiTutor';
import { cn } from '@/utils/cn';
import { formatPhone } from '@/utils/phone';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Segmented,
  Select,
  SkeletonCard,
  Switch,
  Textarea,
  useConfirm,
} from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { KnowledgeBaseCard } from './KnowledgeBaseCard';

type Draft = Required<
  Pick<
    AiSettingsPatch,
    | 'monthlyAllowance'
    | 'resetCycle'
    | 'provider'
    | 'model'
    | 'temperature'
    | 'maxTokens'
    | 'retrieval'
    | 'safetyRules'
    | 'suggestedPrompts'
  >
>;

function toDraft(s: AiSettingsDto): Draft {
  return {
    monthlyAllowance: s.monthlyAllowance,
    resetCycle: s.resetCycle,
    provider: s.provider,
    model: s.model,
    temperature: s.temperature,
    maxTokens: s.maxTokens,
    retrieval: s.retrieval,
    safetyRules: s.safetyRules,
    suggestedPrompts: s.suggestedPrompts ?? {},
  };
}

const EMPTY_DRAFT: Draft = {
  monthlyAllowance: 0,
  resetCycle: 'calendar',
  provider: 'anthropic',
  model: '',
  temperature: 0.3,
  maxTokens: 1024,
  retrieval: { transcripts: true, explanations: true, lessonNotes: false },
  safetyRules: '',
  suggestedPrompts: {},
};

export default function AiSettings() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const settingsQ = useAiSettings();
  const modelsQ = useAiModels();
  const lookups = useLookups();
  const save = useSaveAiSettings();
  const toggleAi = useToggleAi();
  const toggleUser = useToggleUserAi();
  const editable = can('aitutor', 'edit');
  const settings = settingsQ.data;
  const models = modelsQ.data ?? lookups.aiModels;

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [search, setSearch] = useState('');
  const [promptSubject, setPromptSubject] = useState('');
  const q = useDebounce(search.trim(), 300);
  const baseline = useMemo(() => (settings ? toDraft(settings) : EMPTY_DRAFT), [settings]);
  useEffect(() => setDraft(baseline), [baseline]);
  const dirty = !!settings && JSON.stringify(draft) !== JSON.stringify(baseline);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const subjects = lookups.subjects;
  const activeSubject = promptSubject || subjects[0]?.slug || '';
  const prompts = draft.suggestedPrompts[activeSubject] ?? [];
  const setPrompts = (list: Localized[]) =>
    set('suggestedPrompts', { ...draft.suggestedPrompts, [activeSubject]: list });

  const disabledIds = settings?.disabledUserIds ?? [];
  const searchQ = useApiQuery(qk.ai.sub('studentSearch', q), () => aiApi.searchStudents(q), {
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
  const matches = (searchQ.data ?? []).filter((s) => !disabledIds.includes(s.id)).slice(0, 6);

  const onToggleEnabled = async (next: boolean) => {
    if (!next) {
      const ok = await confirm({
        title: t('aitutor.settings.disableTitle'),
        body: t('aitutor.settings.disableBody'),
        confirmText: t('actions.disable'),
        tone: 'danger',
        reason: true,
      });
      if (!ok) return;
      toggleAi.mutate({ enabled: false, reason: ok.reason });
    } else {
      toggleAi.mutate({ enabled: true });
    }
  };

  const onSave = () => {
    if (
      draft.monthlyAllowance < 0 ||
      draft.monthlyAllowance > 1000 ||
      draft.maxTokens < 64 ||
      draft.maxTokens > 8192
    ) {
      toast.error(t('aitutor.settings.invalid'));
      return;
    }
    const cleanPrompts = Object.fromEntries(
      Object.entries(draft.suggestedPrompts).map(([k, list]) => [
        k,
        list.filter((p) => p.en.trim() || p.ar.trim()),
      ]),
    );
    save.mutate({ ...draft, suggestedPrompts: cleanPrompts });
  };

  const disableUser = (id: string, name: string) =>
    toggleUser.mutate(
      { studentId: id, disable: true },
      {
        onSuccess: () => {
          setSearch('');
          toast.success(t('aitutor.abuse.aiDisabledToast', { name }));
        },
      },
    );
  const enableUser = (id: string, name: string) =>
    toggleUser.mutate(
      { studentId: id, disable: false },
      { onSuccess: () => toast.success(t('aitutor.abuse.aiEnabledToast', { name })) },
    );

  const retrievalItems: { key: keyof Draft['retrieval']; label: string; desc: string }[] = [
    {
      key: 'transcripts',
      label: t('aitutor.settings.transcripts'),
      desc: t('aitutor.settings.transcriptsDesc'),
    },
    {
      key: 'explanations',
      label: t('aitutor.settings.explanations'),
      desc: t('aitutor.settings.explanationsDesc'),
    },
    {
      key: 'lessonNotes',
      label: t('aitutor.settings.lessonNotes'),
      desc: t('aitutor.settings.lessonNotesDesc'),
    },
  ];

  const enabled = settings?.enabled ?? false;
  const modelOptions = models[draft.provider] ?? [];

  return (
    <div className="pb-20">
      <PageHeader title={t('aitutor.settings.title')} subtitle={t('aitutor.settings.subtitle')} />

      {!editable && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
          <Lock className="h-4 w-4" /> {t('common.readOnly')}
        </div>
      )}

      {settingsQ.isLoading ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </div>
      ) : !settings ? (
        <QueryError error={settingsQ.error} onRetry={() => settingsQ.refetch()} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {/* Global kill switch */}
          <Card className={cn('xl:col-span-2', !enabled && 'border-danger/40')}>
            <CardBody className="flex flex-wrap items-center gap-4">
              <span
                className={cn(
                  'grid h-11 w-11 place-items-center rounded-xl',
                  enabled ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
                )}
              >
                <Power className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">{t('aitutor.settings.enabled')}</h2>
                  <Badge tone={enabled ? 'success' : 'danger'} dot>
                    {enabled ? t('status.enabled') : t('status.disabled')}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">{t('aitutor.settings.enabledDesc')}</p>
              </div>
              <Switch
                checked={enabled}
                onChange={onToggleEnabled}
                disabled={!editable || toggleAi.isPending}
                aria-label={t('aitutor.settings.enabled')}
              />
            </CardBody>
          </Card>

          {/* Allowance */}
          <Card>
            <CardHeader
              title={t('aitutor.settings.allowanceTitle')}
              subtitle={t('aitutor.settings.allowanceSub')}
              icon={<UserMinus className="h-4 w-4" />}
            />
            <CardBody className="space-y-5">
              <Field
                label={t('aitutor.settings.allowance')}
                hint={t('aitutor.settings.allowanceHint')}
                htmlFor="ai-allowance"
              >
                <Input
                  id="ai-allowance"
                  type="number"
                  min={0}
                  max={1000}
                  value={draft.monthlyAllowance}
                  disabled={!editable}
                  suffix={t('aitutor.settings.perMonth')}
                  onChange={(e) =>
                    set('monthlyAllowance', Math.max(0, Number(e.target.value) || 0))
                  }
                />
              </Field>
              <div>
                <span className="label">{t('aitutor.settings.resetCycle')}</span>
                <Segmented
                  aria-label={t('aitutor.settings.resetCycle')}
                  value={draft.resetCycle}
                  onChange={(v) => editable && set('resetCycle', v)}
                  options={[
                    { value: 'calendar', label: t('aitutor.settings.calendar') },
                    { value: 'billing', label: t('aitutor.settings.billing') },
                  ]}
                />
                <p className="mt-1.5 text-xs text-muted">
                  {t(
                    draft.resetCycle === 'calendar'
                      ? 'aitutor.settings.calendarDesc'
                      : 'aitutor.settings.billingDesc',
                  )}
                </p>
              </div>
            </CardBody>
          </Card>

          {/* Model */}
          <Card>
            <CardHeader
              title={t('aitutor.settings.modelTitle')}
              subtitle={t('aitutor.settings.modelSub')}
              icon={<Cpu className="h-4 w-4" />}
            />
            <CardBody className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('aitutor.settings.provider')} htmlFor="ai-provider">
                  <Select
                    id="ai-provider"
                    value={draft.provider}
                    disabled={!editable}
                    onChange={(e) => {
                      const p = e.target.value as AiProvider;
                      setDraft((d) => ({ ...d, provider: p, model: models[p]?.[0]?.value ?? '' }));
                    }}
                    options={(['openai', 'anthropic', 'azure'] as const).map((p) => ({
                      value: p,
                      label: t(`aitutor.providers.${p}`),
                    }))}
                  />
                </Field>
                <Field label={t('aitutor.settings.model')} htmlFor="ai-model">
                  <Select
                    id="ai-model"
                    value={draft.model}
                    disabled={!editable}
                    onChange={(e) => set('model', e.target.value)}
                    options={
                      modelOptions.some((m) => m.value === draft.model) || !draft.model
                        ? modelOptions
                        : [{ value: draft.model, label: draft.model }, ...modelOptions]
                    }
                  />
                </Field>
              </div>
              <Field
                label={
                  <span className="flex justify-between">
                    <span>{t('aitutor.settings.temperature')}</span>
                    <span className="num text-accent">{draft.temperature.toFixed(1)}</span>
                  </span>
                }
                hint={t('aitutor.settings.temperatureHint')}
                htmlFor="ai-temp"
              >
                <input
                  id="ai-temp"
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={draft.temperature}
                  disabled={!editable}
                  onChange={(e) => set('temperature', Number(e.target.value))}
                  className="w-full cursor-pointer accent-[#C9A24A] disabled:cursor-not-allowed"
                />
              </Field>
              <Field
                label={t('aitutor.settings.maxTokens')}
                hint={t('aitutor.settings.maxTokensHint')}
                htmlFor="ai-tokens"
              >
                <Input
                  id="ai-tokens"
                  type="number"
                  min={64}
                  max={8192}
                  step={64}
                  value={draft.maxTokens}
                  disabled={!editable}
                  onChange={(e) => set('maxTokens', Number(e.target.value) || 0)}
                />
              </Field>
            </CardBody>
          </Card>

          {/* Retrieval */}
          <Card>
            <CardHeader
              title={t('aitutor.settings.retrieval')}
              subtitle={t('aitutor.settings.retrievalSub')}
              icon={<BookOpenText className="h-4 w-4" />}
            />
            <CardBody className="space-y-4">
              {retrievalItems.map((r) => (
                <Switch
                  key={r.key}
                  label={r.label}
                  description={r.desc}
                  checked={draft.retrieval[r.key]}
                  disabled={!editable}
                  onChange={(v) => set('retrieval', { ...draft.retrieval, [r.key]: v })}
                />
              ))}
            </CardBody>
          </Card>

          {/* Safety */}
          <Card>
            <CardHeader
              title={t('aitutor.settings.safety')}
              subtitle={t('aitutor.settings.safetySub')}
              icon={<ShieldCheck className="h-4 w-4" />}
            />
            <CardBody>
              <Textarea
                rows={8}
                dir="ltr"
                value={draft.safetyRules}
                disabled={!editable}
                onChange={(e) => set('safetyRules', e.target.value)}
                aria-label={t('aitutor.settings.safety')}
                className="font-mono text-xs"
              />
              <p className="mt-1.5 text-xs text-muted">
                {t('aitutor.settings.safetyCount', {
                  count: draft.safetyRules.split('\n').filter((l) => l.trim()).length,
                })}
              </p>
            </CardBody>
          </Card>

          {/* Knowledge base (RAG index) */}
          <KnowledgeBaseCard editable={editable} />

          {/* Suggested prompts (student tutor home) */}
          <Card className="xl:col-span-2">
            <CardHeader
              title={t('aitutor.settings.promptsTitle')}
              subtitle={t('aitutor.settings.promptsSub')}
              icon={<Lightbulb className="h-4 w-4" />}
              action={
                subjects.length > 0 ? (
                  <Segmented
                    size="sm"
                    aria-label={t('common.subject')}
                    value={activeSubject}
                    onChange={setPromptSubject}
                    options={subjects.map((s) => ({ value: s.slug, label: L(s, 'name') }))}
                    className="hidden md:inline-flex"
                  />
                ) : undefined
              }
            />
            <CardBody className="space-y-3">
              {subjects.length > 0 && (
                <div className="md:hidden">
                  <Select
                    aria-label={t('common.subject')}
                    value={activeSubject}
                    onChange={(e) => setPromptSubject(e.target.value)}
                    options={subjects.map((s) => ({ value: s.slug, label: L(s, 'name') }))}
                  />
                </div>
              )}
              {prompts.length === 0 && (
                <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-xs text-muted">
                  {t('aitutor.settings.noPrompts')}
                </p>
              )}
              {prompts.map((p, i) => (
                <div key={i} className="grid items-start gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input
                    dir="ltr"
                    value={p.en}
                    disabled={!editable}
                    placeholder={t('aitutor.settings.promptEn')}
                    aria-label={t('aitutor.settings.promptEn')}
                    onChange={(e) =>
                      setPrompts(
                        prompts.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)),
                      )
                    }
                  />
                  <Input
                    dir="rtl"
                    value={p.ar}
                    disabled={!editable}
                    placeholder={t('aitutor.settings.promptAr')}
                    aria-label={t('aitutor.settings.promptAr')}
                    onChange={(e) =>
                      setPrompts(
                        prompts.map((x, j) => (j === i ? { ...x, ar: e.target.value } : x)),
                      )
                    }
                  />
                  {editable && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('actions.remove')}
                      onClick={() => setPrompts(prompts.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {editable && activeSubject && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Plus className="h-4 w-4" />}
                  disabled={prompts.length >= 8}
                  onClick={() => setPrompts([...prompts, { en: '', ar: '' }])}
                >
                  {t('aitutor.settings.addPrompt')}
                </Button>
              )}
            </CardBody>
          </Card>

          {/* Per-user disable */}
          <Card className="xl:col-span-2">
            <CardHeader
              title={t('aitutor.settings.perUser')}
              subtitle={t('aitutor.settings.perUserSub')}
              icon={<UserX className="h-4 w-4" />}
            />
            <CardBody className="grid gap-6 lg:grid-cols-2">
              <div>
                <Input
                  icon={<Search />}
                  value={search}
                  disabled={!editable}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('aitutor.settings.searchStudent')}
                  aria-label={t('aitutor.settings.searchStudent')}
                />
                {q.length >= 2 && (
                  <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
                    {searchQ.isFetching && matches.length === 0 && (
                      <li className="px-3 py-3 text-xs text-muted">
                        {t('aitutor.settings.searching')}
                      </li>
                    )}
                    {!searchQ.isFetching && matches.length === 0 && (
                      <li className="px-3 py-3 text-xs text-muted">{t('common.noResults')}</li>
                    )}
                    {matches.map((raw) => {
                      const s = flatRef(raw);
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            disabled={toggleUser.isPending}
                            onClick={() => disableUser(s.id, L(s, 'name'))}
                            className="flex w-full items-center gap-3 px-3 py-2 text-start transition hover:bg-ink/5 disabled:opacity-60"
                          >
                            <Avatar name={s.name_en} size="xs" />
                            <span className="min-w-0 flex-1 truncate text-sm">{L(s, 'name')}</span>
                            <span className="num text-xs text-muted" dir="ltr">
                              {formatPhone(s.mobile)}
                            </span>
                            <span className="text-xs font-semibold text-danger">
                              {t('actions.disable')}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-ink/80">
                  {t('aitutor.settings.disabledList', { count: settings.disabledUsers.length })}
                </div>
                {settings.disabledUsers.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-xs text-muted">
                    {t('aitutor.settings.noDisabled')}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {settings.disabledUsers.map((raw) => {
                      const s = flatRef(raw);
                      return (
                        <span
                          key={s.id}
                          className="inline-flex items-center gap-2 rounded-full border border-danger/25 bg-danger/5 py-1 pe-1.5 ps-1 text-xs font-medium text-ink"
                        >
                          <Avatar name={s.name_en} size="xs" />
                          {L(s, 'name')}
                          {editable && (
                            <button
                              type="button"
                              disabled={toggleUser.isPending}
                              onClick={() => enableUser(s.id, L(s, 'name'))}
                              className="rounded-full p-0.5 text-muted hover:bg-danger/10 hover:text-danger"
                              aria-label={`${t('actions.remove')} ${s.name_en}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Save bar */}
      <AnimatePresence>
        {dirty && editable && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-2xl items-center gap-3 rounded-xl border border-accent/40 bg-surface px-4 py-3 shadow-lift"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-warning" />
            <span className="flex-1 text-sm font-medium">{t('common.unsavedChanges')}</span>
            <Button variant="ghost" size="sm" onClick={() => setDraft(baseline)}>
              {t('actions.reset')}
            </Button>
            <Button size="sm" onClick={onSave} loading={save.isPending}>
              {t('actions.saveChanges')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
