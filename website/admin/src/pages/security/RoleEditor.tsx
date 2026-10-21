import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Eraser, Eye, Lock, Save, ShieldCheck, Sparkles, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ACTIONS, MODULES, type PermissionMatrix, type Role } from '@/types';
import { useRoles } from '@/store/core';
import { useCan } from '@/store/auth';
import { logAudit } from '@/store/audit';
import { emptyMatrix, matrix } from '@/data/security';
import { useLocalize } from '@/hooks/useLocale';
import { uid } from '@/utils/id';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, Field, Input, ProgressBar, Textarea } from '@/components/ui';
import { cloneMatrix, countGranted, diffPermissions, RoleMatrix, TOTAL_PERMISSIONS } from '@/components/forms/RoleForm';

const READ_ONLY = (): PermissionMatrix =>
  matrix(Object.fromEntries(MODULES.map((m) => [m, ['view']])) as Parameters<typeof matrix>[0]);
const FULL = (): PermissionMatrix => matrix(Object.fromEntries(MODULES.map((m) => [m, '*'])) as Parameters<typeof matrix>[0]);

/** Keyed by id so state never leaks between /new and /:id or across roles. */
export default function RoleEditorPage() {
  const { id } = useParams();
  return <RoleEditor key={id ?? 'new'} id={id} />;
}

