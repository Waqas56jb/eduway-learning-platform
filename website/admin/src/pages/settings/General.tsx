import { useState } from 'react';
import { Building2, Globe2, Headset, ImageIcon, Mail, MessageCircle, Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGeneralSettings, useSupportContacts } from '@/store/settings';
import { useMockLoading } from '@/hooks/useMockLoading';
import { useLocalize } from '@/hooks/useLocale';
import { fmtDate } from '@/utils/format';
import { MOCK_NOW } from '@/utils/random';
import { PageHeader } from '@/components/layout/PageHeader';
import { ButtonLink, Field, FileUpload, Input, Select, SkeletonCard } from '@/components/ui';
import { LogoMark } from '@/components/layout/Logo';
import type { GeneralSettings } from '@/data/settings';
import { mockSave, ReadOnlyNotice, SaveBar, Section, useCanEditSettings, useDraft } from './_shared';

const TIMEZONES = ['Asia/Baghdad', 'Asia/Dubai', 'Asia/Riyadh', 'Europe/Istanbul', 'UTC'];
const DATE_FORMATS: GeneralSettings['dateFormat'][] = ['d MMM yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'];

export default function General() {
  const { t } = useTranslation();
  const L = useLocalize();
  const loading = useMockLoading();
  const value = useGeneralSettings((s) => s.value);
  const save = useGeneralSettings((s) => s.save);
  const support = useSupportContacts((s) => s.value);
  const { draft, set, dirty, reset } = useDraft(value);
  const editable = useCanEditSettings();
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!draft.platformName.trim() || !draft.platformName_ar.trim()) return;
    setSaving(true);
    await mockSave(() => save(draft), t);
    setSaving(false);
  };

  return (
    <div>
      <PageHeader title={t('settings.general.title')} subtitle={t('settings.general.subtitle')} />
      {!editable && <ReadOnlyNotice />}
      {loading ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <SkeletonCard lines={6} className="xl:col-span-2" />
          <SkeletonCard lines={4} />
        </div>
      ) : (
        <fieldset disabled={!editable} className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Section title={t('settings.general.branding')} subtitle={t('settings.general.brandingHint')} icon={<Building2 className="h-4 w-4" />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('settings.general.platformNameEn')} required error={!draft.platformName.trim() ? t('errors.required') : undefined}>
                  <Input value={draft.platformName} onChange={(e) => set('platformName', e.target.value)} dir="ltr" />
                </Field>
                <Field label={t('settings.general.platformNameAr')} required error={!draft.platformName_ar.trim() ? t('errors.required') : undefined}>
                  <Input value={draft.platformName_ar} onChange={(e) => set('platformName_ar', e.target.value)} dir="rtl" />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
                <Field label={t('settings.general.logo')} hint={t('settings.general.logoHint')}>
                  <FileUpload
                    accept="image/png,image/svg+xml,image/jpeg"
                    maxSizeMb={2}
                    compact
                    preview={draft.logo}
                    onFile={(_f, url) => url && set('logo', url)}
                    onClear={() => set('logo', null)}
                    disabled={!editable}
                  />
                </Field>
                <div>
                  <span className="label">{t('common.preview')}</span>
                  <div className="flex h-[118px] flex-col items-center justify-center gap-2 rounded-xl bg-[#0B1F3A] p-4">
                    {draft.logo ? <img src={draft.logo} alt="" className="h-10 max-w-[160px] object-contain" /> : <LogoMark className="h-10 w-10" />}
                    <span className="bg-gold-grad bg-clip-text font-display text-lg font-bold text-transparent">{L({ platformName_en: draft.platformName, platformName_ar: draft.platformName_ar }, 'platformName')}</span>
                  </div>
                </div>
              </div>
            </Section>

            <Section title={t('settings.general.localization')} subtitle={t('settings.general.localizationHint')} icon={<Globe2 className="h-4 w-4" />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('settings.general.defaultLanguage')} hint={t('settings.general.defaultLanguageHint')}>
                  <Select
                    value={draft.defaultLanguage}
                    onChange={(e) => set('defaultLanguage', e.target.value as GeneralSettings['defaultLanguage'])}
                    options={[
                      { value: 'ar', label: t('common.arabic') },
                      { value: 'en', label: t('common.english') },
                    ]}
                  />
                </Field>
                <Field label={t('common.currency')}>
                  <Select
                    value={draft.currency}
                    onChange={(e) => set('currency', e.target.value as GeneralSettings['currency'])}
                    options={[
                      { value: 'IQD', label: t('settings.general.iqd') },
                      { value: 'USD', label: t('settings.general.usd') },
                    ]}
                  />
                </Field>
                <Field label={t('settings.general.timezone')}>
                  <Select value={draft.timezone} onChange={(e) => set('timezone', e.target.value)} options={TIMEZONES.map((z) => ({ value: z, label: z }))} />
                </Field>
                <Field label={t('settings.general.dateFormat')} hint={`${t('common.preview')}: ${fmtDate(MOCK_NOW, draft.dateFormat)}`}>
                  <Select value={draft.dateFormat} onChange={(e) => set('dateFormat', e.target.value as GeneralSettings['dateFormat'])} options={DATE_FORMATS.map((f) => ({ value: f, label: f }))} />
                </Field>
                <Field label={t('settings.general.academicYear')}>
                  <Input value={draft.academicYear} onChange={(e) => set('academicYear', e.target.value)} />
                </Field>
              </div>
            </Section>
          </div>

          <div className="space-y-6">
            <Section
              title={t('settings.general.supportSummary')}
              subtitle={t('settings.general.supportSummaryHint')}
              icon={<Headset className="h-4 w-4" />}
              action={
                <ButtonLink to="/settings/support" variant="secondary" size="sm">
                  {t('actions.edit')}
                </ButtonLink>
              }
            >
              <ul className="space-y-3 text-sm">
                {[
                  { icon: <Phone className="h-4 w-4" />, label: t('settings.support.phone'), value: support.phone },
                  { icon: <MessageCircle className="h-4 w-4" />, label: t('settings.support.whatsapp'), value: support.whatsapp },
                  { icon: <Mail className="h-4 w-4" />, label: t('common.email'), value: support.email },
                ].map((r) => (
                  <li key={r.label} className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/10 text-accent">{r.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-xs text-muted">{r.label}</span>
                      <span className="block truncate font-medium text-ink" dir="ltr">
                        {r.value}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{L(support, 'hours')}</p>
            </Section>
            <Section title={t('settings.general.assets')} icon={<ImageIcon className="h-4 w-4" />}>
              <p className="text-sm text-muted">{t('settings.general.assetsHint')}</p>
            </Section>
          </div>
        </fieldset>
      )}
      {editable && <SaveBar dirty={dirty} onSave={onSave} onReset={reset} saving={saving} />}
    </div>
  );
}
