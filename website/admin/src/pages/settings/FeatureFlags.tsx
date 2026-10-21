import { useMemo, useState } from 'react';
import { Flag, Search, ToggleRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { FeatureFlag } from '@/types';
import { useFeatureFlags } from '@/store/settings';
import { useMockLoading } from '@/hooks/useMockLoading';
import { useLocalize } from '@/hooks/useLocale';
import { fmtRelative } from '@/utils/format';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, EmptyState, Input, Segmented, Skeleton, StatCard, Switch, useConfirm, type Tone } from '@/components/ui';
import { ReadOnlyNotice, useCanEditSettings } from './_shared';

const ENV_TONE: Record<FeatureFlag['environment'], Tone> = { production: 'success', staging: 'warning', beta: 'purple' };
type EnvFilter = 'all' | FeatureFlag['environment'];

export default function FeatureFlags() {
  const { t } = useTranslation();
  const L = useLocalize();
  const loading = useMockLoading();
  const flags = useFeatureFlags((s) => s.items);
  const update = useFeatureFlags((s) => s.update);
  const confirm = useConfirm();
  const editable = useCanEditSettings();
  const [q, setQ] = useState('');
  const [env, setEnv] = useState<EnvFilter>('all');

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return flags.filter(
      (f) =>
        (env === 'all' || f.environment === env) &&
        (!query || [f.name_en, f.name_ar, f.key, f.description_en].some((s) => s.toLowerCase().includes(query))),
    );
  }, [flags, q, env]);

  const toggle = async (f: FeatureFlag, next: boolean) => {
    if (f.environment === 'production') {
      const ok = await confirm({
        title: t(next ? 'settings.flags.confirmEnableTitle' : 'settings.flags.confirmDisableTitle', { name: L(f, 'name') }),
        body: t('settings.flags.confirmProdBody'),
        tone: next ? 'primary' : 'warning',
        confirmText: next ? t('actions.enable') : t('actions.disable'),
      });
      if (!ok) return;
    }
    update(f.id, { enabled: next, updatedAt: new Date().toISOString() }, {
      action: 'feature_flag.toggle',
      summary: `${next ? 'Enabled' : 'Disabled'} ${f.name_en} in ${f.environment}`,
    });
    toast.success(t(next ? 'settings.flags.enabledToast' : 'settings.flags.disabledToast', { name: L(f, 'name') }));
  };

  const count = (e: FeatureFlag['environment']) => flags.filter((f) => f.environment === e).length;

  return (
    <div>
      <PageHeader title={t('settings.flags.title')} subtitle={t('settings.flags.subtitle')} />
      {!editable && <ReadOnlyNotice />}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('settings.flags.total')} value={flags.length} icon={<Flag />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('settings.flags.enabledCount')} value={flags.filter((f) => f.enabled).length} icon={<ToggleRight />} color="#16A34A" />
        <StatCard loading={loading} label={t('settings.flags.env.production')} value={count('production')} icon={<Flag />} color="#C9A24A" />
        <StatCard loading={loading} label={`${t('settings.flags.env.beta')} / ${t('settings.flags.env.staging')}`} value={count('beta') + count('staging')} icon={<Flag />} color="#7C3AED" />
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
        {loading ? (
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
                  <p className="mt-1 text-[11px] text-muted/80">{t('common.lastUpdated', { time: fmtRelative(f.updatedAt) })}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('text-xs font-semibold', f.enabled ? 'text-success' : 'text-muted')}>{f.enabled ? t('status.enabled') : t('status.disabled')}</span>
                  <Switch checked={f.enabled} onChange={(v) => toggle(f, v)} disabled={!editable} aria-label={L(f, 'name')} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
