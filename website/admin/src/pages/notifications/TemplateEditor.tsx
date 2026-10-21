import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Braces, Save, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { NotifChannel, NotificationTemplate, NotifType } from '@/types';
import { NOTIF_CHANNELS, NOTIF_TYPES, TEMPLATE_VARIABLES } from '@/data/messaging';
import { useTemplates } from '@/store/messaging';
import { useCan } from '@/store/auth';
import { useLang } from '@/hooks/useLocale';
import { uid } from '@/utils/id';
import { cn } from '@/utils/cn';
import { fmtRelative } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, Field, Input, Segmented, Select, Switch, Textarea, useConfirm } from '@/components/ui';
import { extractVariables, HAS_SUBJECT, PhonePreview, smsSegments } from './_shared';

type TextField = 'subject_en' | 'subject_ar' | 'body_en' | 'body_ar';

export default function TemplateEditor() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const can = useCan();
  const confirm = useConfirm();
  const existing = useTemplates((s) => s.items.find((i) => i.id === id));
  const add = useTemplates((s) => s.add);
  const update = useTemplates((s) => s.update);
  const remove = useTemplates((s) => s.remove);
  const isNew = !id;
  const editable = can('notifications', isNew ? 'create' : 'edit');

  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().trim().min(3, t('errors.min', { min: 3 })),
          type: z.enum(NOTIF_TYPES as [NotifType, ...NotifType[]]),
          channel: z.enum(NOTIF_CHANNELS as [NotifChannel, ...NotifChannel[]]),
          active: z.boolean(),
          subject_en: z.string(),
          subject_ar: z.string(),
          body_en: z.string().trim().min(5, t('errors.required')),
          body_ar: z.string().trim().min(5, t('errors.required')),
        })
        .superRefine((v, ctx) => {
          if (v.channel === 'email' || v.channel === 'push') {
            if (!v.subject_en.trim()) ctx.addIssue({ code: 'custom', path: ['subject_en'], message: t('errors.required') });
            if (!v.subject_ar.trim()) ctx.addIssue({ code: 'custom', path: ['subject_ar'], message: t('errors.required') });
          }
        }),
    [t],
  );
  type Form = z.infer<typeof schema>;

  const qType = params.get('type') as NotifType | null;
  const qChannel = params.get('channel') as NotifChannel | null;
  const defaults: Form = existing
    ? { name: existing.name, type: existing.type, channel: existing.channel, active: existing.active, subject_en: existing.subject_en, subject_ar: existing.subject_ar, body_en: existing.body_en, body_ar: existing.body_ar }
    : {
        name: '',
        type: qType && NOTIF_TYPES.includes(qType) ? qType : 'new_lesson',
        channel: qChannel && NOTIF_CHANNELS.includes(qChannel) ? qChannel : 'push',
        active: true,
        subject_en: '',
        subject_ar: '',
        body_en: '',
        body_ar: '',
      };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: defaults });

  const [previewLang, setPreviewLang] = useState<'en' | 'ar'>(lang);
  const refs = useRef<Partial<Record<TextField, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const [focused, setFocused] = useState<TextField>('body_en');

  const v = watch();
  const showSubject = HAS_SUBJECT[v.channel];
  const used = extractVariables(v.subject_en, v.subject_ar, v.body_en, v.body_ar);
  const unknown = used.filter((k) => !TEMPLATE_VARIABLES[k]);

  const reg = (name: TextField) => {
    const r = register(name);
    return {
      ...r,
      ref: (el: HTMLInputElement | HTMLTextAreaElement | null) => {
        r.ref(el);
        refs.current[name] = el;
      },
      onFocus: () => setFocused(name),
    };
  };

  const insertVar = (key: string) => {
    const field = !showSubject && focused.startsWith('subject') ? (focused.endsWith('ar') ? 'body_ar' : 'body_en') : focused;
    const el = refs.current[field];
    const cur = getValues(field);
    const token = `{${key}}`;
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    setValue(field, cur.slice(0, start) + token + cur.slice(end), { shouldDirty: true, shouldValidate: true });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  if (!isNew && !existing) {
    return (
      <div>
        <PageHeader title={t('notifications.editor.notFound')} current={id} />
        <Card>
          <EmptyState title={t('notifications.editor.notFound')} hint={t('errors.notFoundSub')} action={<ButtonLink to="/notifications/templates" size="sm">{t('actions.back')}</ButtonLink>} />
        </Card>
      </div>
    );
  }

  const onSubmit = async (f: Form) => {
    await new Promise((r) => setTimeout(r, 400));
    const payload = {
      ...f,
      subject_en: HAS_SUBJECT[f.channel] ? f.subject_en : '',
      subject_ar: HAS_SUBJECT[f.channel] ? f.subject_ar : '',
      variables: extractVariables(f.subject_en, f.subject_ar, f.body_en, f.body_ar),
      updatedAt: new Date().toISOString(),
    };
    if (isNew) {
      const tpl: NotificationTemplate = { id: uid('tpl'), ...payload };
      add(tpl);
      toast.success(t('toast.created', { entity: f.name }));
      navigate(`/notifications/templates/${tpl.id}`, { replace: true });
    } else {
      update(existing!.id, payload);
      reset(f);
      toast.success(t('toast.updated', { entity: f.name }));
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: existing.name }), body: t('confirm.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    remove(existing.id);
    toast.success(t('toast.deleted', { entity: existing.name }));
    navigate('/notifications/templates');
  };

  const counter = (text: string) => {
    const s = smsSegments(text);
    return (
      <span className={cn('num', v.channel === 'sms' && s.segments > 2 && 'font-semibold text-warning')}>
        {v.channel === 'sms'
          ? t('notifications.editor.smsCounter', { chars: s.len, segments: s.segments, encoding: s.unicode ? 'UCS-2' : 'GSM-7' })
          : t('notifications.editor.charCounter', { chars: s.len })}
      </span>
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <PageHeader
        title={isNew ? t('notifications.editor.newTitle') : existing!.name}
        subtitle={t('notifications.editor.subtitle')}
        current={isNew ? t('notifications.editor.newTitle') : existing!.name}
        meta={
          !isNew && (
            <>
              <Badge tone={existing!.active ? 'success' : 'neutral'} dot>
                {existing!.active ? t('status.active') : t('status.inactive')}
              </Badge>
              <span className="text-xs text-muted">{t('common.lastUpdated', { time: fmtRelative(existing!.updatedAt) })}</span>
              {isDirty && <Badge tone="warning">{t('common.unsavedChanges')}</Badge>}
            </>
          )
        }
        actions={
          <>
            <ButtonLink to="/notifications/templates" variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>
              {t('actions.back')}
            </ButtonLink>
            {!isNew && can('notifications', 'delete') && (
              <Button variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" onClick={onDelete} icon={<Trash2 className="h-4 w-4" />}>
                {t('actions.delete')}
              </Button>
            )}
            {editable && (
              <Button type="submit" loading={isSubmitting} disabled={!isNew && !isDirty} icon={<Save className="h-4 w-4" />}>
                {isNew ? t('actions.create') : t('actions.saveChanges')}
              </Button>
            )}
          </>
        }
      />

      <fieldset disabled={!editable} className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title={t('notifications.editor.details')} />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label={t('common.name')} required error={errors.name?.message} className="sm:col-span-2">
                <Input {...register('name')} invalid={!!errors.name} placeholder={t('notifications.editor.namePlaceholder')} />
              </Field>
              <Field label={t('common.type')}>
                <Select {...register('type')} options={NOTIF_TYPES.map((x) => ({ value: x, label: t(`notifications.types.${x}`) }))} />
              </Field>
              <Field label={t('notifications.channel')}>
                <Select {...register('channel')} options={NOTIF_CHANNELS.map((x) => ({ value: x, label: t(`notifications.channels.${x}`) }))} />
              </Field>
              <div className="sm:col-span-2">
                <Switch checked={v.active} onChange={(x) => setValue('active', x, { shouldDirty: true })} label={t('notifications.editor.activeLabel')} description={t('notifications.editor.activeHint')} disabled={!editable} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('notifications.editor.content')} subtitle={t('notifications.editor.contentHint')} icon={<Braces className="h-4 w-4" />} />
            <CardBody className="space-y-5">
              <div>
                <span className="label">{t('notifications.variables')}</span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(TEMPLATE_VARIABLES).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertVar(k)}
                      className={cn(
                        'rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition',
                        used.includes(k) ? 'bg-accent/15 text-primary ring-accent/40' : 'bg-surface-2 text-ink/70 ring-line hover:ring-accent/50',
                      )}
                      dir="ltr"
                    >
                      {`{${k}}`}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted">{t('notifications.editor.variablesHint')}</p>
                {unknown.length > 0 && <p className="mt-1 text-xs font-medium text-danger">{t('notifications.editor.unknownVars', { vars: unknown.map((u) => `{${u}}`).join(', ') })}</p>}
              </div>

              {showSubject && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={v.channel === 'email' ? t('notifications.editor.subjectEn') : t('notifications.editor.titleEn')} required error={errors.subject_en?.message}>
                    <Input dir="ltr" invalid={!!errors.subject_en} {...reg('subject_en')} />
                  </Field>
                  <Field label={v.channel === 'email' ? t('notifications.editor.subjectAr') : t('notifications.editor.titleAr')} required error={errors.subject_ar?.message}>
                    <Input dir="rtl" invalid={!!errors.subject_ar} {...reg('subject_ar')} />
                  </Field>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t('notifications.editor.bodyEn')} required error={errors.body_en?.message} hint={counter(v.body_en)}>
                  <Textarea dir="ltr" rows={v.channel === 'email' ? 10 : 6} invalid={!!errors.body_en} {...reg('body_en')} />
                </Field>
                <Field label={t('notifications.editor.bodyAr')} required error={errors.body_ar?.message} hint={counter(v.body_ar)}>
                  <Textarea dir="rtl" rows={v.channel === 'email' ? 10 : 6} invalid={!!errors.body_ar} {...reg('body_ar')} />
                </Field>
              </div>
              {v.channel === 'sms' && <p className="rounded-lg bg-info/[0.06] px-3 py-2 text-xs text-info">{t('notifications.editor.smsNote')}</p>}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card>
            <CardHeader
              title={t('notifications.editor.preview')}
              subtitle={t(`notifications.channels.${v.channel}`)}
              action={<Segmented size="sm" value={previewLang} onChange={setPreviewLang} options={[{ value: 'en', label: 'EN' }, { value: 'ar', label: 'ع' }]} />}
            />
            <CardBody className="bg-surface-2">
              <PhonePreview channel={v.channel} lang={previewLang} subject={previewLang === 'ar' ? v.subject_ar : v.subject_en} body={(previewLang === 'ar' ? v.body_ar : v.body_en) || t('notifications.editor.emptyBody')} />
            </CardBody>
          </Card>
          {used.length > 0 && (
            <Card>
              <CardHeader title={t('notifications.editor.sampleValues')} />
              <ul className="divide-y divide-line text-xs">
                {used.filter((k) => TEMPLATE_VARIABLES[k]).map((k) => (
                  <li key={k} className="flex items-center justify-between gap-3 px-5 py-2">
                    <code className="text-primary" dir="ltr">{`{${k}}`}</code>
                    <span className="truncate text-muted">{TEMPLATE_VARIABLES[k][previewLang]}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </fieldset>
    </form>
  );
}
