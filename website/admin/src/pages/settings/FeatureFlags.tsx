import { useEffect, useState } from 'react';
import { Flag, Plus, Search, ToggleRight, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { flatRef } from '@/api/adapters';
import { flagsApi, useFeatureFlags, type FeatureFlagUi, type FlagEnvironment } from '@/api/settings';
import { useApiMutation } from '@/api/hooks';
import { qk } from '@/api/keys';
import type { Platform } from '@/api/types';
import { useCan } from '@/store/auth';
import { useDebounce } from '@/hooks/useMisc';
import { useLocalize } from '@/hooks/useLocale';
import { fmtRelative } from '@/utils/format';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, EmptyState, Field, Input, Modal, Segmented, Select, Skeleton, StatCard, Switch, Textarea, useConfirm, type Tone } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { ChipToggle, ReadOnlyNotice, useCanEditSettings } from './_shared';

const ENV_TONE: Record<FlagEnvironment, Tone> = { production: 'success', staging: 'warning', beta: 'purple' };
const PLATFORMS: Platform[] = ['web', 'ios', 'android'];
const KEY_RE = /^[a-z][a-z0-9_]{2,40}$/;
type EnvFilter = 'all' | FlagEnvironment;
type FlagsData = Awaited<ReturnType<typeof flagsApi.list>>;