function RoleEditor({ id }: { id?: string }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const can = useCan();
  const roles = useRoles((s) => s.items);
  const addRole = useRoles((s) => s.add);
  const updateRole = useRoles((s) => s.update);
  const existing = id ? roles.find((r) => r.id === id) : undefined;
  const isNew = !id;

  const schema = useMemo(
    () =>
      z.object({
        name_en: z.string().trim().min(2, t('security.roleEditor.nameRequired')),
        name_ar: z.string().trim().min(2, t('security.roleEditor.nameRequired')),
        key: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9_]{2,40}$/, t('security.roleEditor.keyInvalid'))
          .refine((k) => !roles.some((r) => r.key === k && r.id !== id), t('security.roleEditor.keyTaken')),
        description_en: z.string().trim(),
        description_ar: z.string().trim(),
      }),
    [roles, id, t],
  );
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name_en: existing?.name_en ?? '',
      name_ar: existing?.name_ar ?? '',
      key: existing?.key ?? '',
      description_en: existing?.description_en ?? '',
      description_ar: existing?.description_ar ?? '',
    },
  });

  const baseline = useMemo(() => (existing ? cloneMatrix(existing.permissions) : emptyMatrix()), [existing]);
  const [perms, setPerms] = useState<PermissionMatrix>(() => (existing ? cloneMatrix(existing.permissions) : READ_ONLY()));
  const [saving, setSaving] = useState(false);

  if (id && !existing) {
    return (
      <>
        <PageHeader title={t('security.roleEditor.notFound')} />
        <Card>
          <EmptyState title={t('security.roleEditor.notFound')} action={<ButtonLink to="/security/roles">{t('actions.back')}</ButtonLink>} />
        </Card>
      </>
    );
  }

  const locked = existing?.key === 'super_admin';
  const readOnly = locked || !can('security', isNew ? 'create' : 'edit');
  const changes = diffPermissions(baseline, perms);
  const granted = countGranted(perms);

  const onSubmit = async (v: FormValues) => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    if (isNew) {
      const role: Role = { id: uid('role'), ...v, system: false, permissions: perms, createdAt: new Date().toISOString() };
      addRole(role, { summary: `Created role “${v.name_en}” with ${countGranted(perms)} permissions` });
      toast.success(t('security.roleEditor.created'));
      navigate(`/security/roles/${role.id}`, { replace: true });
    } else if (existing) {
      updateRole(existing.id, { ...v, permissions: perms }, { silent: true });
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const k of changes) {
        const [m, a] = k.split('.') as [keyof PermissionMatrix, (typeof ACTIONS)[number]];
        before[k] = baseline[m][a];
        after[k] = perms[m][a];
      }
      (Object.keys(v) as (keyof FormValues)[]).forEach((k) => {
        if (existing[k] !== v[k]) {
          before[k] = existing[k];
          after[k] = v[k];
        }
      });
      logAudit({
        action: 'role.update',
        entity: 'role',
        entityId: existing.id,
        summary: changes.length
          ? `Updated ${changes.length} permission(s) on “${v.name_en}”: ${changes.slice(0, 4).join(', ')}${changes.length > 4 ? '…' : ''}`
          : `Updated details of role “${v.name_en}”`,
        before,
        after,
      });
      reset(v);
      toast.success(t('security.roleEditor.saved'));
    }
    setSaving(false);
  };

  const discard = () => {
    reset();
    setPerms(existing ? cloneMatrix(existing.permissions) : READ_ONLY());
  };

  const dirty = isDirty || changes.length > 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <PageHeader
        title={isNew ? t('security.roleEditor.newTitle') : L(existing, 'name')}
        subtitle={t('security.roleEditor.subtitle')}
        current={isNew ? t('security.roleEditor.newTitle') : L(existing, 'name')}
        meta={
          existing && (
            <>
              {existing.system ? (
                <Badge tone="navy" icon={<Lock className="h-3 w-3" />}>
                  {t('security.roles.system')}
                </Badge>
              ) : (
                <Badge tone="accent">{t('security.roles.custom')}</Badge>
              )}
              <code className="text-xs text-muted" dir="ltr">
                {existing.key}
              </code>
            </>
          )
        }
        actions={
          <ButtonLink to="/security/roles" variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>
            {t('actions.back')}
          </ButtonLink>
        }
      />

      {locked && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/[0.07] px-4 py-3 text-sm text-ink">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          {t('security.roleEditor.protected')}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader title={t('security.roleEditor.details')} icon={<ShieldCheck className="h-4 w-4" />} />
          <div className="space-y-4 p-5">
            <Field label={t('common.nameEn')} error={errors.name_en?.message} required htmlFor="r-name-en">
              <Input id="r-name-en" disabled={readOnly} invalid={!!errors.name_en} {...register('name_en')} />
            </Field>
            <Field label={t('common.nameAr')} error={errors.name_ar?.message} required htmlFor="r-name-ar">
              <Input id="r-name-ar" dir="rtl" disabled={readOnly} invalid={!!errors.name_ar} {...register('name_ar')} />
            </Field>
            <Field label={t('security.roleEditor.key')} hint={t('security.roleEditor.keyHint')} error={errors.key?.message} required htmlFor="r-key">
              <Input id="r-key" dir="ltr" disabled={readOnly || !!existing?.system} invalid={!!errors.key} placeholder="regional_manager" {...register('key')} />
            </Field>
            <Field label={t('common.descriptionEn')} htmlFor="r-desc-en">
              <Textarea id="r-desc-en" rows={3} disabled={readOnly} {...register('description_en')} />
            </Field>
            <Field label={t('common.descriptionAr')} htmlFor="r-desc-ar">
              <Textarea id="r-desc-ar" dir="rtl" rows={3} disabled={readOnly} {...register('description_ar')} />
            </Field>
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium">{t('security.roles.coverage')}</span>
                <span className="text-muted num">{t('security.roles.coverageValue', { granted, total: TOTAL_PERMISSIONS })}</span>
              </div>
              <ProgressBar value={granted} max={TOTAL_PERMISSIONS} label={t('security.roles.coverage')} />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader
            title={t('security.roleEditor.permissions')}
            subtitle={t('security.roleEditor.permissionsHint')}
            action={
              !readOnly && (
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="secondary" size="xs" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => setPerms(READ_ONLY())}>
                    {t('security.roleEditor.presetReadOnly')}
                  </Button>
                  <Button variant="secondary" size="xs" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => setPerms(FULL())}>
                    {t('security.roleEditor.presetFull')}
                  </Button>
                  <Button variant="ghost" size="xs" icon={<Eraser className="h-3.5 w-3.5" />} onClick={() => setPerms(emptyMatrix())}>
                    {t('security.roleEditor.presetClear')}
                  </Button>
                </div>
              )
            }
          />
          <RoleMatrix value={perms} onChange={setPerms} baseline={isNew ? undefined : baseline} readOnly={readOnly} />
        </Card>
      </div>

      {!readOnly && (
        <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-line bg-surface/95 backdrop-blur lg:-mx-8">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8">
            <span className={cn('text-sm', changes.length ? 'font-semibold text-accent' : 'text-muted')}>
              {changes.length ? t('security.roleEditor.changed', { count: changes.length }) : dirty ? t('common.unsavedChanges') : t('security.roleEditor.noChanges')}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" icon={<Undo2 className="h-4 w-4" />} onClick={discard} disabled={!dirty}>
                {t('security.roleEditor.discard')}
              </Button>
              <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />} disabled={!isNew && !dirty}>
                {isNew ? t('actions.create') : t('actions.saveChanges')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
