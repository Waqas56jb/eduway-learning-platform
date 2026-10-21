import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { Package } from '@/types';
import { cn } from '@/utils/cn';
import { useSubjects } from '@/store/core';
import { useLocalize } from '@/hooks/useLocale';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Segmented } from '@/components/ui/Tabs';

export type PackageFormValues = Omit<Package, 'id' | 'subscribers'>;

interface Props {
  formId: string;
  defaultValues: PackageFormValues;
  onSubmit: (v: PackageFormValues) => void;
  disabled?: boolean;
}

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const fromDateInput = (d: string, endOfDay = false) => (d ? new Date(`${d}T${endOfDay ? '23:59:59' : '00:00:00'}+03:00`).toISOString() : null);

export function PackageForm({ formId, defaultValues, onSubmit, disabled }: Props) {
  const { t } = useTranslation();
  const L = useLocalize();
  const subjects = useSubjects((s) => s.items);

  const schema = z
    .object({
      name_en: z.string().trim().min(3, t('packages.errors.name')),
      name_ar: z.string().trim().min(3, t('packages.errors.name')),
      description_en: z.string(),
      description_ar: z.string(),
      subjectIds: z.array(z.string()).min(1, t('packages.errors.subjects')),
      price: z.number({ invalid_type_error: t('packages.errors.price') }).min(0, t('packages.errors.price')),
      currency: z.enum(['IQD', 'USD']),
      taxBehavior: z.enum(['inclusive', 'exclusive', 'exempt']),
      validityType: z.enum(['days', 'months', 'until_date']),
      validityValue: z.number({ invalid_type_error: t('packages.errors.duration') }),
      validUntil: z.string(),
      renewal: z.enum(['manual', 'auto', 'none']),
      accessStart: z.enum(['immediate', 'from_date']),
      accessStartDate: z.string(),
      status: z.enum(['active', 'draft', 'archived']),
      featured: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (v.validityType !== 'until_date' && !(v.validityValue >= 1)) {
        ctx.addIssue({ code: 'custom', path: ['validityValue'], message: t('packages.errors.duration') });
      }
      if (v.validityType === 'until_date' && !v.validUntil) {
        ctx.addIssue({ code: 'custom', path: ['validUntil'], message: t('packages.errors.date') });
      }
      if (v.accessStart === 'from_date' && !v.accessStartDate) {
        ctx.addIssue({ code: 'custom', path: ['accessStartDate'], message: t('packages.errors.date') });
      }
    });
  type Form = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...defaultValues,
      validUntil: toDateInput(defaultValues.validUntil),
      accessStartDate: toDateInput(defaultValues.accessStartDate),
    },
  });

  const validityType = watch('validityType');
  const accessStart = watch('accessStart');
  const currency = watch('currency');

  const submit = (v: Form) =>
    onSubmit({
      ...v,
      validityValue: v.validityType === 'until_date' ? 0 : v.validityValue,
      validUntil: v.validityType === 'until_date' ? fromDateInput(v.validUntil, true) : null,
      accessStartDate: v.accessStart === 'from_date' ? fromDateInput(v.accessStartDate) : null,
    });

  const section = 'space-y-4 border-b border-line pb-6 last:border-0 last:pb-0';
  const heading = 'text-xs font-semibold uppercase tracking-wider text-muted rtl:tracking-normal';

  return (
    <form id={formId} onSubmit={handleSubmit(submit)} noValidate className="space-y-6">
      <fieldset disabled={disabled} className="space-y-6">
        <div className={section}>
          <h3 className={heading}>{t('packages.contents')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.nameEn')} required error={errors.name_en?.message} htmlFor="pk-name-en">
              <Input id="pk-name-en" invalid={!!errors.name_en} {...register('name_en')} />
            </Field>
            <Field label={t('common.nameAr')} required error={errors.name_ar?.message} htmlFor="pk-name-ar">
              <Input id="pk-name-ar" dir="rtl" invalid={!!errors.name_ar} {...register('name_ar')} />
            </Field>
          </div>
          <Field label={t('common.descriptionEn')} htmlFor="pk-desc-en">
            <Textarea id="pk-desc-en" rows={2} {...register('description_en')} />
          </Field>
          <Field label={t('common.descriptionAr')} htmlFor="pk-desc-ar">
            <Textarea id="pk-desc-ar" rows={2} dir="rtl" {...register('description_ar')} />
          </Field>
          <Field label={t('packages.subjectsIncluded')} required error={errors.subjectIds?.message}>
            <Controller
              control={control}
              name="subjectIds"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2" role="group" aria-label={t('packages.subjectsIncluded')}>
                  {subjects.map((s) => {
                    const on = field.value.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => field.onChange(on ? field.value.filter((x) => x !== s.id) : [...field.value, s.id])}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                          on ? 'border-transparent text-white shadow-sm' : 'border-line bg-surface text-ink/70 hover:border-accent/50',
                        )}
                        style={on ? { background: s.color } : undefined}
                      >
                        {on ? <Check className="h-3.5 w-3.5" /> : <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />}
                        {L(s, 'name')}
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </Field>
        </div>

        <div className={section}>
          <h3 className={heading}>{t('packages.pricing')}</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('packages.price')} required error={errors.price?.message} htmlFor="pk-price" className="sm:col-span-2">
              <Input id="pk-price" type="number" min={0} step={currency === 'USD' ? 1 : 1000} suffix={currency} invalid={!!errors.price} {...register('price', { valueAsNumber: true })} />
            </Field>
            <Field label={t('common.currency')} htmlFor="pk-cur">
              <Select id="pk-cur" options={[{ value: 'IQD', label: 'IQD' }, { value: 'USD', label: 'USD' }]} {...register('currency')} />
            </Field>
          </div>
          <Field label={t('packages.taxBehavior')} htmlFor="pk-tax">
            <Select id="pk-tax" options={(['inclusive', 'exclusive', 'exempt'] as const).map((v) => ({ value: v, label: t(`packages.tax.${v}`) }))} {...register('taxBehavior')} />
          </Field>
        </div>

        <div className={section}>
          <h3 className={heading}>{t('packages.rules')}</h3>
          <Field label={t('packages.validityType')}>
            <Controller
              control={control}
              name="validityType"
              render={({ field }) => (
                <Segmented
                  aria-label={t('packages.validityType')}
                  size="sm"
                  value={field.value}
                  onChange={field.onChange}
                  options={(['days', 'months', 'until_date'] as const).map((v) => ({ value: v, label: t(`packages.validityTypes.${v}`) }))}
                  className="flex w-full flex-wrap [&>button]:flex-1"
                />
              )}
            />
          </Field>
          {validityType === 'until_date' ? (
            <Field label={t('packages.validUntil')} required error={errors.validUntil?.message} htmlFor="pk-until">
              <Input id="pk-until" type="date" invalid={!!errors.validUntil} {...register('validUntil')} />
            </Field>
          ) : (
            <Field label={t('packages.validityValue')} required error={errors.validityValue?.message} htmlFor="pk-dur">
              <Input
                id="pk-dur"
                type="number"
                min={1}
                suffix={validityType === 'days' ? t('common.days') : t('common.months')}
                invalid={!!errors.validityValue}
                {...register('validityValue', { valueAsNumber: true })}
              />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('packages.renewal')} htmlFor="pk-ren">
              <Select id="pk-ren" options={(['manual', 'auto', 'none'] as const).map((v) => ({ value: v, label: t(`packages.renewals.${v}`) }))} {...register('renewal')} />
            </Field>
            <Field label={t('packages.accessStart')} htmlFor="pk-acc">
              <Select id="pk-acc" options={(['immediate', 'from_date'] as const).map((v) => ({ value: v, label: t(`packages.accessStarts.${v}`) }))} {...register('accessStart')} />
            </Field>
          </div>
          {accessStart === 'from_date' && (
            <Field label={t('packages.accessStartDate')} required error={errors.accessStartDate?.message} htmlFor="pk-accd">
              <Input id="pk-accd" type="date" invalid={!!errors.accessStartDate} {...register('accessStartDate')} />
            </Field>
          )}
        </div>

        <div className={section}>
          <h3 className={heading}>{t('packages.visibility')}</h3>
          <Field label={t('common.status')} hint={t('packages.statusHint')} htmlFor="pk-status">
            <Select id="pk-status" options={(['active', 'draft', 'archived'] as const).map((v) => ({ value: v, label: t(`status.${v}`) }))} {...register('status')} />
          </Field>
          <Controller
            control={control}
            name="featured"
            render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label={t('packages.featured')} description={t('packages.featuredHint')} disabled={disabled} />}
          />
        </div>
      </fieldset>
    </form>
  );
}
