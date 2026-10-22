import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Calculator, Plus, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { IncentiveTier } from '@/types';
import { qk } from '@/api/keys';
import { calcIncentiveLocal, incentiveApi, type IncentiveRuleVM } from '@/api/partners';
import { useDebounce } from '@/hooks/useMisc';
import { fmtMoney, fmtNumber } from '@/utils/format';
import { uid } from '@/utils/id';
import { cn } from '@/utils/cn';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select } from '@/components/ui';

type TierRow = { tid: string; label: string; from: number; to: string; rewardType: IncentiveTier['rewardType']; amount: number };

const toTiers = (rows: TierRow[]): IncentiveTier[] =>
  rows.map((r) => ({
    id: r.tid,
    label: r.label,
    from: Number(r.from) || 0,
    to: r.to === '' || r.to == null ? null : Number(r.to),
    rewardType: r.rewardType,
    amount: Number(r.amount) || 0,
  }));

/** Returns human-readable problems with a tier list (gaps, overlaps, open-ended in the middle…). */
export function useTierValidator() {
  const { t } = useTranslation();
  return (tiers: IncentiveTier[], threshold: number): string[] => {
    const errs: string[] = [];
    if (!tiers.length) return [t('schools.rules.validation.minOneTier')];
    if (tiers[0].from !== threshold) errs.push(t('schools.rules.validation.firstFrom', { threshold }));
    tiers.forEach((tier, i) => {
      if (tier.to !== null && tier.to < tier.from) errs.push(t('schools.rules.validation.toBeforeFrom', { n: i + 1 }));
      if (tier.to === null && i < tiers.length - 1) errs.push(t('schools.rules.validation.openNotLast'));
      if (i > 0) {
        const prev = tiers[i - 1];
        if (prev.to !== null && tier.from !== prev.to + 1) errs.push(t('schools.rules.validation.gap', { n: i + 1, expected: prev.to + 1 }));
      }
      if (tier.amount <= 0) errs.push(t('schools.rules.validation.amount'));
    });
    return [...new Set(errs)];
  };
}

