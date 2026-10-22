import { Construction, MonitorSmartphone, Smartphone, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSaveSettings, useSettingsSection, type AppSettings as AppSettingsValue } from '@/api/settings';
import type { Platform } from '@/api/types';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Field, Input, Select, SkeletonCard, Switch, Textarea, useConfirm } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { ChipToggle, ReadOnlyNotice, SaveBar, Section, useCanEditSettings, useDraft } from './_shared';

const SEMVER = /^\d+\.\d+\.\d+$/;
const TIMEOUTS = [60, 240, 1440, 10080, 43200];
const URL_RE = /^https?:\/\/\S+$/;
const EMPTY: AppSettingsValue = {
  minVersionIos: '0.0.0',
  minVersionAndroid: '0.0.0',
  latestVersion: '0.0.0',
  forceUpdate: false,
  maintenanceMode: false,
  maintenanceMessage_en: '',
  maintenanceMessage_ar: '',
  deviceLimit: 2,
  sessionTimeoutMinutes: 43200,
  storeUrlIos: '',
  storeUrlAndroid: '',
  maintenanceAppliesTo: ['web', 'ios', 'android'],
};

export default function AppSettings() {
  const { t } = useTranslation();
  const q = useSettingsSection('app');
  const save = useSaveSettings('app');
  const loading = q.isLoading;
  const value = q.data ?? EMPTY;
  const { draft, set, dirty, reset } = useDraft(value);
  const editable = useCanEditSettings();
  const confirm = useConfirm();

  const badIos = !SEMVER.test(draft.minVersionIos);
  const badAndroid = !SEMVER.test(draft.minVersionAndroid);
  const badLatest = !SEMVER.test(draft.latestVersion);
  const badIosUrl = !!draft.storeUrlIos.trim() && !URL_RE.test(draft.storeUrlIos.trim());
  const badAndroidUrl = !!draft.storeUrlAndroid.trim() && !URL_RE.test(draft.storeUrlAndroid.trim());

  const onSave = async () => {
    if (badIos || badAndroid || badLatest || badIosUrl || badAndroidUrl) return;
    if (draft.maintenanceMode && !value.maintenanceMode) {
      const ok = await confirm({
        title: t('settings.app.enableMaintenanceTitle'),
        body: t('settings.app.enableMaintenanceBody'),
        tone: 'danger',
        confirmText: t('settings.app.enableMaintenance'),
        typeToConfirm: 'MAINTENANCE',
      });
      if (!ok) return;
    }
    if (draft.forceUpdate && !value.forceUpdate) {
      const ok = await confirm({ title: t('settings.app.forceUpdateTitle'), body: t('settings.app.forceUpdateBody', { version: draft.minVersionAndroid }), tone: 'warning' });
      if (!ok) return;
    }
    save.mutate(draft);
  };

  const timeoutLabel = (m: number) =>
    m >= 1440 ? t('settings.app.daysN', { count: m / 1440 }) : m >= 60 ? t('settings.app.hoursN', { count: m / 60 }) : t('settings.app.minutesN', { count: m });

  return (
    <div>
      <PageHeader
        title={t('settings.app.title')}
        subtitle={t('settings.app.subtitle')}
        meta={value.maintenanceMode ? <Badge tone="danger" dot>{t('settings.app.maintenanceLive')}</Badge> : <Badge tone="success" dot>{t('settings.app.appLive')}</Badge>}
      />
      {!editable && <ReadOnlyNotice />}
      {q.error && !q.data ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} />
      ) : loading ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={5} />
        </div>
      ) : (
        <fieldset disabled={!editable} className="grid gap-6 xl:grid-cols-2">
          <Section title={t('settings.app.versions')} subtitle={t('settings.app.versionsHint')} icon={<Smartphone className="h-4 w-4" />}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('settings.app.minIos')} error={badIos ? t('settings.app.versionInvalid') : undefined}>
                <Input dir="ltr" value={draft.minVersionIos} invalid={badIos} onChange={(e) => set('minVersionIos', e.target.value)} />
              </Field>
              <Field label={t('settings.app.minAndroid')} error={badAndroid ? t('settings.app.versionInvalid') : undefined}>
                <Input dir="ltr" value={draft.minVersionAndroid} invalid={badAndroid} onChange={(e) => set('minVersionAndroid', e.target.value)} />
              </Field>
              <Field label={t('settings.app.latest')} error={badLatest ? t('settings.app.versionInvalid') : undefined}>
                <Input dir="ltr" value={draft.latestVersion} invalid={badLatest} onChange={(e) => set('latestVersion', e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('settings.app.storeUrlIos')} error={badIosUrl ? t('settings.app.urlInvalid') : undefined}>
                <Input dir="ltr" placeholder="https://apps.apple.com/…" value={draft.storeUrlIos} invalid={badIosUrl} onChange={(e) => set('storeUrlIos', e.target.value)} />
              </Field>
              <Field label={t('settings.app.storeUrlAndroid')} error={badAndroidUrl ? t('settings.app.urlInvalid') : undefined}>
                <Input dir="ltr" placeholder="https://play.google.com/…" value={draft.storeUrlAndroid} invalid={badAndroidUrl} onChange={(e) => set('storeUrlAndroid', e.target.value)} />
              </Field>
            </div>
            <Switch checked={draft.forceUpdate} onChange={(v) => set('forceUpdate', v)} label={t('settings.app.forceUpdate')} description={t('settings.app.forceUpdateHint')} disabled={!editable} />
          </Section>

          <Section title={t('settings.app.sessions')} subtitle={t('settings.app.sessionsHint')} icon={<MonitorSmartphone className="h-4 w-4" />}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('settings.app.deviceLimit')} hint={t('settings.app.deviceLimitHint')}>
                <Select value={String(draft.deviceLimit)} onChange={(e) => set('deviceLimit', Number(e.target.value))} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: t('settings.app.devicesN', { count: n }) }))} />
              </Field>
              <Field label={t('settings.app.sessionTimeout')} hint={t('settings.app.sessionTimeoutHint')}>
                <Select value={String(draft.sessionTimeoutMinutes)} onChange={(e) => set('sessionTimeoutMinutes', Number(e.target.value))} options={TIMEOUTS.map((m) => ({ value: String(m), label: timeoutLabel(m) }))} />
              </Field>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted">
              <Timer className="h-4 w-4 text-accent" />
              {t('settings.app.sessionSummary', { devices: draft.deviceLimit, timeout: timeoutLabel(draft.sessionTimeoutMinutes) })}
            </div>
          </Section>

          <div className={cn('rounded-xl border bg-surface shadow-card transition-colors xl:col-span-2', draft.maintenanceMode ? 'border-danger/40' : 'border-line')}>
            <div className="flex flex-col gap-4 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className={cn('grid h-8 w-8 place-items-center rounded-lg', draft.maintenanceMode ? 'bg-danger/10 text-danger' : 'bg-accent/10 text-accent')}>
                  <Construction className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="section-title">{t('settings.app.maintenance')}</h3>
                  <p className="mt-0.5 text-xs text-muted">{t('settings.app.maintenanceHint')}</p>
                </div>
              </div>
              <Switch checked={draft.maintenanceMode} onChange={(v) => set('maintenanceMode', v)} disabled={!editable} aria-label={t('settings.app.maintenanceMode')} />
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label={t('settings.app.appliesTo')} hint={t('settings.app.appliesToHint')} className="md:col-span-2">
                <ChipToggle<Platform>
                  min={1}
                  disabled={!editable}
                  value={draft.maintenanceAppliesTo}
                  onChange={(v) => set('maintenanceAppliesTo', v)}
                  options={(['web', 'ios', 'android'] as Platform[]).map((p) => ({ value: p, label: t(`settings.platforms.${p}`) }))}
                />
              </Field>
              <Field label={t('settings.app.messageEn')}>
                <Textarea dir="ltr" rows={3} value={draft.maintenanceMessage_en} onChange={(e) => set('maintenanceMessage_en', e.target.value)} />
              </Field>
              <Field label={t('settings.app.messageAr')}>
                <Textarea dir="rtl" rows={3} value={draft.maintenanceMessage_ar} onChange={(e) => set('maintenanceMessage_ar', e.target.value)} />
              </Field>
              <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
                {(['en', 'ar'] as const).map((l) => (
                  <div key={l} dir={l === 'ar' ? 'rtl' : 'ltr'} className="flex items-center gap-3 rounded-xl bg-[#0B1F3A] p-4 text-white" style={{ fontFamily: l === 'ar' ? 'Tajawal, sans-serif' : 'Inter, sans-serif' }}>
                    <Construction className="h-6 w-6 shrink-0 text-accent" />
                    <p className="text-sm leading-relaxed text-white/85">{l === 'ar' ? draft.maintenanceMessage_ar : draft.maintenanceMessage_en}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </fieldset>
      )}
      {editable && <SaveBar dirty={dirty} onSave={onSave} onReset={reset} saving={save.isPending} />}
    </div>
  );
}
