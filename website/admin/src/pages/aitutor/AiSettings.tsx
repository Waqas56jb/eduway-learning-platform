import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpenText, Cpu, Lock, Power, Search, ShieldCheck, UserMinus, UserX, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AI_MODELS } from '@/data/ai';
import type { AiSettings as Settings } from '@/types';
import { useAiSettings } from '@/store/ai';
import { useStudents } from '@/store/core';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, Card, CardBody, CardHeader, Field, Input, Segmented, Select, SkeletonCard, Switch, Textarea, useConfirm } from '@/components/ui';

type Draft = Omit<Settings, 'enabled'>;

function toDraft(s: Settings): Draft {
  const { enabled, ...rest } = s;
  void enabled;
  return rest;
}

export default function AiSettings() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const loading = useMockLoading(400);
  const settings = useAiSettings((s) => s.settings);
  const update = useAiSettings((s) => s.update);
  const students = useStudents((s) => s.items);
  const editable = can('aitutor', 'edit');

  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  const [search, setSearch] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(settings));

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter((s) => !draft.disabledUserIds.includes(s.id) && [s.name_en, s.name_ar, s.mobile, s.id].some((x) => x.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [search, students, draft.disabledUserIds]);

  const toggleEnabled = async (next: boolean) => {
    if (!next) {
      const ok = await confirm({ title: t('aitutor.settings.disableTitle'), body: t('aitutor.settings.disableBody'), confirmText: t('actions.disable'), tone: 'danger', reason: true });
      if (!ok) return;
      update({ enabled: false }, { action: 'ai_settings.disable', summary: `Disabled AI Tutor globally — ${ok.reason}` });
      toast.success(t('aitutor.settings.disabledToast'));
    } else {
      update({ enabled: true }, { action: 'ai_settings.enable', summary: 'Enabled AI Tutor globally' });
      toast.success(t('aitutor.settings.enabledToast'));
    }
  };

  const save = () => {
    if (draft.monthlyAllowance < 0 || draft.maxTokens < 64) {
      toast.error(t('toast.error'));
      return;
    }
    update(draft);
    toast.success(t('toast.saved'));
  };

  const retrievalItems: { key: keyof Draft['retrieval']; label: string; desc: string }[] = [
    { key: 'transcripts', label: t('aitutor.settings.transcripts'), desc: t('aitutor.settings.transcriptsDesc') },
    { key: 'explanations', label: t('aitutor.settings.explanations'), desc: t('aitutor.settings.explanationsDesc') },
    { key: 'lessonNotes', label: t('aitutor.settings.lessonNotes'), desc: t('aitutor.settings.lessonNotesDesc') },
  ];

  return (
    <div className="pb-20">
      <PageHeader title={t('aitutor.settings.title')} subtitle={t('aitutor.settings.subtitle')} />

      {!editable && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
          <Lock className="h-4 w-4" /> {t('common.readOnly')}
        </div>
      )}

      {loading ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {/* Global kill switch */}
          <Card className={cn('xl:col-span-2', !settings.enabled && 'border-danger/40')}>
            <CardBody className="flex flex-wrap items-center gap-4">
              <span className={cn('grid h-11 w-11 place-items-center rounded-xl', settings.enabled ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}>
                <Power className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">{t('aitutor.settings.enabled')}</h2>
                  <Badge tone={settings.enabled ? 'success' : 'danger'} dot>
                    {settings.enabled ? t('status.enabled') : t('status.disabled')}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">{t('aitutor.settings.enabledDesc')}</p>
              </div>
              <Switch checked={settings.enabled} onChange={toggleEnabled} disabled={!editable} aria-label={t('aitutor.settings.enabled')} />
            </CardBody>
          </Card>

          {/* Allowance */}
          <Card>
            <CardHeader title={t('aitutor.settings.allowanceTitle')} subtitle={t('aitutor.settings.allowanceSub')} icon={<UserMinus className="h-4 w-4" />} />
            <CardBody className="space-y-5">
              <Field label={t('aitutor.settings.allowance')} hint={t('aitutor.settings.allowanceHint')} htmlFor="ai-allowance">
                <Input
                  id="ai-allowance"
                  type="number"
                  min={0}
                  max={1000}
                  value={draft.monthlyAllowance}
                  disabled={!editable}
                  suffix={t('aitutor.settings.perMonth')}
                  onChange={(e) => set('monthlyAllowance', Math.max(0, Number(e.target.value) || 0))}
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
                <p className="mt-1.5 text-xs text-muted">{t(draft.resetCycle === 'calendar' ? 'aitutor.settings.calendarDesc' : 'aitutor.settings.billingDesc')}</p>
              </div>
            </CardBody>
          </Card>

          {/* Model */}
          <Card>
            <CardHeader title={t('aitutor.settings.modelTitle')} subtitle={t('aitutor.settings.modelSub')} icon={<Cpu className="h-4 w-4" />} />
            <CardBody className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('aitutor.settings.provider')} htmlFor="ai-provider">
                  <Select
                    id="ai-provider"
                    value={draft.provider}
                    disabled={!editable}
                    onChange={(e) => {
                      const p = e.target.value as Draft['provider'];
                      setDraft((d) => ({ ...d, provider: p, model: AI_MODELS[p][0].value }));
                    }}
                    options={(['openai', 'anthropic', 'azure'] as const).map((p) => ({ value: p, label: t(`aitutor.providers.${p}`) }))}
                  />
                </Field>
                <Field label={t('aitutor.settings.model')} htmlFor="ai-model">
                  <Select id="ai-model" value={draft.model} disabled={!editable} onChange={(e) => set('model', e.target.value)} options={AI_MODELS[draft.provider]} />
                </Field>
              </div>
              <Field label={<span className="flex justify-between"><span>{t('aitutor.settings.temperature')}</span><span className="num text-accent">{draft.temperature.toFixed(1)}</span></span>} hint={t('aitutor.settings.temperatureHint')} htmlFor="ai-temp">
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
              <Field label={t('aitutor.settings.maxTokens')} hint={t('aitutor.settings.maxTokensHint')} htmlFor="ai-tokens">
                <Input id="ai-tokens" type="number" min={64} max={8192} step={64} value={draft.maxTokens} disabled={!editable} onChange={(e) => set('maxTokens', Number(e.target.value) || 0)} />
              </Field>
            </CardBody>
          </Card>

          {/* Retrieval */}
          <Card>
            <CardHeader title={t('aitutor.settings.retrieval')} subtitle={t('aitutor.settings.retrievalSub')} icon={<BookOpenText className="h-4 w-4" />} />
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
            <CardHeader title={t('aitutor.settings.safety')} subtitle={t('aitutor.settings.safetySub')} icon={<ShieldCheck className="h-4 w-4" />} />
            <CardBody>
              <Textarea rows={8} dir="ltr" value={draft.safetyRules} disabled={!editable} onChange={(e) => set('safetyRules', e.target.value)} aria-label={t('aitutor.settings.safety')} className="font-mono text-xs" />
              <p className="mt-1.5 text-xs text-muted">{t('aitutor.settings.safetyCount', { count: draft.safetyRules.split('\n').filter((l) => l.trim()).length })}</p>
            </CardBody>
          </Card>

          {/* Per-user disable */}
          <Card className="xl:col-span-2">
            <CardHeader title={t('aitutor.settings.perUser')} subtitle={t('aitutor.settings.perUserSub')} icon={<UserX className="h-4 w-4" />} />
            <CardBody className="grid gap-6 lg:grid-cols-2">
              <div>
                <Input icon={<Search />} value={search} disabled={!editable} onChange={(e) => setSearch(e.target.value)} placeholder={t('aitutor.settings.searchStudent')} aria-label={t('aitutor.settings.searchStudent')} />
                {search.trim() && (
                  <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
                    {matches.length === 0 && <li className="px-3 py-3 text-xs text-muted">{t('common.noResults')}</li>}
                    {matches.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            set('disabledUserIds', [...draft.disabledUserIds, s.id]);
                            setSearch('');
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-start transition hover:bg-ink/5"
                        >
                          <Avatar name={s.name_en} size="xs" />
                          <span className="min-w-0 flex-1 truncate text-sm">{L(s, 'name')}</span>
                          <span className="text-xs text-muted num" dir="ltr">
                            {s.mobile}
                          </span>
                          <span className="text-xs font-semibold text-danger">{t('actions.disable')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-ink/80">{t('aitutor.settings.disabledList', { count: draft.disabledUserIds.length })}</div>
                {draft.disabledUserIds.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-xs text-muted">{t('aitutor.settings.noDisabled')}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {draft.disabledUserIds.map((id) => {
                      const s = students.find((x) => x.id === id);
                      return (
                        <span key={id} className="inline-flex items-center gap-2 rounded-full border border-danger/25 bg-danger/5 py-1 pe-1.5 ps-1 text-xs font-medium text-ink">
                          <Avatar name={s?.name_en ?? id} size="xs" />
                          {s ? L(s, 'name') : id}
                          {editable && (
                            <button
                              type="button"
                              onClick={() => set('disabledUserIds', draft.disabledUserIds.filter((x) => x !== id))}
                              className="rounded-full p-0.5 text-muted hover:bg-danger/10 hover:text-danger"
                              aria-label={`${t('actions.remove')} ${s?.name_en ?? id}`}
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
            <Button variant="ghost" size="sm" onClick={() => setDraft(toDraft(settings))}>
              {t('actions.reset')}
            </Button>
            <Button size="sm" onClick={save}>
              {t('actions.saveChanges')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
