import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, HelpCircle, MessageSquareQuote, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  cmsApi,
  useFaq,
  useTestimonials,
  type FaqDto,
  type FaqInput,
  type FaqPlacement,
  type TestimonialDto,
  type TestimonialInput,
  type TestimonialPlacement,
} from '@/api/settings';
import { useApiMutation } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useUpload } from '@/api/storage';
import type { Localized } from '@/api/types';
import { useLang } from '@/hooks/useLocale';
import { useCan } from '@/store/auth';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, Drawer, EmptyState, Field, FileUpload, Input, Skeleton, Switch, Tabs, Textarea, useConfirm } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { ChipToggle, ReadOnlyNotice, useCanEditSettings } from './_shared';

type Tab = 'testimonials' | 'faq';
const T_PLACEMENTS: TestimonialPlacement[] = ['landing', 'auth', 'app'];
const F_PLACEMENTS: FaqPlacement[] = ['landing', 'pricing', 'subscription_app', 'contact'];
const L0: Localized = { en: '', ar: '' };
const filled = (l: Localized) => !!l.en.trim() && !!l.ar.trim();

export default function Cms() {
  const { t } = useTranslation();
  const editable = useCanEditSettings();
  const [tab, setTab] = useState<Tab>('testimonials');
  const testimonials = useTestimonials();
  const faq = useFaq();

  return (
    <div>
      <PageHeader title={t('settings.cms.title')} subtitle={t('settings.cms.subtitle')} />
      {!editable && <ReadOnlyNotice />}
      <Tabs<Tab>
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'testimonials', label: t('settings.cms.testimonials'), icon: <MessageSquareQuote />, count: testimonials.data?.length },
          { key: 'faq', label: t('settings.cms.faq'), icon: <HelpCircle />, count: faq.data?.length },
        ]}
      />
      {tab === 'testimonials' ? <TestimonialsPanel editable={editable} /> : <FaqPanel editable={editable} />}
    </div>
  );
}

// ─── shared list frame with optimistic reorder / toggle ─────────────────────
function useCmsReorder<T extends { id: string; order: number }>(kind: Tab, key: QueryKey) {
  const qc = useQueryClient();
  return useApiMutation((ids: string[]) => cmsApi.reorder(kind, ids), {
    invalidate: [key],
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<T[]>(key);
      if (prev) {
        const map = new Map(prev.map((x) => [x.id, x]));
        qc.setQueryData<T[]>(key, ids.map((id, i) => ({ ...(map.get(id) as T), order: i + 1 })));
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prev?: T[] } | undefined;
      if (c?.prev) qc.setQueryData(key, c.prev);
    },
  });
}

