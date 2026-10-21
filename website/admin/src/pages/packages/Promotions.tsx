import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Copy, Gauge, Pencil, Plus, Sparkles, Tag, Ticket, Trash2, Wand2 } from 'lucide-react';
import type { Promotion, PromoType } from '@/types';
import { cn } from '@/utils/cn';
import { uid } from '@/utils/id';
import { MOCK_NOW } from '@/utils/random';
import { fmtDate, fmtMoney, fmtNumber } from '@/utils/format';
import { usePackages, useSchools } from '@/store/core';
import { usePromotions } from '@/store/commerce';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
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
  ProgressBar,
  Select,
  Segmented,
  StatCard,
  Switch,
  useConfirm,
  type Tone,
} from '@/components/ui';

const TYPE_TONE: Record<PromoType, Tone> = { promo: 'accent', school: 'info', referral: 'purple', campaign: 'navy' };

type Phase = 'live' | 'upcoming' | 'expired' | 'exhausted' | 'disabled';

function phaseOf(p: Promotion): Phase {
  const now = MOCK_NOW.toISOString();
  if (!p.enabled) return 'disabled';
  if (p.validTo < now) return 'expired';
  if (p.validFrom > now) return 'upcoming';
  if (p.used >= p.usageLimit) return 'exhausted';
  return 'live';
}

const PHASE_TONE: Record<Phase, Tone> = { live: 'success', upcoming: 'info', expired: 'slate', exhausted: 'warning', disabled: 'neutral' };

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `EDU-${Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')}`;
}