export default function FeatureFlags() {
  const { t } = useTranslation();
  const L = useLocalize();
  const confirm = useConfirm();
  const editable = useCanEditSettings();
  const canDelete = useCan()('settings', 'delete');
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const query = useDebounce(q.trim(), 300);
  const [env, setEnv] = useState<EnvFilter>('all');
  const [creating, setCreating] = useState(false);

  const params = { environment: env === 'all' ? undefined : env, q: query || undefined };
  const listQ = useFeatureFlags(params);
  const loading = listQ.isLoading;
  const shown = listQ.data?.items ?? [];
  const counts = listQ.data?.counts ?? {
    total: shown.length,
    enabled: shown.filter((f) => f.enabled).length,
    production: shown.filter((f) => f.environment === 'production').length,
    betaStaging: shown.filter((f) => f.environment !== 'production').length,
  };

  const listKey = qk.featureFlags.list(params);
  const patch = useApiMutation(
    (v: { flag: FeatureFlagUi; body: { enabled?: boolean; platforms?: Platform[]; rolloutPct?: number } }) => flagsApi.patch(v.flag.id, v.body),
    {
      invalidate: [qk.featureFlags.all],
      onMutate: async ({ flag, body }) => {
        await qc.cancelQueries({ queryKey: listKey });
        const prev = qc.getQueryData<FlagsData>(listKey);
        if (prev) qc.setQueryData<FlagsData>(listKey, { ...prev, items: prev.items.map((f) => (f.id === flag.id ? { ...f, ...body } : f)) });
        return { prev };
      },
      onError: (_e, _v, ctx) => {
        const c = ctx as { prev?: FlagsData } | undefined;
        if (c?.prev) qc.setQueryData(listKey, c.prev);
      },
    },
  );

  const remove = useApiMutation((f: FeatureFlagUi) => flagsApi.remove(f.id), { invalidate: [qk.featureFlags.all], success: 'settings.flags.deleted' });

  const toggle = async (f: FeatureFlagUi, next: boolean) => {
    if (f.environment === 'production') {
      const ok = await confirm({
        title: t(next ? 'settings.flags.confirmEnableTitle' : 'settings.flags.confirmDisableTitle', { name: L(f, 'name') }),
        body: t('settings.flags.confirmProdBody'),
        tone: next ? 'primary' : 'warning',
        confirmText: next ? t('actions.enable') : t('actions.disable'),
      });
      if (!ok) return;
    }
    patch.mutate(
      { flag: f, body: { enabled: next } },
      { onSuccess: () => toast.success(t(next ? 'settings.flags.enabledToast' : 'settings.flags.disabledToast', { name: L(f, 'name') })) },
    );
  };

  const del = async (f: FeatureFlagUi) => {
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: L(f, 'name') }), body: t('settings.flags.deleteBody'), tone: 'danger', confirmText: t('actions.delete'), typeToConfirm: f.key });
    if (ok) remove.mutate(f);
  };

  return (
    <div>
      <PageHeader
        title={t('settings.flags.title')}
        subtitle={t('settings.flags.subtitle')}
        actions={
          editable && (
            <Button onClick={() => setCreating(true)} icon={<Plus className="h-4 w-4" />}>
              {t('settings.flags.newFlag')}
            </Button>
          )
        }
      />
      {!editable && <ReadOnlyNotice />}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('settings.flags.total')} value={counts.total} icon={<Flag />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('settings.flags.enabledCount')} value={counts.enabled} icon={<ToggleRight />} color="#16A34A" />
        <StatCard loading={loading} label={t('settings.flags.env.production')} value={counts.production} icon={<Flag />} color="#C9A24A" />
        <StatCard loading={loading} label={`${t('settings.flags.env.beta')} / ${t('settings.flags.env.staging')}`} value={counts.betaStaging} icon={<Flag />} color="#7C3AED" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('settings.flags.search')} className="w-full sm:w-72 [&_input]:h-9" aria-label={t('actions.search')} />
          <Segmented<EnvFilter>
            size="sm"
            value={env}
            onChange={setEnv}
            aria-label={t('settings.flags.environment')}
            options={[
              { value: 'all', label: t('common.all') },
              { value: 'production', label: t('settings.flags.env.production') },
              { value: 'beta', label: t('settings.flags.env.beta') },
              { value: 'staging', label: t('settings.flags.env.staging') },
            ]}
          />
        </div>
        {listQ.error && !listQ.data ? (
          <QueryError compact error={listQ.error} onRetry={() => listQ.refetch()} />
        ) : loading ? (
          <div className="divide-y divide-line">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <Skeleton className="h-6 w-11 rounded-full" />
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState title={t('common.noResults')} hint={t('common.noResultsHint')} />
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((f) => (
              <li key={f.id} className={cn('flex flex-col gap-3 px-5 py-4 transition-colors sm:flex-row sm:items-center', f.enabled && 'bg-success/[0.02]')}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{L(f, 'name')}</span>
                    <Badge tone={ENV_TONE[f.environment]} dot>
                      {t(`settings.flags.env.${f.environment}`)}
                    </Badge>
                    <code className="rounded bg-ink/5 px-1.5 py-0.5 text-[11px] text-muted" dir="ltr">
                      {f.key}
                    </code>
                  </div>
                  <p className="mt-1 text-sm text-muted">{L(f, 'description')}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <ChipToggle<Platform>
                      min={1}
                      disabled={!editable}
                      value={f.platforms}
                      onChange={(platforms) => patch.mutate({ flag: f, body: { platforms } })}
                      options={PLATFORMS.map((p) => ({ value: p, label: t(`settings.platforms.${p}`) }))}
                    />
                    <RolloutInput value={f.rolloutPct} disabled={!editable} onCommit={(rolloutPct) => patch.mutate({ flag: f, body: { rolloutPct } })} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted/80">
                    {t('common.lastUpdated', { time: fmtRelative(f.updatedAt) })}
                    {f.updatedBy && ` · ${L(flatRef(f.updatedBy), 'name')}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('text-xs font-semibold', f.enabled ? 'text-success' : 'text-muted')}>{f.enabled ? t('status.enabled') : t('status.disabled')}</span>
                  <Switch checked={f.enabled} onChange={(v) => toggle(f, v)} disabled={!editable} aria-label={L(f, 'name')} />
                  {canDelete && (
                    <Button variant="ghost" size="icon-sm" className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => del(f)} aria-label={t('actions.delete')}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateFlagModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

/** Rollout % input that saves on blur / Enter. */
function RolloutInput({ value, onCommit, disabled }: { value: number; onCommit: (v: number) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
    setV(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted">
      {t('settings.flags.rollout')}
      <Input
        type="number"
        min={0}
        max={100}
        value={v}
        disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        suffix="%"
        className="w-24 [&_input]:h-7 [&_input]:text-xs"
        aria-label={t('settings.flags.rollout')}
      />
    </label>
  );
}

const EMPTY_FORM = { key: '', name_en: '', name_ar: '', description_en: '', description_ar: '', environment: 'beta' as FlagEnvironment, enabled: false };

function CreateFlagModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setTouched(false);
    }
  }, [open]);
  const create = useApiMutation(flagsApi.create, { invalidate: [qk.featureFlags.all], success: 'settings.flags.created', onSuccess: () => onClose() });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const badKey = !KEY_RE.test(form.key);
  const invalid = badKey || !form.name_en.trim() || !form.name_ar.trim();
  const submit = () => {
    setTouched(true);
    if (invalid) return;
    create.mutate({
      key: form.key,
      name: { en: form.name_en.trim(), ar: form.name_ar.trim() },
      description: { en: form.description_en.trim(), ar: form.description_ar.trim() },
      environment: form.environment,
      enabled: form.enabled,
    });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('settings.flags.newFlag')}
      description={t('settings.flags.newFlagHint')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            {t('actions.create')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.flags.key')} required hint={t('settings.flags.keyHint')} error={touched && badKey ? t('settings.flags.keyInvalid') : undefined}>
          <Input dir="ltr" value={form.key} invalid={touched && badKey} onChange={(e) => set('key', e.target.value.toLowerCase())} placeholder="new_feature" />
        </Field>
        <Field label={t('settings.flags.environment')}>
          <Select
            value={form.environment}
            onChange={(e) => set('environment', e.target.value as FlagEnvironment)}
            options={(['production', 'beta', 'staging'] as FlagEnvironment[]).map((e) => ({ value: e, label: t(`settings.flags.env.${e}`) }))}
          />
        </Field>
        <Field label={t('settings.flags.nameEn')} required error={touched && !form.name_en.trim() ? t('errors.required') : undefined}>
          <Input dir="ltr" value={form.name_en} onChange={(e) => set('name_en', e.target.value)} />
        </Field>
        <Field label={t('settings.flags.nameAr')} required error={touched && !form.name_ar.trim() ? t('errors.required') : undefined}>
          <Input dir="rtl" value={form.name_ar} onChange={(e) => set('name_ar', e.target.value)} />
        </Field>
        <Field label={t('settings.flags.descriptionEn')}>
          <Textarea dir="ltr" rows={3} value={form.description_en} onChange={(e) => set('description_en', e.target.value)} />
        </Field>
        <Field label={t('settings.flags.descriptionAr')}>
          <Textarea dir="rtl" rows={3} value={form.description_ar} onChange={(e) => set('description_ar', e.target.value)} />
        </Field>
        <Switch className="sm:col-span-2" checked={form.enabled} onChange={(v) => set('enabled', v)} label={t('settings.flags.enabledOnCreate')} />
      </div>
    </Modal>
  );
}
