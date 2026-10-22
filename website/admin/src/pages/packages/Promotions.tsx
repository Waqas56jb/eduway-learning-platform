import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Copy, Gauge, History, Pencil, Plus, Sparkles, Tag, Ticket, Trash2, Wand2 } from 'lucide-react';
import type { PromoType } from '@/types';
import { cn } from '@/utils/cn';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber } from '@/utils/format';
import { formatPhone } from '@/utils/phone';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { qk } from '@/api/keys';
import { errorMessage, isApiError, type Query } from '@/api/client';
import { exportRequest, useApiMutation, useExport, usePagedList } from '@/api/hooks';
import { flatRef } from '@/api/adapters';
import type { Paged } from '@/api/types';
import { useLookups } from '@/api/lookups';
import { promotionsApi, toPromotionVM, usePromotionStats, type PromoPhase, type PromotionDto, type PromotionVM, type PromotionWriteDto, type RedemptionDto } from '@/api/packages';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Drawer,
  Field,
  FilterSelect,
  Input,
  Modal,
  ProgressBar,
  Select,
  Segmented,
  StatCard,
  Switch,
  useConfirm,
  type Tone,
} from '@/components/ui';

const TYPE_TONE: Record<PromoType, Tone> = { promo: 'accent', school: 'info', referral: 'purple', campaign: 'navy' };

type Phase = PromoPhase;

const PHASE_TONE: Record<Phase, Tone> = { live: 'success', upcoming: 'info', expired: 'slate', exhausted: 'warning', disabled: 'neutral' };

const today = () => new Date().toISOString().slice(0, 10);

