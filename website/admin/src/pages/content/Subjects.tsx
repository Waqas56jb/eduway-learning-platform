import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BookOpen, Check, FolderTree, Layers, Lock, MoreHorizontal, Pencil, Plus, Trash2, Unlock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { SubjectKey } from '@/types';
import { cn } from '@/utils/cn';
import { fmtNumber, fmtPercent } from '@/utils/format';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { errorMessage, isApiError } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { curriculumKeys, subjectsApi, useSubjectsQuery, type SubjectVM } from '@/api/content';
import { useUpload } from '@/api/storage';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  Field,
  FileUpload,
  Img,
  Input,
  MenuItem,
  Popover,
  ProgressBar,
  Select,
  SkeletonCard,
  StatusBadge,
  Switch,
  useConfirm,
} from '@/components/ui';

/** Brand colour presets for the seeded subjects (UI palette, not commercial data). */
const SUBJECT_COLORS: Record<SubjectKey, string> = {
  math: '#2563EB',
  physics: '#7C3AED',
  chemistry: '#059669',
  biology: '#DB2777',
  english: '#EA580C',
};
const PRESETS: { key: SubjectKey; color: string }[] = (Object.keys(SUBJECT_COLORS) as SubjectKey[]).map((k) => ({ key: k, color: SUBJECT_COLORS[k] }));
const slugify = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 31);

function SubjectDrawer({ open, subject, count, onClose }: { open: boolean; subject: SubjectVM | null; count: number; onClose: () => void }) {
  const { t } = useTranslation();
  const upload = useUpload('subject_image');
  const [imageKey, setImageKey] = useState<string | null | undefined>(undefined);

  const schema = z.object({
    name_en: z.string().trim().min(2, t('errors.required')),
    name_ar: z.string().trim().min(2, t('errors.required')),
    key: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/, t('content.subjects.slugInvalid')),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    image: z.string(),
    order: z.coerce.number().int().min(1, t('errors.min', { min: 1 })),
    status: z.enum(['active', 'hidden']),
    sequentialUnlock: z.boolean(),
  });
  type Form = z.infer<typeof schema>;

  const defaults = (): Form =>
    subject
      ? { name_en: subject.name_en, name_ar: subject.name_ar, key: subject.slug, color: subject.color, image: subject.image, order: subject.order, status: subject.status, sequentialUnlock: subject.sequentialUnlock }
      : { name_en: '', name_ar: '', key: '', color: SUBJECT_COLORS.math, image: '', order: count + 1, status: 'active', sequentialUnlock: false };

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), values: open ? defaults() : undefined });

  // The form has no values while the drawer is closed.
  const color = watch('color') ?? '';
  const image = watch('image');

  const close = () => {
    setImageKey(undefined);
    upload.reset();
    onClose();
  };

  const save = useApiMutation(
    (v: Form) => {
      const body = {
        name: { en: v.name_en, ar: v.name_ar },
        slug: v.key,
        color: v.color,
        order: v.order,
        status: v.status,
        sequentialUnlock: v.sequentialUnlock,
        ...(imageKey !== undefined ? { imageFileKey: imageKey } : {}),
      };
      return subject ? subjectsApi.update(subject.id, body) : subjectsApi.create(body);
    },
    {
      invalidate: curriculumKeys,
      silentError: true,
      onSuccess: (_d, v) => {
        toast.success(t(subject ? 'toast.updated' : 'toast.created', { entity: v.name_en }));
        reset();
        close();
      },
      onError: (e) => {
        if (isApiError(e) && e.status === 409) setError('key', { message: errorMessage(e) });
        else if (isApiError(e) && Object.keys(e.fields).length) {
          for (const [k, msg] of Object.entries(e.fields)) {
            const f = k === 'name.en' ? 'name_en' : k === 'name.ar' ? 'name_ar' : k === 'slug' ? 'key' : (k as keyof Form);
            setError(f as keyof Form, { message: msg });
          }
        } else toast.error(errorMessage(e));
      },
    },
  );
  const submit = async (v: Form) => {
    await save.mutateAsync(v).catch(() => undefined);
  };
  const keyValue = watch('key') ?? '';

  return (
    <Drawer
      open={open}
      onClose={close}
      title={subject ? t('content.subjects.edit') : t('content.subjects.new')}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" form="subject-form" loading={isSubmitting} disabled={upload.uploading}>
            {subject ? t('actions.saveChanges') : t('content.subjects.create')}
          </Button>
        </>
      }
    >
      <form id="subject-form" onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.nameEn')} error={errors.name_en?.message} required htmlFor="s-en">
            <Input
              id="s-en"
              invalid={!!errors.name_en}
              {...register('name_en', {
                onChange: (e) => {
                  if (!subject && !keyValue) setValue('key', slugify(e.target.value));
                },
              })}
            />
          </Field>
          <Field label={t('common.nameAr')} error={errors.name_ar?.message} required htmlFor="s-ar">
            <Input id="s-ar" dir="rtl" invalid={!!errors.name_ar} {...register('name_ar')} />
          </Field>
        </div>

        <Field label={t('content.subjects.color')}>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setValue('color', p.color, { shouldDirty: true });
                  if (!subject) setValue('key', p.key, { shouldDirty: true });
                }}
                className={cn('grid h-9 w-9 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-surface transition', color.toLowerCase() === p.color.toLowerCase() ? 'ring-accent' : 'ring-transparent hover:ring-line')}
                style={{ background: p.color }}
                aria-label={t(`subjects.${p.key}`)}
                title={t(`subjects.${p.key}`)}
              >
                {color.toLowerCase() === p.color.toLowerCase() && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
            <label className="ms-1 flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-xs text-muted">
              <input type="color" value={color || '#0B1F3A'}onChange={(e) => setValue('color', e.target.value.toUpperCase(), { shouldDirty: true })} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" aria-label={t('content.subjects.customColor')} />
              <span className="num uppercase" dir="ltr">
                {color}
              </span>
            </label>
          </div>
        </Field>

        <Field label={t('content.subjects.slug')} error={errors.key?.message} hint={t('content.subjects.slugHint')} htmlFor="s-slug" required>
          <Input id="s-slug" dir="ltr" invalid={!!errors.key} {...register('key')} />
        </Field>

        <Field label={t('content.subjects.image')}>
          <FileUpload
            accept="image/png,image/jpeg,image/webp"
            maxSizeMb={5}
            preview={image}
            progress={upload.progress}
            disabled={upload.uploading}
            onFile={async (file, url) => {
              if (url) setValue('image', url, { shouldDirty: true });
              const r = await upload.start(file);
              if (r) setImageKey(r.fileKey);
              else setValue('image', subject?.image ?? '', { shouldDirty: true });
            }}
            onClear={() => {
              setValue('image', '', { shouldDirty: true });
              setImageKey(null);
            }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.order')} error={errors.order?.message} htmlFor="s-order">
            <Input id="s-order" type="number" min={1} invalid={!!errors.order} {...register('order')} />
          </Field>
          <Field label={t('content.subjects.status')} htmlFor="s-status">
            <Select
              id="s-status"
              {...register('status')}
              options={[
                { value: 'active', label: t('status.active') },
                { value: 'hidden', label: t('status.hidden') },
              ]}
            />
          </Field>
        </div>

        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <Controller
            control={control}
            name="sequentialUnlock"
            render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label={t('content.subjects.sequentialUnlock')} description={t('content.subjects.sequentialHint')} />}
          />
        </div>
      </form>
    </Drawer>
  );
}

