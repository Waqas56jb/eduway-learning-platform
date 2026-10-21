import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Marketer } from '@/types';
import { governorates } from '@/data';
import { useMarketers } from '@/store/core';
import { useLocalize } from '@/hooks/useLocale';
import { uid } from '@/utils/id';
import { Button, Drawer, Field, Input, Select } from '@/components/ui';

interface MarketerFormProps {
  open: boolean;
  onClose: () => void;
  marketer?: Marketer | null;
}

/** Create / edit marketer drawer. */
export function MarketerForm({ open, onClose, marketer }: MarketerFormProps) {
  const { t } = useTranslation();
  const L = useLocalize();
  const add = useMarketers((s) => s.add);
  const update = useMarketers((s) => s.update);

  const req = t('errors.required');
  const schema = z.object({
    name_en: z.string().trim().min(3, req),
    name_ar: z.string().trim().min(3, req),
    mobile: z.string().trim().regex(/^\+?964[\s]?7\d{2}[\s]?\d{3}[\s]?\d{4}$/, t('marketers.mobileFormat')),
    email: z.string().trim().email(t('errors.invalidEmail')),
    governorateId: z.string().min(1, req),
    status: z.enum(['active', 'inactive']),
  });
  type FormValues = z.infer<typeof schema>;

  const defaults = (): FormValues => ({
    name_en: marketer?.name_en ?? '',
    name_ar: marketer?.name_ar ?? '',
    mobile: marketer?.mobile ?? '',
    email: marketer?.email ?? '',
    governorateId: marketer?.governorateId ?? 'gov_bgd',
    status: marketer?.status ?? 'active',
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults() });

  useEffect(() => {
    if (open) reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, marketer?.id]);

  const onSubmit = async (v: FormValues) => {
    await new Promise((r) => setTimeout(r, 300));
    if (marketer) {
      update(marketer.id, v);
      toast.success(t('toast.updated', { entity: t('marketers.entity') }));
    } else {
      add({
        id: uid('mkt'),
        ...v,
        avatar: '',
        schoolIds: [],
        paidStudents: 0,
        milestonesHit: 0,
        pendingReward: 0,
        joinedAt: new Date().toISOString(),
      });
      toast.success(t('toast.created', { entity: t('marketers.entity') }));
    }
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={marketer ? t('marketers.edit') : t('marketers.add')}
      description={marketer ? L(marketer, 'name') : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" form="marketer-form" loading={isSubmitting}>
            {marketer ? t('actions.saveChanges') : t('actions.create')}
          </Button>
        </>
      }
    >
      <form id="marketer-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label={t('marketers.fields.nameEn')} error={errors.name_en?.message} required htmlFor="mf-en">
          <Input id="mf-en" invalid={!!errors.name_en} {...register('name_en')} />
        </Field>
        <Field label={t('marketers.fields.nameAr')} error={errors.name_ar?.message} required htmlFor="mf-ar">
          <Input id="mf-ar" dir="rtl" invalid={!!errors.name_ar} {...register('name_ar')} />
        </Field>
        <Field label={t('marketers.fields.mobile')} error={errors.mobile?.message} required htmlFor="mf-mob">
          <Input id="mf-mob" dir="ltr" inputMode="tel" placeholder="+964 770 123 4567" invalid={!!errors.mobile} {...register('mobile')} />
        </Field>
        <Field label={t('marketers.fields.email')} error={errors.email?.message} required htmlFor="mf-email">
          <Input id="mf-email" type="email" dir="ltr" placeholder="name@partners.eduway.iq" invalid={!!errors.email} {...register('email')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('marketers.fields.governorate')} htmlFor="mf-gov">
            <Select id="mf-gov" options={governorates.map((g) => ({ value: g.id, label: L(g, 'name') }))} {...register('governorateId')} />
          </Field>
          <Field label={t('common.status')} htmlFor="mf-status">
            <Select id="mf-status" options={(['active', 'inactive'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} {...register('status')} />
          </Field>
        </div>
      </form>
    </Drawer>
  );
}
