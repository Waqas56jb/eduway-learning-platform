import { KeyRound, ShieldCheck, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSaveSettings, useSettingsSection, type SecuritySettings } from '@/api/settings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Field, Input, SkeletonCard, Switch, useConfirm } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { ReadOnlyNotice, SaveBar, Section, useCanEditSettings, useDraft } from './_shared';

const EMPTY: SecuritySettings = { adminMfaMandatory: false, adminSessionHours: 12, passwordMinLength: 10 };

export default function SecuritySettingsPage() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const q = useSettingsSection('security');
  const save = useSaveSettings('security');
  const loading = q.isLoading;
  const value = q.data ?? EMPTY;
  const { draft, set, dirty, reset } = useDraft(value);
  const editable = useCanEditSettings();

  const badHours = !(draft.adminSessionHours >= 1 && draft.adminSessionHours <= 720);
  const badLength = !(draft.passwordMinLength >= 8 && draft.passwordMinLength <= 128);

  const onSave = async () => {
    if (badHours || badLength) return;
    if (draft.adminMfaMandatory && !value.adminMfaMandatory) {
      const ok = await confirm({ title: t('settings.security.mfaConfirmTitle'), body: t('settings.security.mfaConfirmBody'), tone: 'warning', confirmText: t('settings.security.mfaConfirm') });
      if (!ok) return;
    }
    if (!draft.adminMfaMandatory && value.adminMfaMandatory) {
      const ok = await confirm({ title: t('settings.security.mfaOffTitle'), body: t('settings.security.mfaOffBody'), tone: 'danger', confirmText: t('actions.disable'), typeToConfirm: 'MFA' });
      if (!ok) return;
    }
    save.mutate(draft);
  };

  return (
    <div>
      <PageHeader
        title={t('settings.security.title')}
        subtitle={t('settings.security.subtitle')}
        meta={value.adminMfaMandatory ? <Badge tone="success" dot>{t('settings.security.mfaOn')}</Badge> : <Badge tone="warning" dot>{t('settings.security.mfaOptional')}</Badge>}
      />
      {!editable && <ReadOnlyNotice />}
      {q.error && !q.data ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} />
      ) : loading ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      ) : (
        <fieldset disabled={!editable} className="grid gap-6 xl:grid-cols-2">
          <Section title={t('settings.security.mfa')} subtitle={t('settings.security.mfaHint')} icon={<ShieldCheck className="h-4 w-4" />}>
            <Switch checked={draft.adminMfaMandatory} onChange={(v) => set('adminMfaMandatory', v)} disabled={!editable} label={t('settings.security.mfaMandatory')} description={t('settings.security.mfaMandatoryHint')} />
          </Section>
          <Section title={t('settings.security.sessions')} subtitle={t('settings.security.sessionsHint')} icon={<Timer className="h-4 w-4" />}>
            <Field label={t('settings.security.sessionHours')} error={badHours ? t('settings.security.sessionHoursInvalid') : undefined} className="max-w-xs">
              <Input type="number" min={1} max={720} dir="ltr" value={draft.adminSessionHours} invalid={badHours} onChange={(e) => set('adminSessionHours', Math.round(Number(e.target.value) || 0))} suffix={t('settings.security.hours')} />
            </Field>
          </Section>
          <Section title={t('settings.security.passwords')} subtitle={t('settings.security.passwordsHint')} icon={<KeyRound className="h-4 w-4" />}>
            <Field label={t('settings.security.passwordMinLength')} error={badLength ? t('settings.security.passwordMinInvalid') : undefined} className="max-w-xs">
              <Input type="number" min={8} max={128} dir="ltr" value={draft.passwordMinLength} invalid={badLength} onChange={(e) => set('passwordMinLength', Math.round(Number(e.target.value) || 0))} />
            </Field>
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{t('settings.security.passwordPolicy', { count: draft.passwordMinLength })}</p>
          </Section>
        </fieldset>
      )}
      {editable && <SaveBar dirty={dirty} onSave={onSave} onReset={reset} saving={save.isPending} />}
    </div>
  );
}