export default function Promotions() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [type, setType] = useState('');
  const [state, setState] = useState('');
  const [editing, setEditing] = useState<PromotionVM | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [history, setHistory] = useState<PromotionVM | null>(null);

  const list = usePagedList({
    key: qk.promotions.list,
    fetcher: (p) => promotionsApi.list(p),
    filters: { type, phase: state },
    initialSort: '-validFrom',
  });
  const rows = useMemo(() => list.items.map(toPromotionVM), [list.items]);
  const stats = usePromotionStats();
  const loading = stats.isLoading;
  const live = stats.data?.live ?? 0;
  const redemptions = stats.data?.redemptions ?? 0;
  const nearLimit = stats.data?.nearLimit ?? 0;
  const exp = useExport('/admin/promotions/export', 'promotions');

  // Optimistic enable switch: flip the row in every cached list page, roll back on error.
  const toggleM = useApiMutation((v: { id: string; enabled: boolean; code: string }) => promotionsApi.update(v.id, { enabled: v.enabled }), {
    invalidate: [qk.promotions.all],
    success: (_d, v) => t(v.enabled ? 'packages.promo.toggledOn' : 'packages.promo.toggledOff', { code: v.code }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.promotions.all });
      const prev = qc.getQueriesData<Paged<PromotionDto>>({ queryKey: qk.promotions.all });
      qc.setQueriesData<Paged<PromotionDto>>({ queryKey: [...qk.promotions.all, 'list'] }, (old) =>
        old ? { ...old, items: old.items.map((x) => (x.id === v.id ? { ...x, enabled: v.enabled, phase: v.enabled ? x.phase : 'disabled' } : x)) } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data)),
  });
  const removeM = useApiMutation((id: string) => promotionsApi.remove(id), {
    invalidate: [qk.promotions.all],
    success: () => t('toast.deleted', { entity: t('packages.promo.entity') }),
  });

  const toggle = (p: PromotionVM, on: boolean) => toggleM.mutate({ id: p.id, enabled: on, code: p.code });

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t('packages.promo.codeCopied', { code }));
    } catch {
      toast.error(t('toast.error'));
    }
  };

  const del = async (p: PromotionVM) => {
    const ok = await confirm({ title: t('packages.promo.deleteTitle', { code: p.code }), body: t('packages.promo.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    removeM.mutate(p.id);
  };

  const discountLabel = (p: PromotionVM) => (p.discountType === 'percent' ? `${p.discountValue}%` : fmtMoney(p.discountValue, 'IQD'));

  const columns = useMemo<ColumnDef<PromotionVM>[]>(
    () => [
      {
        id: 'code',
        accessorKey: 'code',
        header: t('packages.promo.code'),
        meta: { label: t('packages.promo.code') },
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span className="rounded-md border border-dashed border-accent/50 bg-accent/[0.06] px-2 py-0.5 font-mono text-xs font-semibold text-primary" dir="ltr">
              {row.original.code}
            </span>
            <button onClick={() => copy(row.original.code)} className="rounded p-1 text-muted hover:bg-ink/5 hover:text-ink" aria-label={`${t('actions.copy')} ${row.original.code}`}>
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
      },
      {
        id: 'type',
        accessorKey: 'type',
        enableSorting: false,
        header: t('packages.promo.type'),
        meta: { label: t('packages.promo.type') },
        cell: ({ row }) => (
          <div>
            <Badge tone={TYPE_TONE[row.original.type]}>{t(`packages.promo.types.${row.original.type}`)}</Badge>
            {row.original.ownerId && <div className="mt-0.5 max-w-[10rem] truncate text-[11px] text-muted">{L(row.original, 'ownerName')}</div>}
          </div>
        ),
      },
      {
        id: 'discountValue',
        accessorFn: (p) => discountLabel(p),
        header: t('packages.promo.discount'),
        meta: { label: t('packages.promo.discount'), align: 'end' },
        cell: ({ row }) => <span className="font-semibold text-ink">{discountLabel(row.original)}</span>,
      },
      {
        id: 'eligibility',
        accessorFn: (p) => t(`packages.promo.eligibilities.${p.eligibility}`),
        enableSorting: false,
        header: t('packages.promo.eligibility'),
        meta: { label: t('packages.promo.eligibility') },
        cell: ({ row }) => (
          <div className="min-w-[9rem]">
            <div className="text-ink/80">{t(`packages.promo.eligibilities.${row.original.eligibility}`)}</div>
            <div className="text-[11px] text-muted">
              {row.original.packageIds.length === 0
                ? t('packages.promo.allPackages')
                : row.original.packages.map((p) => L(p, 'name')).join(' · ')}
            </div>
          </div>
        ),
      },
      {
        id: 'used',
        accessorFn: (p) => p.used / p.usageLimit,
        header: t('packages.promo.usage'),
        meta: { label: t('packages.promo.usage'), exportValue: (p) => `${p.used}/${p.usageLimit}` },
        cell: ({ row }) => {
          const p = row.original;
          const pct = (p.used / p.usageLimit) * 100;
          return (
            <div className="w-32">
              <div className="mb-1 flex justify-between text-[11px] num">
                <span className="font-semibold text-ink">{fmtNumber(p.used)}</span>
                <span className="text-muted">/ {fmtNumber(p.usageLimit)}</span>
              </div>
              <ProgressBar value={pct} tone={pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'accent'} size="xs" />
            </div>
          );
        },
      },
      {
        id: 'validTo',
        accessorKey: 'validTo',
        header: t('packages.promo.validity'),
        meta: { label: t('packages.promo.validity'), exportValue: (p) => `${p.validFrom.slice(0, 10)} → ${p.validTo.slice(0, 10)}` },
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted num">
            {fmtDate(row.original.validFrom, 'd MMM')} – {fmtDate(row.original.validTo, 'd MMM yyyy')}
          </span>
        ),
      },
      {
        id: 'phase',
        accessorFn: (p) => p.phase,
        enableSorting: false,
        header: t('common.status'),
        meta: { label: t('common.status') },
        cell: ({ row }) => {
          const ph = row.original.phase;
          return (
            <Badge tone={PHASE_TONE[ph]} dot>
              {ph === 'disabled' ? t('status.disabled') : t(`packages.promo.${ph}`)}
            </Badge>
          );
        },
      },
      {
        id: 'enabled',
        accessorKey: 'enabled',
        enableSorting: false,
        header: t('packages.promo.enabled'),
        meta: { label: t('packages.promo.enabled'), align: 'center' },
        cell: ({ row }) => (
          <Switch
            size="sm"
            checked={row.original.enabled}
            disabled={!can('packages', 'edit')}
            onChange={(v) => toggle(row.original, v)}
            aria-label={`${t('packages.promo.enabled')} ${row.original.code}`}
          />
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon-sm" aria-label={t('packages.promo.redemptions')} title={t('packages.promo.redemptions')} onClick={() => setHistory(row.original)}>
              <History className="h-4 w-4" />
            </Button>
            {can('packages', 'edit') && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('actions.edit')}
                onClick={() => {
                  setEditing(row.original);
                  setDrawer(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {can('packages', 'delete') && (
              <Button variant="ghost" size="icon-sm" aria-label={t('actions.delete')} onClick={() => del(row.original)} className="hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, can],
  );

  return (
    <div>
      <PageHeader
        title={t('packages.promo.title')}
        subtitle={t('packages.promo.subtitle')}
        actions={
          can('packages', 'create') && (
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setEditing(null);
                setDrawer(true);
              }}
            >
              {t('packages.promo.new')}
            </Button>
          )
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard loading={loading} label={t('packages.promo.kpiActive')} value={fmtNumber(live)} icon={<Sparkles />} color="#16A34A" hint={`${fmtNumber(stats.data?.total ?? 0)} ${t('common.total').toLowerCase()}`} />
        <StatCard loading={loading} label={t('packages.promo.kpiRedemptions')} value={fmtNumber(redemptions)} icon={<Ticket />} color="#C9A24A" hint={' '} />
        <StatCard loading={loading} label={t('packages.promo.kpiNearLimit')} value={fmtNumber(nearLimit)} icon={<Gauge />} color="#F59E0B" hint="≥ 80%" />
      </div>

      <DataTable
        data={rows}
        columns={columns}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        server={list.server}
        onExport={can('packages', 'export') ? () => exp.mutate(exportRequest('csv', list.exportFilters)) : undefined}
        exporting={exp.isPending}
        toolbar={
          <>
            <FilterSelect
              label={t('packages.promo.type')}
              value={type}
              onChange={setType}
              options={(['promo', 'school', 'referral', 'campaign'] as const).map((v) => ({ value: v, label: t(`packages.promo.types.${v}`) }))}
            />
            <FilterSelect
              label={t('common.status')}
              value={state}
              onChange={setState}
              options={(['live', 'upcoming', 'expired', 'exhausted', 'disabled'] as const).map((v) => ({
                value: v,
                label: v === 'disabled' ? t('status.disabled') : t(`packages.promo.${v}`),
              }))}
            />
          </>
        }
      />

      <PromotionDrawer open={drawer} onClose={() => setDrawer(false)} promo={editing} />
      {history && <RedemptionsModal promo={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

/* ─── Create / edit drawer ───────────────────────────────────────────────── */

function PromotionDrawer({ open, onClose, promo }: { open: boolean; onClose: () => void; promo: PromotionVM | null }) {
  const { t } = useTranslation();
  const can = useCan();
  const allowed = can('packages', promo ? 'edit' : 'create');
  const formId = 'promo-form';
  const [saving, setSaving] = useState(false);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={promo ? t('packages.promo.edit') : t('packages.promo.new')}
      description={promo?.code}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={!allowed} loading={saving}>
            {promo ? t('actions.saveChanges') : t('packages.promo.create')}
          </Button>
        </>
      }
    >
      {open && <PromotionForm key={promo?.id ?? 'new'} formId={formId} promo={promo} allowed={allowed} onDone={onClose} onSaving={setSaving} />}
    </Drawer>
  );
}

function PromotionForm({ formId, promo, allowed, onDone, onSaving }: { formId: string; promo: PromotionVM | null; allowed: boolean; onDone: () => void; onSaving: (v: boolean) => void }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const qc = useQueryClient();
  const { packages, schools } = useLookups();
  const [generating, setGenerating] = useState(false);

  const schema = z
    .object({
      code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{4,20}$/, t('packages.promo.errors.code')),
      type: z.enum(['promo', 'school', 'referral', 'campaign']),
      discountType: z.enum(['percent', 'fixed']),
      discountValue: z.number({ invalid_type_error: t('packages.promo.errors.value') }).positive(t('packages.promo.errors.value')),
      eligibility: z.enum(['all', 'new_users', 'renewals', 'school_students']),
      packageIds: z.array(z.string()),
      usageLimit: z.number({ invalid_type_error: t('packages.promo.errors.limit') }).int().min(1, t('packages.promo.errors.limit')),
      perUserLimit: z.number({ invalid_type_error: t('packages.promo.errors.limit') }).int().min(1, t('packages.promo.errors.limit')),
      validFrom: z.string().min(1, t('errors.required')),
      validTo: z.string().min(1, t('errors.required')),
      enabled: z.boolean(),
      ownerId: z.string(),
    })
    .superRefine((v, ctx) => {
      if (v.discountType === 'percent' && v.discountValue > 100) ctx.addIssue({ code: 'custom', path: ['discountValue'], message: t('packages.promo.errors.percent') });
      if (v.validFrom && v.validTo && v.validTo < v.validFrom) ctx.addIssue({ code: 'custom', path: ['validTo'], message: t('packages.promo.errors.dates') });
    });
  type Form = z.infer<typeof schema>;

  const defaults: Form = promo
    ? {
        code: promo.code,
        type: promo.type,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        eligibility: promo.eligibility,
        packageIds: promo.packageIds,
        usageLimit: promo.usageLimit,
        perUserLimit: promo.perUserLimit,
        validFrom: promo.validFrom.slice(0, 10),
        validTo: promo.validTo.slice(0, 10),
        enabled: promo.enabled,
        ownerId: promo.ownerId ?? '',
      }
    : {
        code: '',
        type: 'promo',
        discountType: 'percent',
        discountValue: 10,
        eligibility: 'all',
        packageIds: [],
        usageLimit: 100,
        perUserLimit: 1,
        validFrom: today(),
        validTo: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
        enabled: true,
        ownerId: '',
      };

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: defaults });

  const generate = async () => {
    setGenerating(true);
    try {
      const { code } = await promotionsApi.generateCode();
      setValue('code', code, { shouldValidate: true });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setGenerating(false);
    }
  };

  // Pre-fill a server-generated code for new promotions.
  useEffect(() => {
    if (!promo) void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const discountType = watch('discountType');
  const promoType = watch('type');

  const submit = async (v: Form) => {
    const ownerType = v.type === 'school' && v.ownerId ? 'school' : null;
    const data: PromotionWriteDto = {
      code: v.code,
      type: v.type,
      discountType: v.discountType,
      discountValue: v.discountValue,
      packageIds: v.packageIds,
      eligibility: v.eligibility,
      usageLimit: v.usageLimit,
      perUserLimit: v.perUserLimit,
      validFrom: new Date(`${v.validFrom}T00:00:00+03:00`).toISOString(),
      validTo: new Date(`${v.validTo}T23:59:59+03:00`).toISOString(),
      enabled: v.enabled,
      ownerType,
      ownerId: ownerType ? v.ownerId : null,
    };
    onSaving(true);
    try {
      const { available } = await promotionsApi.checkCode(v.code, promo?.id);
      if (!available) {
        setError('code', { message: t('packages.promo.codeTaken') });
        return;
      }
      if (promo) await promotionsApi.update(promo.id, data);
      else await promotionsApi.create(data);
      await qc.invalidateQueries({ queryKey: qk.promotions.all });
      toast.success(t(promo ? 'toast.updated' : 'toast.created', { entity: t('packages.promo.entity') }));
      onDone();
    } catch (e) {
      if (isApiError(e) && e.code === 'CONFLICT') setError('code', { message: t('packages.promo.codeTaken') });
      else if (isApiError(e) && Object.keys(e.fields).length) Object.entries(e.fields).forEach(([k, msg]) => setError(k as keyof Form, { message: msg }));
      else toast.error(errorMessage(e));
    } finally {
      onSaving(false);
    }
  };

  return (
      <form id={formId} onSubmit={handleSubmit(submit)} noValidate>
        <fieldset disabled={!allowed} className="space-y-5">
          <Field label={t('packages.promo.code')} required error={errors.code?.message} hint={t('packages.promo.codeHint')} htmlFor="pr-code">
            <div className="flex gap-2">
              <Input id="pr-code" dir="ltr" icon={<Tag />} className="flex-1 font-mono uppercase" invalid={!!errors.code} {...register('code')} />
              <Button variant="secondary" icon={<Wand2 className="h-4 w-4" />} loading={generating} onClick={generate}>
                {t('packages.promo.generate')}
              </Button>
            </div>
          </Field>

          <Field label={t('packages.promo.type')}>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Segmented
                  aria-label={t('packages.promo.type')}
                  size="sm"
                  value={field.value}
                  onChange={field.onChange}
                  className="flex w-full [&>button]:flex-1"
                  options={(['promo', 'school', 'referral', 'campaign'] as const).map((v) => ({ value: v, label: t(`packages.promo.types.${v}`) }))}
                />
              )}
            />
          </Field>

          {promoType === 'school' && (
            <Field label={t('packages.promo.ownerSchool')} htmlFor="pr-owner">
              <Select id="pr-owner" placeholder="—" options={schools.map((s) => ({ value: s.id, label: L(s, 'name') }))} {...register('ownerId')} />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('packages.promo.discountType')} htmlFor="pr-dt">
              <Select id="pr-dt" options={(['percent', 'fixed'] as const).map((v) => ({ value: v, label: t(`packages.promo.discountTypes.${v}`) }))} {...register('discountType')} />
            </Field>
            <Field label={t('packages.promo.discountValue')} required error={errors.discountValue?.message} htmlFor="pr-dv">
              <Input
                id="pr-dv"
                type="number"
                min={1}
                step={discountType === 'percent' ? 1 : 1000}
                suffix={discountType === 'percent' ? '%' : 'IQD'}
                invalid={!!errors.discountValue}
                {...register('discountValue', { valueAsNumber: true })}
              />
            </Field>
          </div>

          <Field label={t('packages.promo.eligibility')} htmlFor="pr-el">
            <Select id="pr-el" options={(['all', 'new_users', 'renewals', 'school_students'] as const).map((v) => ({ value: v, label: t(`packages.promo.eligibilities.${v}`) }))} {...register('eligibility')} />
          </Field>

          <Field label={t('packages.promo.packages')} hint={t('packages.promo.allPackages')}>
            <Controller
              control={control}
              name="packageIds"
              render={({ field }) => (
                <div className="grid gap-2 sm:grid-cols-2">
                  {packages.map((p) => (
                    <label
                      key={p.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition',
                        field.value.includes(p.id) ? 'border-accent/60 bg-accent/[0.06]' : 'border-line hover:border-accent/40',
                      )}
                    >
                      <Checkbox
                        checked={field.value.includes(p.id)}
                        onChange={(e) => field.onChange(e.target.checked ? [...field.value, p.id] : field.value.filter((x) => x !== p.id))}
                      />
                      <span className="truncate">{L(p, 'name')}</span>
                    </label>
                  ))}
                </div>
              )}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('packages.promo.usageLimit')} required error={errors.usageLimit?.message} htmlFor="pr-lim">
              <Input id="pr-lim" type="number" min={1} invalid={!!errors.usageLimit} {...register('usageLimit', { valueAsNumber: true })} />
            </Field>
            <Field label={t('packages.promo.perUserLimit')} required error={errors.perUserLimit?.message} htmlFor="pr-ulim">
              <Input id="pr-ulim" type="number" min={1} invalid={!!errors.perUserLimit} {...register('perUserLimit', { valueAsNumber: true })} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('packages.promo.validFrom')} required error={errors.validFrom?.message} htmlFor="pr-from">
              <Input id="pr-from" type="date" invalid={!!errors.validFrom} {...register('validFrom')} />
            </Field>
            <Field label={t('packages.promo.validTo')} required error={errors.validTo?.message} htmlFor="pr-to">
              <Input id="pr-to" type="date" invalid={!!errors.validTo} {...register('validTo')} />
            </Field>
          </div>

          <Controller
            control={control}
            name="enabled"
            render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label={t('packages.promo.enabled')} disabled={!allowed} />}
          />
        </fieldset>
      </form>
  );
}

/* ─── Redemption history (ADM-PRM-08) ────────────────────────────────────── */

type RedemptionRow = RedemptionDto & { studentName_en: string; studentName_ar: string };

function RedemptionsModal({ promo, onClose }: { promo: PromotionVM; onClose: () => void }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const exp = useExport(`/admin/promotions/${promo.id}/redemptions/export`, `redemptions-${promo.code}`);
  const list = usePagedList({
    key: (p: Query) => qk.promotions.sub('redemptions', promo.id, p),
    fetcher: (p) => promotionsApi.redemptions(promo.id, p),
    pageSize: 10,
  });
  const rows = useMemo<RedemptionRow[]>(
    () => list.items.map((r) => ({ ...r, studentName_en: flatRef(r.student).name_en, studentName_ar: flatRef(r.student).name_ar })),
    [list.items],
  );
  const columns = useMemo<ColumnDef<RedemptionRow>[]>(
    () => [
      {
        id: 'student',
        enableSorting: false,
        accessorFn: (r) => r.studentName_en,
        header: t('common.student'),
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-ink">{L(row.original, 'studentName')}</div>
            <div className="text-[11px] text-muted num" dir="ltr">
              {formatPhone(row.original.student.mobile)}
            </div>
          </div>
        ),
      },
      {
        id: 'ref',
        enableSorting: false,
        accessorKey: 'ref',
        header: t('payments.ref'),
        cell: ({ row }) => (
          <a href={`/payments/transactions/${row.original.paymentId}`} className="font-mono text-xs font-semibold text-primary hover:text-accent hover:underline" dir="ltr">
            {row.original.ref}
          </a>
        ),
      },
      { id: 'discount', enableSorting: false, accessorKey: 'discount', header: t('packages.promo.discount'), meta: { align: 'end' }, cell: ({ row }) => fmtMoney(row.original.discount) },
      { id: 'at', enableSorting: false, accessorKey: 'at', header: t('common.date'), cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted num">{fmtDateTime(row.original.at)}</span> },
    ],
    [t, L],
  );
  return (
    <Modal open onClose={onClose} size="lg" title={t('packages.promo.redemptionsTitle', { code: promo.code })} description={t('packages.promo.redemptionsSub', { used: promo.used, limit: promo.usageLimit })}>
      <DataTable
        bare
        hideSearch
        data={rows}
        columns={columns}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        server={list.server}
        pageSize={10}
        maxHeight="50vh"
        onExport={can('packages', 'export') && list.meta.total > 0 ? () => exp.mutate(exportRequest('csv', list.exportFilters)) : undefined}
        exporting={exp.isPending}
        emptyTitle={t('packages.promo.noRedemptions')}
        emptyHint={t('packages.promo.noRedemptionsHint')}
      />
    </Modal>
  );
}
