import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Eraser, Eye, Lock, Save, ShieldCheck, Sparkles, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MODULES, type PermissionMatrix } from '@/types';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { cn } from '@/utils/cn';
import { useApiMutation } from '@/api/hooks';
import { qk } from '@/api/keys';
import { isApiError } from '@/api/client';
import { securityApi, useRoleQuery, useRolesQuery, type RoleVM, type RoleWrite } from '@/api/security';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, Field, Input, ProgressBar, SkeletonCard, Textarea } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { cloneMatrix, countGranted, diffPermissions, emptyMatrix, matrix, RoleMatrix, TOTAL_PERMISSIONS } from '@/components/forms/RoleForm';

const READ_ONLY = (): PermissionMatrix =>
  matrix(Object.fromEntries(MODULES.map((m) => [m, ['view']])) as Parameters<typeof matrix>[0]);
const FULL = (): PermissionMatrix => matrix(Object.fromEntries(MODULES.map((m) => [m, '*'])) as Parameters<typeof matrix>[0]);

/** Keyed by id so state never leaks between /new and /:id or across roles. */
export default function RoleEditorPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const q = useRoleQuery(id);
  if (id && q.isLoading) {
    return (
      <div className="grid gap-6 xl:grid-cols-3">
        <SkeletonCard lines={6} />
        <SkeletonCard lines={10} className="xl:col-span-2" />
      </div>
    );
  }
  if (id && q.error) {
    if (isApiError(q.error) && q.error.status === 404) {
      return (
        <>
          <PageHeader title={t('security.roleEditor.notFound')} />
          <Card>
            <EmptyState title={t('security.roleEditor.notFound')} action={<ButtonLink to="/security/roles">{t('actions.back')}</ButtonLink>} />
          </Card>
        </>
      );
    }
    return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  }
  return <RoleEditor key={`${id ?? 'new'}:${q.data?.updatedAt ?? ''}`} id={id} existing={q.data} />;
}

function RoleEditor({ id, existing }: { id?: string; existing?: RoleVM }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const can = useCan();
  const rolesQ = useRolesQuery();
  const roles = useMemo(() => rolesQ.data?.items ?? [], [rolesQ.data]);
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
    setError,
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

  const save = useApiMutation(
    (body: RoleWrite) => (existing ? securityApi.updateRole(existing.id, body) : securityApi.createRole(body)),
    {
      invalidate: [qk.roles.all, qk.me, qk.lookups],
      success: isNew ? 'security.roleEditor.created' : 'security.roleEditor.saved',
      onSuccess: (r) => {
        if (isNew) navigate(`/security/roles/${r.id}`, { replace: true });
      },
      onError: (err) => {
        if (err.code === 'CONFLICT') setError('key', { message: t('security.roleEditor.keyTaken') });
        for (const [f, msg] of Object.entries(err.fields)) {
          const k = f.replace(/^name\.(en|ar)$/, 'name_$1').replace(/^description\.(en|ar)$/, 'description_$1');
          if (['name_en', 'name_ar', 'key', 'description_en', 'description_ar'].includes(k)) setError(k as keyof FormValues, { message: msg });
        }
      },
    },
  );
  const saving = save.isPending;

  const locked = existing?.key === 'super_admin';
  const readOnly = locked || !can('security', isNew ? 'create' : 'edit');
  const changes = diffPermissions(baseline, perms);
  const granted = countGranted(perms);

  const onSubmit = (v: FormValues) => {
    save.mutate({
      key: v.key,
      name: { en: v.name_en, ar: v.name_ar },
      description: { en: v.description_en, ar: v.description_ar },
      permissions: perms,
    });
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