export default function Promotions() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const loading = useMockLoading();
  const promos = usePromotions((s) => s.items);
  const update = usePromotions((s) => s.update);
  const remove = usePromotions((s) => s.remove);
  const packages = usePackages((s) => s.items);
  const schools = useSchools((s) => s.items);
  const [type, setType] = useState('');
  const [state, setState] = useState('');
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [drawer, setDrawer] = useState(false);

  const rows = useMemo(
    () => promos.filter((p) => (!type || p.type === type) && (!state || phaseOf(p) === state)),
    [promos, type, state],
  );

  const live = promos.filter((p) => phaseOf(p) === 'live').length;
  const redemptions = promos.reduce((s, p) => s + p.used, 0);
  const nearLimit = promos.filter((p) => p.enabled && p.used / p.usageLimit >= 0.8).length;

  const toggle = (p: Promotion, on: boolean) => {
    update(p.id, { enabled: on }, { action: on ? 'promotion.enable' : 'promotion.disable', summary: `${on ? 'Enabled' : 'Disabled'} promo code ${p.code}` });
    toast.success(t(on ? 'packages.promo.toggledOn' : 'packages.promo.toggledOff', { code: p.code }));
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t('packages.promo.codeCopied', { code }));
    } catch {
      toast.error(t('toast.error'));
    }
  };

  const del = async (p: Promotion) => {
    const ok = await confirm({ title: t('packages.promo.deleteTitle', { code: p.code }), body: t('packages.promo.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    remove(p.id);
    toast.success(t('toast.deleted', { entity: t('packages.promo.entity') }));
  };

  const discountLabel = (p: Promotion) => (p.discountType === 'percent' ? `${p.discountValue}%` : fmtMoney(p.discountValue, 'IQD'));

  const columns = useMemo<ColumnDef<Promotion>[]>(
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
        header: t('packages.promo.type'),
        meta: { label: t('packages.promo.type') },
        cell: ({ row }) => <Badge tone={TYPE_TONE[row.original.type]}>{t(`packages.promo.types.${row.original.type}`)}</Badge>,
      },
      {
        id: 'discount',
        accessorFn: (p) => discountLabel(p),
        header: t('packages.promo.discount'),
        meta: { label: t('packages.promo.discount'), align: 'end' },
        cell: ({ row }) => <span className="font-semibold text-ink">{discountLabel(row.original)}</span>,
      },
      {
        id: 'eligibility',
        accessorFn: (p) => t(`packages.promo.eligibilities.${p.eligibility}`),
        header: t('packages.promo.eligibility'),
        meta: { label: t('packages.promo.eligibility') },
        cell: ({ row }) => (
          <div className="min-w-[9rem]">
            <div className="text-ink/80">{t(`packages.promo.eligibilities.${row.original.eligibility}`)}</div>
            <div className="text-[11px] text-muted">
              {row.original.packageIds.length === 0
                ? t('packages.promo.allPackages')
                : row.original.packageIds.map((id) => L(packages.find((p) => p.id === id), 'name')).join(' · ')}
            </div>
          </div>
        ),
      },
      {
        id: 'usage',
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
        id: 'validity',
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
        accessorFn: (p) => phaseOf(p),
        header: t('common.status'),
        meta: { label: t('common.status') },
        cell: ({ row }) => {
          const ph = phaseOf(row.original);
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
    [t, L, packages, can],
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
        <StatCard loading={loading} label={t('packages.promo.kpiActive')} value={fmtNumber(live)} icon={<Sparkles />} color="#16A34A" hint={`${fmtNumber(promos.length)} ${t('common.total').toLowerCase()}`} />
        <StatCard loading={loading} label={t('packages.promo.kpiRedemptions')} value={fmtNumber(redemptions)} icon={<Ticket />} color="#C9A24A" hint={' '} />
        <StatCard loading={loading} label={t('packages.promo.kpiNearLimit')} value={fmtNumber(nearLimit)} icon={<Gauge />} color="#F59E0B" hint="≥ 80%" />
      </div>

      <DataTable
        data={rows}
        columns={columns}
        loading={loading}
        exportName={can('packages', 'export') ? 'promotions' : undefined}
        searchText={(p) => `${p.code} ${p.type} ${schools.find((s) => s.id === p.ownerId)?.name_en ?? ''}`}
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
    </div>
  );
}

/* ─── Create / edit drawer ───────────────────────────────────────────────── */

function PromotionDrawer({ open, onClose, promo }: { open: boolean; onClose: () => void; promo: Promotion | null }) {
  const { t } = useTranslation();
  const can = useCan();
  const allowed = can('packages', promo ? 'edit' : 'create');
  const formId = 'promo-form';
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
          <Button type="submit" form={formId} disabled={!allowed}>
            {promo ? t('actions.saveChanges') : t('packages.promo.create')}
          </Button>
        </>
      }
    >
      {open && <PromotionForm key={promo?.id ?? 'new'} formId={formId} promo={promo} allowed={allowed} onDone={onClose} />}
    </Drawer>
  );
}

function PromotionForm({ formId, promo, allowed, onDone }: { formId: string; promo: Promotion | null; allowed: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const promos = usePromotions((s) => s.items);
  const add = usePromotions((s) => s.add);
  const update = usePromotions((s) => s.update);
  const packages = usePackages((s) => s.items);
  const schools = useSchools((s) => s.items);

  const schema = z
    .object({
      code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{4,20}$/, t('packages.promo.errors.code')),
      type: z.enum(['promo', 'school', 'referral', 'campaign']),
      discountType: z.enum(['percent', 'fixed']),
      discountValue: z.number({ invalid_type_error: t('packages.promo.errors.value') }).positive(t('packages.promo.errors.value')),
      eligibility: z.enum(['all', 'new_users', 'renewals', 'school_students']),
      packageIds: z.array(z.string()),
      usageLimit: z.number({ invalid_type_error: t('packages.promo.errors.limit') }).int().min(1, t('packages.promo.errors.limit')),
      validFrom: z.string().min(1, t('errors.required')),
      validTo: z.string().min(1, t('errors.required')),
      enabled: z.boolean(),
      ownerId: z.string(),
    })
    .superRefine((v, ctx) => {
      if (v.discountType === 'percent' && v.discountValue > 100) ctx.addIssue({ code: 'custom', path: ['discountValue'], message: t('packages.promo.errors.percent') });
      if (v.validFrom && v.validTo && v.validTo < v.validFrom) ctx.addIssue({ code: 'custom', path: ['validTo'], message: t('packages.promo.errors.dates') });
      if (promos.some((p) => p.code === v.code && p.id !== promo?.id)) ctx.addIssue({ code: 'custom', path: ['code'], message: t('packages.promo.codeTaken') });
    });
  type Form = z.infer<typeof schema>;

  const defaults: Form = promo
    ? { ...promo, validFrom: promo.validFrom.slice(0, 10), validTo: promo.validTo.slice(0, 10), ownerId: promo.ownerId ?? '' }
    : {
        code: randomCode(),
        type: 'promo',
        discountType: 'percent',
        discountValue: 10,
        eligibility: 'all',
        packageIds: [],
        usageLimit: 100,
        validFrom: MOCK_NOW.toISOString().slice(0, 10),
        validTo: new Date(MOCK_NOW.getTime() + 30 * 86_400_000).toISOString().slice(0, 10),
        enabled: true,
        ownerId: '',
      };

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: defaults });

  const discountType = watch('discountType');
  const promoType = watch('type');

  const submit = (v: Form) => {
    const data = {
      ...v,
      validFrom: new Date(`${v.validFrom}T00:00:00+03:00`).toISOString(),
      validTo: new Date(`${v.validTo}T23:59:59+03:00`).toISOString(),
      ownerId: v.type === 'school' && v.ownerId ? v.ownerId : null,
    };
    if (promo) {
      update(promo.id, data);
      toast.success(t('toast.updated', { entity: t('packages.promo.entity') }));
    } else {
      add({ ...data, id: uid('promo'), used: 0 });
      toast.success(t('toast.created', { entity: t('packages.promo.entity') }));
    }
    onDone();
  };

  return (
      <form id={formId} onSubmit={handleSubmit(submit)} noValidate>
        <fieldset disabled={!allowed} className="space-y-5">
          <Field label={t('packages.promo.code')} required error={errors.code?.message} hint={t('packages.promo.codeHint')} htmlFor="pr-code">
            <div className="flex gap-2">
              <Input id="pr-code" dir="ltr" icon={<Tag />} className="flex-1 font-mono uppercase" invalid={!!errors.code} {...register('code')} />
              <Button variant="secondary" icon={<Wand2 className="h-4 w-4" />} onClick={() => setValue('code', randomCode(), { shouldValidate: true })}>
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

          <Field label={t('packages.promo.usageLimit')} required error={errors.usageLimit?.message} htmlFor="pr-lim">
            <Input id="pr-lim" type="number" min={1} invalid={!!errors.usageLimit} {...register('usageLimit', { valueAsNumber: true })} />
          </Field>

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
