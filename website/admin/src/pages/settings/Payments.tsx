import { ArrowDown, ArrowUp, CreditCard, Percent, Receipt, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSaveSettings, useSettingsSection, type PaymentGatewayUi, type PaymentSettings } from '@/api/settings';
import { useLocalize } from '@/hooks/useLocale';
import { fmtMoney, fmtPercent } from '@/utils/format';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Field, Input, SkeletonCard, Switch, Textarea } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { ReadOnlyNotice, SaveBar, Section, useCanEditSettings, useDraft } from './_shared';

const EMPTY: PaymentSettings = {
  gateways: [],
  mockGatewayEnabled: false,
  companyName_en: '',
  companyName_ar: '',
  companyAddress_en: '',
  companyAddress_ar: '',
  companyEmail: '',
  taxNote_en: '',
  taxNote_ar: '',
};
const emailOk = (s: string) => !s.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const SAMPLE = 25000;

export default function PaymentsSettings() {
  const { t } = useTranslation();
  const L = useLocalize();
  const q = useSettingsSection('payments');
  const save = useSaveSettings('payments');
  const loading = q.isLoading;
  const value = q.data ?? EMPTY;
  const { draft, set, setDraft, dirty, reset } = useDraft(value);
  const editable = useCanEditSettings();

  const setGateway = (id: PaymentGatewayUi['id'], patch: Partial<PaymentGatewayUi>) =>
    setDraft((d) => ({ ...d, gateways: d.gateways.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const list = [...d.gateways];
      const j = i + dir;
      if (j < 0 || j >= list.length) return d;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...d, gateways: list.map((g, k) => ({ ...g, displayOrder: k + 1 })) };
    });

  const badFee = draft.gateways.some((g) => !(g.feeRatePct >= 0 && g.feeRatePct <= 100));
  const badNames = draft.gateways.some((g) => !g.name_en.trim() || !g.name_ar.trim());
  const badEmail = !emailOk(draft.companyEmail);
  const noneEnabled = draft.gateways.length > 0 && !draft.gateways.some((g) => g.enabled && g.id !== 'mock');

  const onSave = () => {
    if (badFee || badNames || badEmail) return;
    save.mutate(draft);
  };

  return (
    <div>
      <PageHeader title={t('settings.payments.title')} subtitle={t('settings.payments.subtitle')} />
      {!editable && <ReadOnlyNotice />}
      {q.error && !q.data ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} />
      ) : loading ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <SkeletonCard lines={8} className="xl:col-span-2" />
          <SkeletonCard lines={5} />
        </div>
      ) : (
        <fieldset disabled={!editable} className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Section title={t('settings.payments.gateways')} subtitle={t('settings.payments.gatewaysHint')} icon={<Wallet className="h-4 w-4" />}>
              {noneEnabled && <p className="rounded-lg border border-warning/30 bg-warning/[0.07] px-3 py-2 text-xs text-ink/80">{t('settings.payments.noneEnabled')}</p>}
              {Object.values(value.gatewayModes ?? {}).includes('sandbox') && (
                <p className="rounded-lg border border-info/30 bg-info/[0.07] px-3 py-2 text-xs text-ink/80">
                  <span className="font-semibold">{t('settings.payments.sandbox')}</span> — {t('settings.payments.sandboxHint')}
                </p>
              )}
              <ul className="divide-y divide-line rounded-xl border border-line">
                {draft.gateways.map((g, i) => (
                  <li key={g.id} className={cn('grid gap-3 p-4 md:grid-cols-[auto_1fr_1fr_8rem_auto] md:items-end', !g.enabled && 'opacity-80')}>
                    <div className="flex items-center gap-2 md:pb-1.5">
                      <span className="grid h-9 w-9 place-items-center rounded-lg text-[11px] font-bold text-white" style={{ background: g.color || '#0B1F3A' }} aria-hidden>
                        {g.id.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="flex flex-col">
                        <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={!editable || i === 0} aria-label={t('settings.payments.moveUp')}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={!editable || i === draft.gateways.length - 1} aria-label={t('settings.payments.moveDown')}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <Field label={t('settings.payments.nameEn')} error={!g.name_en.trim() ? t('errors.required') : undefined}>
                      <Input dir="ltr" value={g.name_en} onChange={(e) => setGateway(g.id, { name_en: e.target.value })} />
                    </Field>
                    <Field label={t('settings.payments.nameAr')} error={!g.name_ar.trim() ? t('errors.required') : undefined}>
                      <Input dir="rtl" value={g.name_ar} onChange={(e) => setGateway(g.id, { name_ar: e.target.value })} />
                    </Field>
                    <Field label={t('settings.payments.feeRate')} error={!(g.feeRatePct >= 0 && g.feeRatePct <= 100) ? t('settings.payments.feeInvalid') : undefined}>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        dir="ltr"
                        value={g.feeRatePct}
                        onChange={(e) => setGateway(g.id, { feeRatePct: Number(e.target.value) })}
                        suffix={<Percent className="h-3.5 w-3.5" />}
                      />
                    </Field>
                    <div className="flex items-center gap-2 md:pb-2">
                      {g.id === 'mock' && <Badge tone="warning">{t('settings.payments.devOnly')}</Badge>}
                      {value.gatewayModes?.[g.id] === 'sandbox' && (
                        <span title={t('settings.payments.sandboxHint')}>
                          <Badge tone="info" dot>
                            {t('settings.payments.sandbox')}
                          </Badge>
                        </span>
                      )}
                      <Switch checked={g.enabled} onChange={(v) => setGateway(g.id, { enabled: v })} disabled={!editable} aria-label={L(g, 'name')} />
                    </div>
                  </li>
                ))}
                {draft.gateways.length === 0 && <li className="p-4 text-sm text-muted">{t('settings.payments.noGateways')}</li>}
              </ul>
            </Section>

            <Section title={t('settings.payments.receipt')} subtitle={t('settings.payments.receiptHint')} icon={<Receipt className="h-4 w-4" />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('settings.payments.companyNameEn')}>
                  <Input dir="ltr" value={draft.companyName_en} onChange={(e) => set('companyName_en', e.target.value)} />
                </Field>
                <Field label={t('settings.payments.companyNameAr')}>
                  <Input dir="rtl" value={draft.companyName_ar} onChange={(e) => set('companyName_ar', e.target.value)} />
                </Field>
                <Field label={t('settings.payments.companyAddressEn')}>
                  <Textarea dir="ltr" rows={2} value={draft.companyAddress_en} onChange={(e) => set('companyAddress_en', e.target.value)} />
                </Field>
                <Field label={t('settings.payments.companyAddressAr')}>
                  <Textarea dir="rtl" rows={2} value={draft.companyAddress_ar} onChange={(e) => set('companyAddress_ar', e.target.value)} />
                </Field>
                <Field label={t('common.email')} error={badEmail ? t('errors.invalidEmail') : undefined} className="sm:col-span-2">
                  <Input dir="ltr" type="email" invalid={badEmail} value={draft.companyEmail} onChange={(e) => set('companyEmail', e.target.value)} />
                </Field>
                <Field label={t('settings.payments.taxNoteEn')}>
                  <Textarea dir="ltr" rows={2} value={draft.taxNote_en} onChange={(e) => set('taxNote_en', e.target.value)} />
                </Field>
                <Field label={t('settings.payments.taxNoteAr')}>
                  <Textarea dir="rtl" rows={2} value={draft.taxNote_ar} onChange={(e) => set('taxNote_ar', e.target.value)} />
                </Field>
              </div>
            </Section>
          </div>

          <div className="space-y-6">
            <Section title={t('settings.payments.mockGateway')} icon={<CreditCard className="h-4 w-4" />}>
              <Switch checked={draft.mockGatewayEnabled} onChange={(v) => set('mockGatewayEnabled', v)} disabled={!editable} label={t('settings.payments.mockGatewayLabel')} description={t('settings.payments.mockGatewayHint')} />
            </Section>
            <Section title={t('settings.payments.feePreview')} subtitle={t('settings.payments.feePreviewHint', { amount: fmtMoney(SAMPLE) })} icon={<Percent className="h-4 w-4" />}>
              <ul className="space-y-2.5 text-sm">
                {draft.gateways
                  .filter((g) => g.enabled)
                  .map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                        {L(g, 'name')}
                      </span>
                      <span className="text-xs text-muted num">
                        {fmtPercent(g.feeRatePct, 1)} · <span className="font-semibold text-ink">{fmtMoney(Math.round((SAMPLE * g.feeRatePct) / 100))}</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </Section>
          </div>
        </fieldset>
      )}
      {editable && <SaveBar dirty={dirty} onSave={onSave} onReset={reset} saving={save.isPending} />}
    </div>
  );
}