export default function Subjects() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const q = useSubjectsQuery();
  const loading = q.isLoading;
  const subjects = q.data ?? [];
  const [drawer, setDrawer] = useState<{ open: boolean; subject: SubjectVM | null }>({ open: false, subject: null });

  const sorted = [...subjects].sort((a, b) => a.order - b.order);

  const removeMut = useApiMutation((s: SubjectVM) => subjectsApi.remove(s.id), {
    invalidate: curriculumKeys,
    silentError: true,
    onSuccess: (_d, s) => toast.success(t('toast.deleted', { entity: L(s, 'name') })),
    onError: (e) => toast.error(isApiError(e) && e.reason === 'HAS_DEPENDENTS' ? t('content.subjects.deleteBlocked') : errorMessage(e)),
  });
  const onDelete = async (s: SubjectVM) => {
    if (s.stats.units || s.stats.lessons) {
      toast.error(t('content.subjects.deleteBlocked'));
      return;
    }
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: L(s, 'name') }), body: t('confirm.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    removeMut.mutate(s);
  };

  const unlockMut = useApiMutation((s: SubjectVM) => subjectsApi.update(s.id, { sequentialUnlock: !s.sequentialUnlock }), {
    invalidate: curriculumKeys,
    onSuccess: (_d, s) => toast.success(t('toast.updated', { entity: L(s, 'name') })),
  });
  const toggleUnlock = (s: SubjectVM) => unlockMut.mutate(s);

  return (
    <div>
      <PageHeader
        title={t('content.subjects.title')}
        subtitle={t('content.subjects.subtitle')}
        actions={
          can('content', 'create') && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setDrawer({ open: true, subject: null })}>
              {t('content.subjects.new')}
            </Button>
          )
        }
      />

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} lines={4} className="h-72" />
          ))}
        </div>
      ) : q.isError ? (
        <div className="card">
          <EmptyState title={t('api.loadFailed')} hint={errorMessage(q.error)} action={<Button variant="secondary" onClick={() => q.refetch()}>{t('api.retry')}</Button>} />
        </div>
      ) : sorted.length === 0 ? (
        <div className="card">
          <EmptyState />
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((s) => {
            const st = { ...s.stats, pct: s.stats.publishedPct };
            return (
              <article key={s.id} className="card group flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft">
                <div className="relative h-36 overflow-hidden">
                  {s.image ? <Img src={s.image} alt="" className="h-full w-full transition-transform duration-500 group-hover:scale-105" /> : <div className="h-full w-full bg-navy-grad" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/85 via-[#0B1F3A]/25 to-transparent" />
                  <span className="absolute inset-x-0 top-0 h-1" style={{ background: s.color }} />
                  <div className="absolute start-4 top-4 flex gap-1.5">
                    <span className="rounded-md bg-black/35 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur num">#{s.order}</span>
                    {s.status === 'hidden' && <StatusBadge status="hidden" className="bg-white/90" />}
                  </div>
                  {(can('content', 'edit') || can('content', 'delete')) && (
                    <div className="absolute end-3 top-3">
                      <Popover
                        trigger={({ toggle, open }) => (
                          <button onClick={toggle} aria-expanded={open} aria-label={t('actions.more')} className="grid h-8 w-8 place-items-center rounded-lg bg-black/30 text-white backdrop-blur transition hover:bg-black/50">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        )}
                      >
                        {(close) => (
                          <div role="menu">
                            {can('content', 'edit') && (
                              <MenuItem icon={<Pencil />} onClick={() => { setDrawer({ open: true, subject: s }); close(); }}>
                                {t('actions.edit')}
                              </MenuItem>
                            )}
                            {can('content', 'edit') && (
                              <MenuItem icon={s.sequentialUnlock ? <Unlock /> : <Lock />} onClick={() => { toggleUnlock(s); close(); }}>
                                {t('content.subjects.sequentialUnlock')}: {s.sequentialUnlock ? t('common.off') : t('common.on')}
                              </MenuItem>
                            )}
                            {can('content', 'delete') && (
                              <MenuItem danger icon={<Trash2 />} onClick={() => { close(); onDelete(s); }}>
                                {t('actions.delete')}
                              </MenuItem>
                            )}
                          </div>
                        )}
                      </Popover>
                    </div>
                  )}
                  <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold text-white">{L(s, 'name')}</h2>
                      <p className="truncate text-xs text-white/70">{s.name_ar !== L(s, 'name') ? s.name_ar : s.name_en}</p>
                    </div>
                    <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/80" style={{ background: s.color }} aria-hidden />
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg bg-surface-2 py-2.5">
                      <Layers className="mx-auto h-4 w-4 text-muted" />
                      <div className="mt-1 text-base font-semibold text-ink num">{fmtNumber(st.units)}</div>
                      <div className="text-[11px] text-muted">{t('content.subjects.unitsLabel')}</div>
                    </div>
                    <div className="rounded-lg bg-surface-2 py-2.5">
                      <BookOpen className="mx-auto h-4 w-4 text-muted" />
                      <div className="mt-1 text-base font-semibold text-ink num">{fmtNumber(st.lessons)}</div>
                      <div className="text-[11px] text-muted">{t('nav.lessons')}</div>
                    </div>
                    <div className="rounded-lg bg-surface-2 py-2.5">
                      <Check className="mx-auto h-4 w-4 text-success" />
                      <div className="mt-1 text-base font-semibold text-ink num">{fmtNumber(st.published)}</div>
                      <div className="text-[11px] text-muted">{t('content.subjects.published')}</div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted">{t('content.subjects.published')}</span>
                      <span className="font-semibold text-ink num">{fmtPercent(st.pct)}</span>
                    </div>
                    <ProgressBar value={st.pct} color={s.color} size="sm" label={t('content.subjects.published')} />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Badge tone={s.sequentialUnlock ? 'accent' : 'neutral'} icon={s.sequentialUnlock ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}>
                      {t('content.subjects.sequentialUnlock')}: {s.sequentialUnlock ? t('common.on') : t('common.off')}
                    </Badge>
                    {s.status === 'active' && <StatusBadge status="active" />}
                  </div>

                  <div className="mt-auto flex gap-2 pt-5">
                    <Link to="/content/units" state={{ subjectId: s.id }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-xs font-semibold text-ink transition hover:border-accent/60 hover:bg-surface-2">
                      <FolderTree className="h-3.5 w-3.5" /> {t('content.subjects.manageUnits')}
                    </Link>
                    <Link to="/content/lessons" state={{ subjectId: s.id }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-xs font-semibold text-ink transition hover:border-accent/60 hover:bg-surface-2">
                      <BookOpen className="h-3.5 w-3.5" /> {t('content.subjects.viewLessons')}
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <SubjectDrawer open={drawer.open} subject={drawer.subject} count={subjects.length} onClose={() => setDrawer({ open: false, subject: null })} />
    </div>
  );
}
