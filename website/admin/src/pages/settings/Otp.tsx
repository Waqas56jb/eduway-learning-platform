import { useState } from 'react';
import { KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOtpSettings } from '@/store/settings';
import { useMockLoading } from '@/hooks/useMockLoading';
import { fmtNumber } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Field, Input, Segmented, Select, SkeletonCard } from '@/components/ui';
import type { OtpSettings } from '@/data/settings';
import { mockSave, ReadOnlyNotice, SaveBar, Section, useCanEditSettings, useDraft } from './_shared';

const PROVIDERS: OtpSettings['provider'][] = ['korek', 'twilio', 'whatsapp'];

export default function Otp() {
  const { t } = useTranslation();
  const loading = useMockLoading();
  const value = useOtpSettings((s) => s.value);
  const save = useOtpSettings((s) => s.save);
  const { draft, set, dirty, reset } = useDraft(value);
  const editable = useCanEditSettings();
  const [saving, setSaving] = useState(false);

  const num = (key: keyof OtpSettings, min: number, max: number) => ({
    type: 'number' as const,
    min,
    max,
    value: draft[key] as number,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, (Number(e.target.value) || 0) as never),
    onBlur: () => set(key, Math.max(min, Math.min(max, (draft[key] as number) || min)) as never),
  });

  const onSave = async () => {
    setSaving(true);
    await mockSave(() => save(draft), t);
    setSaving(false);
  };

  const sample = '4829130'.slice(0, draft.codeLength);

  return (
    <div>
      <PageHeader title={t('settings.otp.title')} subtitle={t('settings.otp.subtitle')} />
      {!editable && <ReadOnlyNotice />}
      {loading ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <SkeletonCard lines={6} className="xl:col-span-2" />
          <SkeletonCard lines={4} />
        </div>
      ) : (
        <fieldset disabled={!editable} className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Section title={t('settings.otp.codeSection')} icon={<KeyRound className="h-4 w-4" />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('settings.otp.codeLength')}>
                  <Segmented
                    value={String(draft.codeLength) as '4' | '6'}
                    onChange={(v) => set('codeLength', Number(v) as 4 | 6)}
                    options={[
                      { value: '4', label: t('settings.otp.digits', { count: 4 }) },
                      { value: '6', label: t('settings.otp.digits', { count: 6 }) },
                    ]}
                  />
                </Field>
                <Field label={t('settings.otp.expiry')} hint={t('settings.otp.expiryHint')}>
                  <Input {...num('expirySeconds', 30, 900)} suffix={t('common.seconds')} />
                </Field>
                <Field label={t('settings.otp.resendLimit')} hint={t('settings.otp.resendLimitHint')}>
                  <Input {...num('resendLimit', 1, 10)} />
                </Field>
                <Field label={t('settings.otp.resendCooldown')}>
                  <Input {...num('resendCooldownSeconds', 15, 600)} suffix={t('common.seconds')} />
                </Field>
              </div>
            </Section>
            <Section title={t('settings.otp.securitySection')} icon={<ShieldCheck className="h-4 w-4" />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('settings.otp.maxAttempts')} hint={t('settings.otp.maxAttemptsHint')}>
                  <Input {...num('maxAttempts', 1, 20)} />
                </Field>
                <Field label={t('settings.otp.lockout')} hint={t('settings.otp.lockoutHint')}>
                  <Input {...num('lockoutMinutes', 1, 1440)} suffix={t('common.minutes')} />
                </Field>
              </div>
            </Section>
            <Section title={t('settings.otp.providerSection')} icon={<Smartphone className="h-4 w-4" />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('settings.otp.provider')}>
                  <Select
                    value={draft.provider}
                    onChange={(e) => set('provider', e.target.value as OtpSettings['provider'])}
                    options={PROVIDERS.map((p) => ({ value: p, label: t(`settings.otp.providers.${p}`) }))}
                  />
                </Field>
                <Field label={t('settings.otp.fallback')} hint={t('settings.otp.fallbackHint')}>
                  <Select
                    value={draft.fallbackProvider}
                    onChange={(e) => set('fallbackProvider', e.target.value as OtpSettings['fallbackProvider'])}
                    options={(['none', ...PROVIDERS] as OtpSettings['fallbackProvider'][])
                      .filter((p) => p !== draft.provider)
                      .map((p) => ({ value: p, label: t(`settings.otp.providers.${p}`) }))}
                  />
                </Field>
              </div>
            </Section>
          </div>

          <Section title={t('settings.otp.policyPreview')} icon={<ShieldCheck className="h-4 w-4" />}>
            <div className="rounded-2xl bg-[#0B1F3A] p-5 text-center text-white">
              <div className="text-[11px] uppercase tracking-widest text-white/50 rtl:tracking-normal">{t('settings.otp.sampleCode')}</div>
              <div className="mt-3 flex justify-center gap-1.5" dir="ltr">
                {sample.split('').map((d, i) => (
                  <span key={i} className="grid h-11 w-9 place-items-center rounded-lg bg-white/10 text-lg font-bold text-accent-light num">
                    {d}
                  </span>
                ))}
              </div>
              <div className="mt-3 text-xs text-white/60">{t('settings.otp.expiresIn', { seconds: fmtNumber(draft.expirySeconds) })}</div>
            </div>
            <ul className="space-y-2.5 text-sm">
              <li className="flex justify-between gap-3">
                <span className="text-muted">{t('settings.otp.provider')}</span>
                <Badge tone="navy">{t(`settings.otp.providers.${draft.provider}`)}</Badge>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted">{t('settings.otp.fallback')}</span>
                <Badge>{t(`settings.otp.providers.${draft.fallbackProvider}`)}</Badge>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted">{t('settings.otp.maxAttempts')}</span>
                <span className="font-semibold num">{draft.maxAttempts}</span>
              </li>
            </ul>
            <p className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-muted">
              {t('settings.otp.policySentence', {
                attempts: draft.maxAttempts,
                lockout: draft.lockoutMinutes,
                resends: draft.resendLimit,
                cooldown: draft.resendCooldownSeconds,
              })}
            </p>
          </Section>
        </fieldset>
      )}
      {editable && <SaveBar dirty={dirty} onSave={onSave} onReset={reset} saving={saving} />}
    </div>
  );
}
