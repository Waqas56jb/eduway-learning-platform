import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import type { School } from '@/types';
import { isApiError, toastError } from '@/api/client';
import { useLookups } from '@/api/lookups';
import { partnerKeys, schoolsApi, type SchoolWriteDto } from '@/api/partners';
import { useLocalize } from '@/hooks/useLocale';
import { useAttributionGuard } from '@/pages/marketers/attribution';
import { Button, Drawer, Field, Input, Select } from '@/components/ui';

interface SchoolFormProps {
  open: boolean;
  onClose: () => void;
  /** Existing school to edit; omit to create. */
  school?: School | null;
}

const toDateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

/** Create / edit school drawer. */
export function SchoolForm({ open, onClose, school }: SchoolFormProps) {
  const { t } = useTranslation();
  const L = useLocalize();
  const lookups = useLookups();
  const marketers = lookups.marketers;
  const qc = useQueryClient();
  const guard = useAttributionGuard();

  const req = t('errors.required');
  const schema = z
    .object({
      name_en: z.string().trim().min(3, req),
      name_ar: z.string().trim().min(3, req),
      code: z
        .string()
        .trim()
        .regex(/^[A-Z0-9-]{4,16}$/, t('schools.codeFormat')),
      city_en: z.string().trim().min(2, req),
      city_ar: z.string().trim().min(2, req),
      governorateId: z.string().min(1, req),
      contactName: z.string().trim().min(3, req),
      contactMobile: z.string().trim().regex(/^\+?[\d\s]{10,16}$/, t('marketers.mobileFormat')),
      marketerId: z.string(),
      contractStart: z.string().min(1, req),
      contractEnd: z.string().min(1, req),
      status: z.enum(['active', 'pending', 'suspended']),
    })
    .refine((v) => !v.contractStart || !v.contractEnd || v.contractEnd > v.contractStart, {
      path: ['contractEnd'],
      message: t('schools.contractEndBeforeStart'),
    });
  type FormValues = z.infer<typeof schema>;

  const defaults = (): FormValues => ({
    name_en: school?.name_en ?? '',
    name_ar: school?.name_ar ?? '',
    code: school?.code ?? '',
    city_en: school?.city_en ?? '',
    city_ar: school?.city_ar ?? '',
    governorateId: school?.governorateId ?? 'baghdad',
    contactName: school?.contactName ?? '',
    contactMobile: school?.contactMobile ?? '',
    marketerId: school?.marketerId ?? '',
    contractStart: toDateInput(school?.contractStart) || new Date().toISOString().slice(0, 10),
    contractEnd: toDateInput(school?.contractEnd),
    status: school?.status ?? 'pending',
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults() });

  useEffect(() => {
    if (open) reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, school?.id]);

  const onSubmit = async (v: FormValues) => {
    const body: SchoolWriteDto = {
      name: { en: v.name_en, ar: v.name_ar },
      code: v.code,
      city: { en: v.city_en, ar: v.city_ar },
      governorateId: v.governorateId,
      contactName: v.contactName,
      contactMobile: v.contactMobile,
      contractStart: new Date(v.contractStart).toISOString(),
      contractEnd: new Date(v.contractEnd).toISOString(),
      status: v.status,
    };
    const target = v.marketerId || null;
    try {
      if (school) {
        // marketerId is not writable via PATCH (contract §34.1 #23) — attribution goes through the guarded endpoint.
        await schoolsApi.update(school.id, body);
        if (target !== school.marketerId) {
          const cur = marketers.find((m) => m.id === school.marketerId);
          const res = await guard({
            schoolName: L(school, 'name'),
            currentMarketerName: cur ? L(cur, 'name') : null,
            needsReason: !!school.marketerId && !!target,
            run: (overrideReason) => schoolsApi.setMarketer(school.id, { marketerId: target, overrideReason }),
          });
          if (res?.overridden) toast.success(t('marketers.detail.overridden'));
        }
        toast.success(t('toast.updated', { entity: t('schools.entity') }));
      } else {
        await schoolsApi.create({ ...body, marketerId: target });
        toast.success(t('toast.created', { entity: t('schools.entity') }));
      }
      await Promise.all(partnerKeys.map((k) => qc.invalidateQueries({ queryKey: k })));
      onClose();
    } catch (e) {
      if (isApiError(e) && e.code === 'CONFLICT') {
        setError('code', { message: t('schools.codeTaken') });
        return;
      }
      if (isApiError(e) && Object.keys(e.fields).length) {
        for (const [k, msg] of Object.entries(e.fields)) {
          setError(k.replace(/^(name|city)\.(en|ar)$/, '$1_$2') as keyof FormValues, { message: msg });
        }
        return;
      }
      toastError(e);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={school ? t('schools.edit') : t('schools.add')}
      description={school ? L(school, 'name') : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" form="school-form" loading={isSubmitting}>
            {school ? t('actions.saveChanges') : t('actions.create')}
          </Button>
        </>
      }
    >
      <form id="school-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('schools.fields.nameEn')} error={errors.name_en?.message} required htmlFor="sf-name-en">
            <Input id="sf-name-en" invalid={!!errors.name_en} {...register('name_en')} />
          </Field>
          <Field label={t('schools.fields.nameAr')} error={errors.name_ar?.message} required htmlFor="sf-name-ar">
            <Input id="sf-name-ar" dir="rtl" invalid={!!errors.name_ar} {...register('name_ar')} />
          </Field>
          <Field label={t('schools.fields.code')} error={errors.code?.message} required htmlFor="sf-code" hint="SCH-BAG107">
            <Input id="sf-code" dir="ltr" className="uppercase" invalid={!!errors.code} {...register('code', { setValueAs: (v: string) => v.toUpperCase() })} />
          </Field>
          <Field label={t('common.status')} htmlFor="sf-status">
            <Select
              id="sf-status"
              options={(['active', 'pending', 'suspended'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))}
              {...register('status')}
            />
          </Field>
          <Field label={t('schools.fields.cityEn')} error={errors.city_en?.message} required htmlFor="sf-city-en">
            <Input id="sf-city-en" invalid={!!errors.city_en} {...register('city_en')} />
          </Field>
          <Field label={t('schools.fields.cityAr')} error={errors.city_ar?.message} required htmlFor="sf-city-ar">
            <Input id="sf-city-ar" dir="rtl" invalid={!!errors.city_ar} {...register('city_ar')} />
          </Field>
          <Field label={t('common.governorate')} error={errors.governorateId?.message} required htmlFor="sf-gov">
            <Select id="sf-gov" options={lookups.governorates.map((g) => ({ value: g.id, label: L(g, 'name') }))} {...register('governorateId')} />
          </Field>
          <Field label={t('schools.fields.marketer')} htmlFor="sf-mkt">
            <Select
              id="sf-mkt"
              placeholder={t('schools.unassigned')}
              options={marketers.filter((m) => m.status === 'active' || m.id === school?.marketerId).map((m) => ({ value: m.id, label: L(m, 'name') }))}
              {...register('marketerId')}
            />
          </Field>
          <Field label={t('schools.fields.contactName')} error={errors.contactName?.message} required htmlFor="sf-cn">
            <Input id="sf-cn" invalid={!!errors.contactName} {...register('contactName')} />
          </Field>
          <Field label={t('schools.fields.contactMobile')} error={errors.contactMobile?.message} required htmlFor="sf-cm">
            <Input id="sf-cm" dir="ltr" inputMode="tel" placeholder="+964 770 123 4567" invalid={!!errors.contactMobile} {...register('contactMobile')} />
          </Field>
          <Field label={t('schools.fields.contractStart')} error={errors.contractStart?.message} required htmlFor="sf-cs">
            <Input id="sf-cs" type="date" invalid={!!errors.contractStart} {...register('contractStart')} />
          </Field>
          <Field label={t('schools.fields.contractEnd')} error={errors.contractEnd?.message} required htmlFor="sf-ce">
            <Input id="sf-ce" type="date" invalid={!!errors.contractEnd} {...register('contractEnd')} />
          </Field>
        </div>
      </form>
    </Drawer>
  );
}