function moveIds(ids: string[], i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function ListFrame({ loading, error, onRetry, empty, emptyAction, children }: { loading: boolean; error: unknown; onRetry: () => void; empty: boolean; emptyAction?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  if (error) return <QueryError error={error} onRetry={onRetry} />;
  return (
    <div className="card overflow-hidden">
      {loading ? (
        <div className="divide-y divide-line">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : empty ? (
        <EmptyState title={t('common.emptyTitle')} hint={t('settings.cms.emptyHint')} action={emptyAction} />
      ) : (
        <ul className="divide-y divide-line">{children}</ul>
      )}
    </div>
  );
}

function RowControls({ editable, canDelete, index, count, active, onMove, onToggle, onEdit, onDelete }: {
  editable: boolean;
  canDelete: boolean;
  index: number;
  count: number;
  active: boolean;
  onMove: (dir: -1 | 1) => void;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" disabled={!editable || index === 0} onClick={() => onMove(-1)} aria-label={t('settings.payments.moveUp')}>
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon-sm" disabled={!editable || index === count - 1} onClick={() => onMove(1)} aria-label={t('settings.payments.moveDown')}>
        <ArrowDown className="h-4 w-4" />
      </Button>
      <Switch size="sm" checked={active} onChange={onToggle} disabled={!editable} aria-label={t('settings.cms.active')} className="mx-2" />
      <Button variant="ghost" size="icon-sm" disabled={!editable} onClick={onEdit} aria-label={t('actions.edit')}>
        <Pencil className="h-4 w-4" />
      </Button>
      {canDelete && (
        <Button variant="ghost" size="icon-sm" className="text-danger hover:bg-danger/10 hover:text-danger" onClick={onDelete} aria-label={t('actions.delete')}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// ─── testimonials ────────────────────────────────────────────────────────────
function TestimonialsPanel({ editable }: { editable: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const confirm = useConfirm();
  const canDelete = useCan()('settings', 'delete') || editable;
  const q = useTestimonials();
  const key = qk.cms.sub('testimonials');
  const items = q.data ?? [];
  const [editing, setEditing] = useState<TestimonialDto | 'new' | null>(null);
  const reorder = useCmsReorder<TestimonialDto>('testimonials', key);
  const toggle = useApiMutation((v: { id: string; active: boolean }) => cmsApi.updateTestimonial(v.id, { active: v.active }), { invalidate: [key], success: 'toast.saved' });
  const remove = useApiMutation((id: string) => cmsApi.removeTestimonial(id), { invalidate: [key], success: () => t('toast.deleted', { entity: t('settings.cms.testimonial') }) });

  const del = async (x: TestimonialDto) => {
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: x.name[lang] || x.name.en }), body: t('confirm.deleteBody'), tone: 'danger', confirmText: t('actions.delete') });
    if (ok) remove.mutate(x.id);
  };
  const addBtn = editable ? (
    <Button onClick={() => setEditing('new')} icon={<Plus className="h-4 w-4" />}>
      {t('settings.cms.addTestimonial')}
    </Button>
  ) : undefined;

  return (
    <>
      <div className="mb-4 flex justify-end">{addBtn}</div>
      <ListFrame loading={q.isLoading} error={q.error && !q.data ? q.error : null} onRetry={() => q.refetch()} empty={items.length === 0} emptyAction={addBtn}>
        {items.map((x, i) => (
          <li key={x.id} className={cn('flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center', !x.active && 'opacity-60')}>
            <Avatar name={x.name.en} src={x.avatar ?? undefined} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{x.name[lang] || x.name.en}</span>
                <span className="text-xs text-muted">
                  {x.role[lang]} · {x.city[lang]}
                </span>
                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-accent">
                  <Star className="h-3.5 w-3.5 fill-current" /> {x.rating}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted">“{x.quote[lang] || x.quote.en}”</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {x.placements.map((p) => (
                  <Badge key={p} tone="navy">
                    {t(`settings.cms.placements.${p}`)}
                  </Badge>
                ))}
              </div>
            </div>
            <RowControls
              editable={editable}
              canDelete={canDelete}
              index={i}
              count={items.length}
              active={x.active}
              onMove={(dir) => reorder.mutate(moveIds(items.map((y) => y.id), i, dir))}
              onToggle={(active) => toggle.mutate({ id: x.id, active })}
              onEdit={() => setEditing(x)}
              onDelete={() => del(x)}
            />
          </li>
        ))}
      </ListFrame>
      <TestimonialDrawer value={editing} nextOrder={items.length + 1} onClose={() => setEditing(null)} />
    </>
  );
}

function TestimonialDrawer({ value, nextOrder, onClose }: { value: TestimonialDto | 'new' | null; nextOrder: number; onClose: () => void }) {
  const { t } = useTranslation();
  const upload = useUpload('testimonial_avatar');
  const key = qk.cms.sub('testimonials');
  const isNew = value === 'new';
  const [form, setForm] = useState<TestimonialInput & { avatarPreview: string | null }>({ name: L0, city: L0, role: L0, quote: L0, rating: 5, placements: ['landing'], order: nextOrder, active: true, avatarPreview: null });
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!value) return;
    setTouched(false);
    if (value === 'new') setForm({ name: L0, city: L0, role: L0, quote: L0, rating: 5, placements: ['landing'], order: nextOrder, active: true, avatarPreview: null });
    else setForm({ name: value.name, city: value.city, role: value.role, quote: value.quote, rating: value.rating, placements: value.placements, order: value.order, active: value.active, avatarPreview: value.avatar });
  }, [value, nextOrder]);

  const save = useApiMutation(
    (body: TestimonialInput) => (value && value !== 'new' ? cmsApi.updateTestimonial(value.id, body) : cmsApi.createTestimonial(body)),
    { invalidate: [key], success: 'toast.saved', onSuccess: () => onClose() },
  );
  const invalid = !filled(form.name) || !filled(form.quote) || form.placements.length === 0;
  const submit = () => {
    setTouched(true);
    if (invalid) return;
    const { avatarPreview: _p, ...body } = form;
    void _p;
    save.mutate(body);
  };
  const setL = (k: 'name' | 'city' | 'role' | 'quote', l: 'en' | 'ar', v: string) => setForm((f) => ({ ...f, [k]: { ...f[k], [l]: v } }));

  return (
    <Drawer
      open={!!value}
      onClose={onClose}
      title={isNew ? t('settings.cms.addTestimonial') : t('settings.cms.editTestimonial')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={upload.uploading}>
            {t('actions.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('settings.cms.avatar')}>
          <FileUpload
            accept="image/png,image/jpeg,image/webp"
            maxSizeMb={5}
            compact
            preview={form.avatarPreview}
            progress={upload.progress}
            onFile={async (file, url) => {
              const r = await upload.start(file);
              if (r) setForm((f) => ({ ...f, avatarFileKey: r.fileKey, avatarPreview: url }));
            }}
            onClear={() => setForm((f) => ({ ...f, avatarFileKey: null, avatarPreview: null }))}
          />
        </Field>
        {(['name', 'role', 'city'] as const).map((k) => (
          <div key={k} className="grid gap-4 sm:grid-cols-2">
            <Field label={t(`settings.cms.${k}En`)} required={k === 'name'} error={touched && k === 'name' && !form.name.en.trim() ? t('errors.required') : undefined}>
              <Input dir="ltr" value={form[k].en} onChange={(e) => setL(k, 'en', e.target.value)} />
            </Field>
            <Field label={t(`settings.cms.${k}Ar`)} required={k === 'name'} error={touched && k === 'name' && !form.name.ar.trim() ? t('errors.required') : undefined}>
              <Input dir="rtl" value={form[k].ar} onChange={(e) => setL(k, 'ar', e.target.value)} />
            </Field>
          </div>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.cms.quoteEn')} required error={touched && !form.quote.en.trim() ? t('errors.required') : undefined}>
            <Textarea dir="ltr" rows={4} value={form.quote.en} onChange={(e) => setL('quote', 'en', e.target.value)} />
          </Field>
          <Field label={t('settings.cms.quoteAr')} required error={touched && !form.quote.ar.trim() ? t('errors.required') : undefined}>
            <Textarea dir="rtl" rows={4} value={form.quote.ar} onChange={(e) => setL('quote', 'ar', e.target.value)} />
          </Field>
        </div>
        <Field label={t('settings.cms.rating')}>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setForm((f) => ({ ...f, rating: n }))} aria-label={`${n}`} className={cn('rounded p-0.5', n <= form.rating ? 'text-accent' : 'text-muted/40')}>
                <Star className="h-6 w-6 fill-current" />
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('settings.cms.placementsLabel')} error={touched && form.placements.length === 0 ? t('settings.cms.placementRequired') : undefined}>
          <ChipToggle<TestimonialPlacement> value={form.placements} onChange={(placements) => setForm((f) => ({ ...f, placements }))} options={T_PLACEMENTS.map((p) => ({ value: p, label: t(`settings.cms.placements.${p}`) }))} />
        </Field>
        <Switch checked={form.active} onChange={(active) => setForm((f) => ({ ...f, active }))} label={t('settings.cms.active')} description={t('settings.cms.activeHint')} />
      </div>
    </Drawer>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────
function FaqPanel({ editable }: { editable: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const confirm = useConfirm();
  const canDelete = useCan()('settings', 'delete') || editable;
  const q = useFaq();
  const key = qk.cms.sub('faq');
  const items = q.data ?? [];
  const [editing, setEditing] = useState<FaqDto | 'new' | null>(null);
  const reorder = useCmsReorder<FaqDto>('faq', key);
  const toggle = useApiMutation((v: { id: string; active: boolean }) => cmsApi.updateFaq(v.id, { active: v.active }), { invalidate: [key], success: 'toast.saved' });
  const remove = useApiMutation((id: string) => cmsApi.removeFaq(id), { invalidate: [key], success: () => t('toast.deleted', { entity: t('settings.cms.question') }) });

  const del = async (x: FaqDto) => {
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: x.q[lang] || x.q.en }), body: t('confirm.deleteBody'), tone: 'danger', confirmText: t('actions.delete') });
    if (ok) remove.mutate(x.id);
  };
  const addBtn = editable ? (
    <Button onClick={() => setEditing('new')} icon={<Plus className="h-4 w-4" />}>
      {t('settings.cms.addFaq')}
    </Button>
  ) : undefined;

  return (
    <>
      <div className="mb-4 flex justify-end">{addBtn}</div>
      <ListFrame loading={q.isLoading} error={q.error && !q.data ? q.error : null} onRetry={() => q.refetch()} empty={items.length === 0} emptyAction={addBtn}>
        {items.map((x, i) => (
          <li key={x.id} className={cn('flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center', !x.active && 'opacity-60')}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-xs font-bold text-accent num">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink">{x.q[lang] || x.q.en}</div>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{x.a[lang] || x.a.en}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {x.placements.map((p) => (
                  <Badge key={p} tone="navy">
                    {t(`settings.cms.placements.${p}`)}
                  </Badge>
                ))}
              </div>
            </div>
            <RowControls
              editable={editable}
              canDelete={canDelete}
              index={i}
              count={items.length}
              active={x.active}
              onMove={(dir) => reorder.mutate(moveIds(items.map((y) => y.id), i, dir))}
              onToggle={(active) => toggle.mutate({ id: x.id, active })}
              onEdit={() => setEditing(x)}
              onDelete={() => del(x)}
            />
          </li>
        ))}
      </ListFrame>
      <FaqDrawer value={editing} nextOrder={items.length + 1} onClose={() => setEditing(null)} />
    </>
  );
}

function FaqDrawer({ value, nextOrder, onClose }: { value: FaqDto | 'new' | null; nextOrder: number; onClose: () => void }) {
  const { t } = useTranslation();
  const key = qk.cms.sub('faq');
  const isNew = value === 'new';
  const [form, setForm] = useState<FaqInput>({ q: L0, a: L0, placements: ['landing'], order: nextOrder, active: true });
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!value) return;
    setTouched(false);
    if (value === 'new') setForm({ q: L0, a: L0, placements: ['landing'], order: nextOrder, active: true });
    else setForm({ q: value.q, a: value.a, placements: value.placements, order: value.order, active: value.active });
  }, [value, nextOrder]);
  const save = useApiMutation((body: FaqInput) => (value && value !== 'new' ? cmsApi.updateFaq(value.id, body) : cmsApi.createFaq(body)), {
    invalidate: [key],
    success: 'toast.saved',
    onSuccess: () => onClose(),
  });
  const invalid = !filled(form.q) || !filled(form.a) || form.placements.length === 0;
  const submit = () => {
    setTouched(true);
    if (!invalid) save.mutate(form);
  };
  const setL = (k: 'q' | 'a', l: 'en' | 'ar', v: string) => setForm((f) => ({ ...f, [k]: { ...f[k], [l]: v } }));

  return (
    <Drawer
      open={!!value}
      onClose={onClose}
      title={isNew ? t('settings.cms.addFaq') : t('settings.cms.editFaq')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {t('actions.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('settings.cms.questionEn')} required error={touched && !form.q.en.trim() ? t('errors.required') : undefined}>
          <Input dir="ltr" value={form.q.en} onChange={(e) => setL('q', 'en', e.target.value)} />
        </Field>
        <Field label={t('settings.cms.questionAr')} required error={touched && !form.q.ar.trim() ? t('errors.required') : undefined}>
          <Input dir="rtl" value={form.q.ar} onChange={(e) => setL('q', 'ar', e.target.value)} />
        </Field>
        <Field label={t('settings.cms.answerEn')} required error={touched && !form.a.en.trim() ? t('errors.required') : undefined}>
          <Textarea dir="ltr" rows={5} value={form.a.en} onChange={(e) => setL('a', 'en', e.target.value)} />
        </Field>
        <Field label={t('settings.cms.answerAr')} required error={touched && !form.a.ar.trim() ? t('errors.required') : undefined}>
          <Textarea dir="rtl" rows={5} value={form.a.ar} onChange={(e) => setL('a', 'ar', e.target.value)} />
        </Field>
        <Field label={t('settings.cms.placementsLabel')} error={touched && form.placements.length === 0 ? t('settings.cms.placementRequired') : undefined}>
          <ChipToggle<FaqPlacement> value={form.placements} onChange={(placements) => setForm((f) => ({ ...f, placements }))} options={F_PLACEMENTS.map((p) => ({ value: p, label: t(`settings.cms.placements.${p}`) }))} />
        </Field>
        <Switch checked={form.active} onChange={(active) => setForm((f) => ({ ...f, active }))} label={t('settings.cms.active')} description={t('settings.cms.activeHint')} />
      </div>
    </Drawer>
  );
}
