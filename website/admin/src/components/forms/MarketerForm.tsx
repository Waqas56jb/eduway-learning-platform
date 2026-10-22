import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { isApiError, toastError } from '@/api/client';
import { useLookups } from '@/api/lookups';
import { marketersApi, partnerKeys, type MarketerVM, type MarketerWriteDto } from '@/api/partners';
import { useLocalize } from '@/hooks/useLocale';
import { Button, Drawer, Field, Input, PhoneInput, Select } from '@/components/ui';
import { isValidPhone, toE164 } from '@/utils/phone';

interface MarketerFormProps {
  open: boolean;
  onClose: () => void;
  marketer?: MarketerVM | null;
}

/** Create / edit marketer drawer. */
export function MarketerForm({ open, onClose, marketer }: MarketerFormProps) {
  const { t } = useTranslation();
  const L = useLocalize();
  const lookups = useLookups();
  const qc = useQueryClient();

  const req = t('errors.required');
  const schema = z.object({
    name_en: z.string().trim().min(3, req),
    name_ar: z.string().trim().min(3, req),
    mobile: z.string().trim().refine((m) => isValidPhone(m), t('marketers.mobileFormat')),
    email: z.string().trim().email(t('errors.invalidEmail')),
    governorateId: z.string().min(1, req),
    status: z.enum(['active', 'inactive']),
    code: z
      .string()
      .trim()
      .refine((c) => !c || /^[A-Za-z0-9-]{4,20}$/.test(c), t('marketers.codeFormat')),
  });
  type FormValues = z.infer<typeof schema>;

  const defaults = (): FormValues => ({
    name_en: marketer?.name_en ?? '',
    name_ar: marketer?.name_ar ?? '',
    mobile: marketer?.mobile ?? '',
    email: marketer?.email ?? '',
    governorateId: marketer?.governorateId ?? 'baghdad',
    status: marketer?.status ?? 'active',
    code: marketer?.code ?? '',
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults() });

  useEffect(() => {
    if (open) reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, marketer?.id]);

  const onSubmit = async (v: FormValues) => {
    const body: MarketerWriteDto = {
      name: { en: v.name_en, ar: v.name_ar },
      mobile: toE164(v.mobile) ?? v.mobile,
      email: v.email,
      governorateId: v.governorateId,
      status: v.status,
      code: v.code ? v.code.toUpperCase() : null,
    };
    try {
      if (marketer) {
        await marketersApi.update(marketer.id, body);
        toast.success(t('toast.updated', { entity: t('marketers.entity') }));
      } else {
        await marketersApi.create(body);
        toast.success(t('toast.created', { entity: t('marketers.entity') }));
      }
      await Promise.all(partnerKeys.map((k) => qc.invalidateQueries({ queryKey: k })));
      onClose();
    } catch (e) {
      if (isApiError(e) && e.code === 'CONFLICT') {
        setError('code', { message: t('marketers.codeTaken') });
        return;
      }
      if (isApiError(e) && Object.keys(e.fields).length) {
        for (const [k, msg] of Object.entries(e.fields)) setError(k.replace(/^name\.(en|ar)$/, 'name_$1') as keyof FormValues, { message: msg });
        return;
      }
      toastError(e);
    }
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
        <Field label={t('marketers.fields.mobile')} hint={t('phone.hint')} error={errors.mobile?.message} required htmlFor="mf-mob">
          <Controller
            control={control}
            name="mobile"
            render={({ field }) => <PhoneInput id="mf-mob" name={field.name} ref={field.ref} value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.mobile} />}
          />
        </Field>
        <Field label={t('marketers.fields.email')} error={errors.email?.message} required htmlFor="mf-email">
          <Input id="mf-email" type="email" dir="ltr" placeholder="name@partners.eduway.iq" invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label={t('marketers.fields.code')} hint={t('marketers.codeHint')} error={errors.code?.message} htmlFor="mf-code">
          <Input id="mf-code" dir="ltr" className="uppercase" invalid={!!errors.code} {...register('code')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('marketers.fields.governorate')} htmlFor="mf-gov">
            <Select id="mf-gov" options={lookups.governorates.map((g) => ({ value: g.id, label: L(g, 'name') }))} {...register('governorateId')} />
          </Field>
          <Field label={t('common.status')} htmlFor="mf-status">
            <Select id="mf-status" options={(['active', 'inactive'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} {...register('status')} />
          </Field>
        </div>
      </form>
    </Drawer>
  );
}