/** Live "N students → reward" preview for a rule. */
export function IncentiveCalculator({ rule, className }: { rule: Pick<IncentiveRuleVM, 'qualificationThreshold' | 'tiers'>; className?: string }) {
  const { t } = useTranslation();
  const [n, setN] = useState(12);
  const local = calcIncentiveLocal(rule, n);
  // Server calculator (ADM-INC-07) is authoritative; the local mirror renders instantly while it loads.
  const params = useDebounce({ qualificationThreshold: rule.qualificationThreshold, tiers: rule.tiers.map(({ id: _id, ...x }) => x), students: n }, 400);
  const server = useQuery({
    queryKey: qk.incentiveRules.sub('preview', params),
    queryFn: () => incentiveApi.preview(params),
    enabled: params.tiers.length > 0,
    staleTime: 60_000,
    meta: { silentError: true },
    retry: false,
  });
  const sv = server.data;
  const res = sv
    ? { qualified: sv.qualified, amount: sv.amount, tier: sv.tier ? (rule.tiers.find((x) => x.from === sv.tier!.from && x.to === sv.tier!.to) ?? { ...sv.tier }) : null }
    : local;
  return (
    <Card className={className}>
      <CardHeader icon={<Calculator className="h-4 w-4" />} title={t('schools.rules.calculator')} subtitle={t('schools.rules.calculatorSub')} />
      <CardBody className="space-y-4">
        <Field label={t('schools.rules.students')} htmlFor="calc-n">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={40}
              value={Math.min(n, 40)}
              onChange={(e) => setN(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer accent-[#C9A24A]"
              aria-label={t('schools.rules.students')}
            />
            <Input id="calc-n" type="number" min={0} value={n} onChange={(e) => setN(Math.max(0, Number(e.target.value) || 0))} className="w-24 text-center" />
          </div>
        </Field>
        <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-4">
          <div className="text-xs text-muted">{t('schools.rules.computed')}</div>
          <div className="kpi-num mt-1 text-3xl text-primary">{fmtMoney(res.amount)}</div>
          <div className="mt-2 text-xs text-muted">
            {!res.qualified
              ? t('schools.rules.notQualified')
              : !res.tier
                ? t('schools.rules.noTier')
                : res.tier.rewardType === 'per_student'
                  ? t('schools.rules.breakdown', { students: fmtNumber(n), rate: fmtMoney(res.tier.amount) })
                  : t('schools.rules.fixedBreakdown')}
          </div>
        </div>
        <ul className="space-y-1.5">
          {rule.tiers.map((tier) => {
            const on = res.tier?.id === tier.id;
            return (
              <li
                key={tier.id}
                className={cn('flex items-center justify-between rounded-lg px-3 py-2 text-sm transition', on ? 'bg-primary/[0.06] ring-1 ring-accent/50' : 'text-muted')}
              >
                <span className="flex items-center gap-2">
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  <span className={cn(on && 'font-semibold text-ink')}>{tier.label || '—'}</span>
                  <span className="text-xs num" dir="ltr">
                    {tier.from}–{tier.to ?? '∞'}
                  </span>
                </span>
                <span className={cn('num', on && 'font-semibold text-ink')}>
                  {fmtMoney(tier.amount)}
                  {tier.rewardType === 'per_student' && <span className="text-xs text-muted"> / {t('common.student')}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

interface IncentiveRuleFormProps {
  rule: IncentiveRuleVM;
  readOnly?: boolean;
  /** Persist the draft; resolve `false` when saving failed (form stays dirty). */
  onSave: (patch: Partial<IncentiveRuleVM>) => Promise<boolean | void>;
  /** Extra footer actions (activate / delete draft). */
  actions?: React.ReactNode;
}

/** Editor for one incentive rule version, with a live preview calculator. */
export function IncentiveRuleForm({ rule, readOnly, onSave, actions }: IncentiveRuleFormProps) {
  const { t } = useTranslation();
  const validateTiers = useTierValidator();
  const req = t('errors.required');
  const schema = z.object({
    name_en: z.string().trim().min(3, req),
    name_ar: z.string().trim().min(3, req),
    partnerType: z.enum(['school', 'marketer']),
    qualificationThreshold: z.number({ invalid_type_error: req }).int().min(0),
    period: z.enum(['monthly', 'quarterly', 'semester', 'yearly']),
    effectiveFrom: z.string().min(1, req),
    effectiveTo: z.string(),
    tiers: z.array(
      z.object({
        tid: z.string(),
        label: z.string(),
        from: z.number({ invalid_type_error: req }).int().min(0),
        to: z.string(),
        rewardType: z.enum(['per_student', 'fixed']),
        amount: z.number({ invalid_type_error: req }).min(0),
      }),
    ),
  });
  type FormValues = z.infer<typeof schema>;

  const defaults = (): FormValues => ({
    name_en: rule.name_en,
    name_ar: rule.name_ar,
    partnerType: rule.partnerType,
    qualificationThreshold: rule.qualificationThreshold,
    period: rule.period,
    effectiveFrom: rule.effectiveFrom.slice(0, 10),
    effectiveTo: rule.effectiveTo?.slice(0, 10) ?? '',
    tiers: rule.tiers.map((x) => ({ tid: x.id, label: x.label, from: x.from, to: x.to === null ? '' : String(x.to), rewardType: x.rewardType, amount: x.amount })),
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults() });
  const { fields, append, remove } = useFieldArray({ control, name: 'tiers' });

  useEffect(() => {
    reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule.id, rule.status]);

  const watched = watch();
  const liveTiers = useMemo(() => toTiers(watched.tiers ?? []), [watched.tiers]);
  const threshold = Number(watched.qualificationThreshold) || 0;
  const tierErrors = validateTiers(liveTiers, threshold);
  const [showTierErrors, setShowTierErrors] = useState(false);

  const onSubmit = async (v: FormValues) => {
    setShowTierErrors(true);
    const tiers = toTiers(v.tiers);
    if (validateTiers(tiers, v.qualificationThreshold).length) return;
    const ok = await onSave({
      name_en: v.name_en,
      name_ar: v.name_ar,
      partnerType: v.partnerType,
      qualificationThreshold: v.qualificationThreshold,
      period: v.period,
      effectiveFrom: new Date(v.effectiveFrom).toISOString(),
      effectiveTo: v.effectiveTo ? new Date(v.effectiveTo).toISOString() : null,
      tiers,
    });
    if (ok !== false) reset(v);
  };


  const lastTo = liveTiers.length ? liveTiers[liveTiers.length - 1].to : null;

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="card overflow-hidden">
        <fieldset disabled={readOnly} className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('schools.rules.nameEn')} error={errors.name_en?.message} required htmlFor="ir-en">
              <Input id="ir-en" invalid={!!errors.name_en} {...register('name_en')} />
            </Field>
            <Field label={t('schools.rules.nameAr')} error={errors.name_ar?.message} required htmlFor="ir-ar">
              <Input id="ir-ar" dir="rtl" invalid={!!errors.name_ar} {...register('name_ar')} />
            </Field>
            <Field label={t('schools.rules.partnerType')} htmlFor="ir-pt">
              <Select
                id="ir-pt"
                disabled
                options={[
                  { value: 'school', label: t('schools.rules.partnerSchool') },
                  { value: 'marketer', label: t('schools.rules.partnerMarketer') },
                ]}
                {...register('partnerType')}
              />
            </Field>
            <Field label={t('schools.rules.threshold')} hint={t('schools.rules.thresholdHint')} error={errors.qualificationThreshold?.message} htmlFor="ir-th">
              <Input id="ir-th" type="number" min={0} invalid={!!errors.qualificationThreshold} {...register('qualificationThreshold', { valueAsNumber: true })} />
            </Field>
            <Field label={t('schools.rules.period')} htmlFor="ir-period">
              <Select
                id="ir-period"
                options={(['monthly', 'quarterly', 'semester', 'yearly'] as const).map((p) => ({ value: p, label: t(`schools.rules.periods.${p}`) }))}
                {...register('period')}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('schools.rules.effectiveFrom')} error={errors.effectiveFrom?.message} htmlFor="ir-ef">
                <Input id="ir-ef" type="date" {...register('effectiveFrom')} />
              </Field>
              <Field label={t('schools.rules.effectiveTo')} hint={t('schools.rules.openEnded')} htmlFor="ir-et">
                <Input id="ir-et" type="date" {...register('effectiveTo')} />
              </Field>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="section-title">{t('schools.rules.tiers')}</h4>
              {!readOnly && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => {
                    const from = lastTo !== null ? lastTo + 1 : (liveTiers.at(-1)?.from ?? threshold) + 1;
                    append({ tid: uid('tier'), label: '', from, to: '', rewardType: 'per_student', amount: 0 });
                  }}
                >
                  {t('schools.rules.addTier')}
                </Button>
              )}
            </div>
            <div className="scrollbar-thin overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 text-start">{t('schools.rules.tierLabel')}</th>
                    <th className="w-24 px-3 py-2 text-start">{t('schools.rules.from')}</th>
                    <th className="w-24 px-3 py-2 text-start">{t('schools.rules.to')}</th>
                    <th className="w-40 px-3 py-2 text-start">{t('schools.rules.rewardType')}</th>
                    <th className="w-36 px-3 py-2 text-start">{t('schools.rules.reward')}</th>
                    {!readOnly && <th className="w-10" />}
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f, i) => (
                    <tr key={f.id} className="border-t border-line">
                      <td className="px-3 py-2">
                        <Input aria-label={t('schools.rules.tierLabel')} className="h-9" {...register(`tiers.${i}.label`)} />
                      </td>
                      <td className="px-3 py-2">
                        <Input aria-label={t('schools.rules.from')} type="number" min={0} className="h-9" {...register(`tiers.${i}.from`, { valueAsNumber: true })} />
                      </td>
                      <td className="px-3 py-2">
                        <Input aria-label={t('schools.rules.to')} type="number" min={0} placeholder={t('schools.rules.toPlaceholder')} className="h-9" {...register(`tiers.${i}.to`)} />
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          aria-label={t('schools.rules.rewardType')}
                          className="[&_select]:h-9"
                          options={[
                            { value: 'per_student', label: t('schools.rules.perStudent') },
                            { value: 'fixed', label: t('schools.rules.fixed') },
                          ]}
                          {...register(`tiers.${i}.rewardType`)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input aria-label={t('schools.rules.reward')} type="number" min={0} step={500} suffix="IQD" className="[&_input]:h-9" {...register(`tiers.${i}.amount`, { valueAsNumber: true })} />
                      </td>
                      {!readOnly && (
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => remove(i)}
                            disabled={fields.length <= 1}
                            className="rounded-md p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                            aria-label={t('schools.rules.removeTier')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(showTierErrors || isDirty) && tierErrors.length > 0 && (
              <ul role="alert" className="mt-2 space-y-1 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
                {tierErrors.map((e) => (
                  <li key={e} className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {e}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2 px-5 py-3">
          <div className="text-xs text-muted">
            {readOnly ? t('schools.rules.readOnlyHint') : isDirty ? <Badge tone="warning">{t('common.unsavedChanges')}</Badge> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {!readOnly && (
              <Button type="submit" variant="secondary" loading={isSubmitting} disabled={!isDirty}>
                {t('actions.saveDraft')}
              </Button>
            )}
          </div>
        </div>
      </form>
      <IncentiveCalculator rule={{ qualificationThreshold: threshold, tiers: liveTiers }} className="self-start" />
    </div>
  );
}
