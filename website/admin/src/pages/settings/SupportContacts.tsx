import { useState } from 'react';
import { Clock, Globe, Headset, Mail, MapPin, MessageCircle, Phone, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSaveSettings, useSettingsSection, type SupportContacts as Contacts } from '@/api/settings';
import { useLang } from '@/hooks/useLocale';
import { PageHeader } from '@/components/layout/PageHeader';
import { Field, Input, Segmented, SkeletonCard, Textarea } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { formatPhone } from '@/utils/phone';
import { ReadOnlyNotice, SaveBar, Section, useCanEditSettings, useDraft } from './_shared';

const SOCIAL: (keyof Contacts)[] = ['facebook', 'instagram', 'telegram', 'youtube', 'tiktok'];
const EMPTY: Contacts = { phone: '', whatsapp: '', email: '', hours_en: '', hours_ar: '', address_en: '', address_ar: '', facebook: '', instagram: '', telegram: '', youtube: '', tiktok: '' };
const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export default function SupportContacts() {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useSettingsSection('support');
  const save = useSaveSettings('support');
  const loading = q.isLoading;
  const value = q.data ?? EMPTY;
  const { draft, set, dirty, reset } = useDraft(value);
  const editable = useCanEditSettings();
  const [previewLang, setPreviewLang] = useState<'en' | 'ar'>(lang);

  const invalidEmail = !emailOk(draft.email);
  const onSave = () => {
    if (invalidEmail || !draft.phone.trim()) return;
    save.mutate(draft);
  };

  const text = (k: keyof Contacts) => ({ value: draft[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value) });

  return (
    <div>
      <PageHeader title={t('settings.support.title')} subtitle={t('settings.support.subtitle')} />
      {!editable && <ReadOnlyNotice />}
      {q.error && !q.data ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} />
      ) : loading ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <SkeletonCard lines={6} className="xl:col-span-2" />
          <SkeletonCard lines={5} />
        </div>
      ) : (
        <fieldset disabled={!editable} className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Section title={t('settings.support.channels')} icon={<Headset className="h-4 w-4" />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('settings.support.phone')} required error={!draft.phone.trim() ? t('errors.required') : undefined}>
                  <Input icon={<Phone />} dir="ltr" {...text('phone')} />
                </Field>
                <Field label={t('settings.support.whatsapp')}>
                  <Input icon={<MessageCircle />} dir="ltr" {...text('whatsapp')} />
                </Field>
                <Field label={t('common.email')} required error={invalidEmail ? t('errors.invalidEmail') : undefined} className="sm:col-span-2">
                  <Input icon={<Mail />} dir="ltr" type="email" invalid={invalidEmail} {...text('email')} />
                </Field>
              </div>
            </Section>
            <Section title={t('settings.support.hoursLocation')} icon={<Clock className="h-4 w-4" />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('settings.support.hoursEn')}>
                  <Input dir="ltr" {...text('hours_en')} />
                </Field>
                <Field label={t('settings.support.hoursAr')}>
                  <Input dir="rtl" {...text('hours_ar')} />
                </Field>
                <Field label={t('settings.support.addressEn')}>
                  <Textarea rows={2} dir="ltr" {...text('address_en')} />
                </Field>
                <Field label={t('settings.support.addressAr')}>
                  <Textarea rows={2} dir="rtl" {...text('address_ar')} />
                </Field>
              </div>
            </Section>
            <Section title={t('settings.support.social')} icon={<Share2 className="h-4 w-4" />}>
              <div className="grid gap-4 sm:grid-cols-2">
                {SOCIAL.map((k) => (
                  <Field key={k} label={t(`settings.support.${k}`)}>
                    <Input icon={<Globe />} dir="ltr" placeholder="https://" {...text(k)} />
                  </Field>
                ))}
              </div>
            </Section>
          </div>

          <Section
            title={t('settings.support.preview')}
            subtitle={t('settings.support.previewHint')}
            action={
              <Segmented
                size="sm"
                value={previewLang}
                onChange={setPreviewLang}
                options={[
                  { value: 'en', label: 'EN' },
                  { value: 'ar', label: 'ع' },
                ]}
              />
            }
          >
            <div dir={previewLang === 'ar' ? 'rtl' : 'ltr'} lang={previewLang} className="rounded-2xl border border-line bg-surface-2 p-5" style={{ fontFamily: previewLang === 'ar' ? 'Tajawal, sans-serif' : 'Inter, sans-serif' }}>
              <div className="text-base font-bold text-primary">{previewLang === 'ar' ? 'تواصل معنا' : 'Contact us'}</div>
              <ul className="mt-4 space-y-3 text-sm">
                <li className="flex items-center gap-3"><Phone className="h-4 w-4 text-accent" /><span dir="ltr">{formatPhone(draft.phone)}</span></li>
                <li className="flex items-center gap-3"><MessageCircle className="h-4 w-4 text-success" /><span dir="ltr">{formatPhone(draft.whatsapp)}</span></li>
                <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-info" /><span dir="ltr">{draft.email}</span></li>
                <li className="flex items-start gap-3"><Clock className="mt-0.5 h-4 w-4 text-muted" /><span>{previewLang === 'ar' ? draft.hours_ar : draft.hours_en}</span></li>
                <li className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 text-muted" /><span>{previewLang === 'ar' ? draft.address_ar : draft.address_en}</span></li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {SOCIAL.filter((k) => draft[k]).map((k) => (
                  <span key={k} className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-line">
                    {t(`settings.support.${k}`)}
                  </span>
                ))}
              </div>
            </div>
          </Section>
        </fieldset>
      )}
      {editable && <SaveBar dirty={dirty} onSave={onSave} onReset={reset} saving={save.isPending} />}
    </div>
  );
}
