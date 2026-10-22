import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, MailPlus, MoreHorizontal, Send, ShieldCheck, ShieldOff, UserCheck, UserCog, UserX, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuth, useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { fmtDateTime, fmtNumber, fmtPercent, fmtRelative } from '@/utils/format';
import { isValidPhone, toE164 } from '@/utils/phone';
import { exportRequest, useApiMutation, useExport, usePagedList } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useLookups } from '@/api/lookups';
import { toastError, type ApiError } from '@/api/client';
import { securityApi, type AdminsMeta, type AdminUserVM } from '@/api/security';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  Drawer,
  Field,
  FilterSelect,
  Input,
  MenuDivider,
  MenuItem,
  Modal,
  PhoneInput,
  Popover,
  Select,
  StatCard,
  StatusBadge,
  useConfirm,
} from '@/components/ui';

type AdminUser = AdminUserVM;

export default function AdminUsers() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const lookups = useLookups();
  const roles = lookups.roles;
  const meId = useAuth((s) => s.adminId);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
  const [newRoleId, setNewRoleId] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const list = usePagedList({
    key: qk.admins.list,
    fetcher: securityApi.admins,
    filters: { roleId: roleFilter, status: statusFilter },
    initialSort: '-lastLogin',
  });
  const admins = list.items;
  const stats = (list.meta as AdminsMeta).stats;
  const loading = list.isLoading;
  const exp = useExport('/admin/admins/export', 'admin-users');

  const roleName = (a: AdminUser) => {
    const r = roles.find((x) => x.id === a.roleId);
    if (r) return L(r, 'name');
    return L({ n_en: a.roleName_en, n_ar: a.roleName_ar }, 'n');
  };

  const roleOptions = roles.map((r) => ({ value: r.id, label: L(r, 'name') }));
  const canEdit = can('security', 'edit');

  const inv = [qk.admins.all, qk.roles.all, qk.lookups, qk.adminSessions.all];
  const deactivateM = useApiMutation((v: { id: string; reason: string }) => securityApi.deactivate(v.id, v.reason), { invalidate: inv, success: 'security.admins.deactivated' });
  const activateM = useApiMutation((id: string) => securityApi.activate(id), { invalidate: inv, success: 'security.admins.reactivated' });
  const resetMfaM = useApiMutation((id: string) => securityApi.resetMfa(id), { invalidate: [qk.admins.all], success: 'security.admins.mfaReset' });
  const resendM = useApiMutation((a: AdminUser) => securityApi.resendInvite(a.id), {
    success: (_d, a) => t('security.admins.inviteResent', { email: a.email }),
  });
  const changeRoleM = useApiMutation((v: { id: string; roleId: string }) => securityApi.changeRole(v.id, v.roleId), {
    invalidate: [qk.admins.all, qk.roles.all],
    success: 'security.admins.roleChanged',
    onSuccess: () => setRoleTarget(null),
  });
  const inviteM = useApiMutation(
    (v: InviteValues) =>
      securityApi.invite({ name: { en: v.name.trim(), ar: v.name_ar.trim() || v.name.trim() }, email: v.email.trim().toLowerCase(), roleId: v.roleId, mobile: v.mobile.trim() ? (toE164(v.mobile) ?? v.mobile.trim()) : null }),
    {
      invalidate: [qk.admins.all, qk.roles.all, qk.lookups],
      success: (a) => t('security.admins.invited', { email: a.email }),
      silentError: true,
    },
  );

  const deactivate = async (a: AdminUser) => {
    if (a.id === meId) {
      toast.error(t('security.admins.cannotSelf'));
      return;
    }
    const ok = await confirm({
      title: t('security.admins.deactivateTitle', { name: a.name }),
      body: t('security.admins.deactivateBody'),
      confirmText: t('actions.deactivate'),
      reason: true,
    });
    if (!ok) return;
    deactivateM.mutate({ id: a.id, reason: ok.reason });
  };

  const reactivate = (a: AdminUser) => activateM.mutate(a.id);

  const resetMfa = async (a: AdminUser) => {
    const ok = await confirm({ title: t('security.admins.resetMfaTitle', { name: a.name }), body: t('security.admins.resetMfaBody'), tone: 'warning', confirmText: t('security.admins.resetMfa') });
    if (!ok) return;
    resetMfaM.mutate(a.id);
  };

  const resend = (a: AdminUser) => resendM.mutate(a);

  const columns = useMemo<ColumnDef<AdminUser, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (a) => a.name,
        header: t('common.name'),
        meta: { label: t('common.name') },
        cell: ({ row: { original: a } }) => (
          <div className="flex items-center gap-3">
            <Avatar name={a.name} src={a.avatar} size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-medium text-ink">
                <span className="truncate">{L(a, 'name') !== '—' ? L(a, 'name') : a.name}</span>
                {a.id === meId && <Badge tone="accent">{t('security.admins.you')}</Badge>}
              </div>
              <div className="truncate text-xs text-muted" dir="ltr">
                {a.email}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'role',
        accessorFn: (a) => roleName(a),
        enableSorting: false,
        header: t('security.admins.role'),
        meta: { label: t('security.admins.role') },
        cell: ({ getValue }) => <Badge tone="navy">{String(getValue())}</Badge>,
      },
      {
        id: 'mfa',
        accessorFn: (a) => (a.mfaEnabled ? 'on' : 'off'),
        enableSorting: false,
        header: t('security.admins.mfa'),
        meta: { label: t('security.admins.mfa') },
        cell: ({ row: { original: a } }) =>
          a.mfaEnabled ? (
            <Badge tone="success" icon={<ShieldCheck className="h-3 w-3" />}>
              {t('security.admins.mfaOn')}
            </Badge>
          ) : (
            <Badge tone="warning" icon={<ShieldOff className="h-3 w-3" />}>
              {t('security.admins.mfaOff')}
            </Badge>
          ),
      },
      {
        id: 'lastLogin',
        accessorFn: (a) => a.lastLogin ?? '',
        header: t('security.admins.lastLogin'),
        meta: { label: t('security.admins.lastLogin') },
        cell: ({ row: { original: a } }) =>
          a.lastLogin ? (
            <span title={fmtDateTime(a.lastLogin)} className="text-ink/80">
              {fmtRelative(a.lastLogin)}
            </span>
          ) : (
            <span className="text-muted">{t('security.admins.never')}</span>
          ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t('common.status'),
        meta: { label: t('common.status') },
        cell: ({ row: { original: a } }) => <StatusBadge status={a.status} />,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end', className: 'w-14' },
        cell: ({ row: { original: a } }) =>
          canEdit ? (
            <Popover
              panelClassName="w-56"
              trigger={({ toggle, open }) => (
                <Button variant="ghost" size="icon-sm" onClick={toggle} aria-expanded={open} aria-label={t('actions.more')}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              )}
            >
              {(close) => (
                <div role="menu">
                  <MenuItem
                    icon={<UserCog />}
                    disabled={a.status === 'deactivated'}
                    onClick={() => {
                      setRoleTarget(a);
                      setNewRoleId(a.roleId);
                      close();
                    }}
                  >
                    {t('security.admins.changeRole')}
                  </MenuItem>
                  {a.status === 'invited' && (
                    <MenuItem icon={<Send />} onClick={() => { resend(a); close(); }}>
                      {t('security.admins.resendInvite')}
                    </MenuItem>
                  )}
                  {a.mfaEnabled && (
                    <MenuItem icon={<KeyRound />} onClick={() => { close(); resetMfa(a); }}>
                      {t('security.admins.resetMfa')}
                    </MenuItem>
                  )}
                  <MenuDivider />
                  {a.status === 'deactivated' ? (
                    <MenuItem icon={<UserCheck />} onClick={() => { reactivate(a); close(); }}>
                      {t('actions.activate')}
                    </MenuItem>
                  ) : (
                    <MenuItem danger icon={<UserX />} disabled={a.id === meId} onClick={() => { close(); deactivate(a); }}>
                      {t('actions.deactivate')}
                    </MenuItem>
                  )}
                </div>
              )}
            </Popover>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, roles, meId, canEdit],
  );

  const total = stats?.total ?? list.meta.total;
  const activeCount = stats?.active ?? admins.filter((a) => a.status === 'active').length;
  const mfaPct = stats?.mfaPct ?? (activeCount ? (admins.filter((a) => a.status === 'active' && a.mfaEnabled).length / activeCount) * 100 : 0);
  const invitedCount = stats?.invited ?? admins.filter((a) => a.status === 'invited').length;

  return (
    <>
      <PageHeader
        title={t('security.admins.title')}
        subtitle={t('security.admins.subtitle')}
        actions={
          can('security', 'create') && (
            <Button icon={<MailPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>
              {t('security.admins.invite')}
            </Button>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('security.admins.kpiTotal')} value={fmtNumber(total)} icon={<Users />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('security.admins.kpiActive')} value={fmtNumber(activeCount)} icon={<UserCheck />} color="#16A34A" />
        <StatCard loading={loading} label={t('security.admins.kpiMfa')} value={fmtPercent(mfaPct)} icon={<ShieldCheck />} color="#C9A24A" />
        <StatCard loading={loading} label={t('security.admins.kpiPending')} value={fmtNumber(invitedCount)} icon={<Send />} color="#2563EB" />
      </div>

      <DataTable
        data={admins}
        columns={columns}
        loading={loading}
        error={list.error}
        onRetry={() => list.refetch()}
        server={list.server}
        onExport={can('security', 'export') ? (ids) => exp.mutate(exportRequest('csv', list.exportFilters, ids)) : undefined}
        exporting={exp.isPending}
        toolbar={
          <>
            <FilterSelect label={t('security.admins.role')} value={roleFilter} onChange={setRoleFilter} options={roleOptions} />
            <FilterSelect
              label={t('common.status')}
              value={statusFilter}
              onChange={setStatusFilter}
              options={(['active', 'invited', 'deactivated'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))}
            />
          </>
        }
      />

      <InviteDrawer
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roleOptions={roleOptions}
        onInvite={(v) =>
          inviteM.mutateAsync(v).then(
            () => {
              setInviteOpen(false);
              return null;
            },
            (err: ApiError) => err,
          )
        }
      />

      <Modal
        open={!!roleTarget}
        onClose={() => setRoleTarget(null)}
        size="sm"
        title={roleTarget ? t('security.admins.changeRoleTitle', { name: roleTarget.name }) : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRoleTarget(null)}>
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={!roleTarget || newRoleId === roleTarget.roleId}
              loading={changeRoleM.isPending}
              onClick={() => {
                if (!roleTarget) return;
                changeRoleM.mutate({ id: roleTarget.id, roleId: newRoleId });
              }}
            >
              {t('actions.saveChanges')}
            </Button>
          </>
        }
      >
        <Field label={t('security.admins.role')} htmlFor="change-role">
          <Select id="change-role" value={newRoleId} onChange={(e) => setNewRoleId(e.target.value)} options={roleOptions} />
        </Field>
      </Modal>
    </>
  );
}

interface InviteValues {
  name: string;
  name_ar: string;
  email: string;
  mobile: string;
  roleId: string;
}

function InviteDrawer({
  open,
  onClose,
  onInvite,
  roleOptions,
}: {
  open: boolean;
  onClose: () => void;
  /** Resolves to `null` on success or the API error. */
  onInvite: (v: InviteValues) => Promise<ApiError | null>;
  roleOptions: { value: string; label: string }[];
}) {
  const { t } = useTranslation();
  const schema = z.object({
    name: z.string().trim().min(2, t('errors.required')),
    name_ar: z.string().trim(),
    email: z.string().trim().email(t('errors.invalidEmail')),
    mobile: z.string().trim().refine((m) => !m || isValidPhone(m), t('phone.invalid')),
    roleId: z.string().min(1, t('errors.required')),
  });
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InviteValues>({ resolver: zodResolver(schema), defaultValues: { name: '', name_ar: '', email: '', mobile: '', roleId: '' } });

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      width="md"
      title={t('security.admins.inviteTitle')}
      description={t('security.admins.inviteSub')}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" form="invite-form" loading={isSubmitting} icon={<Send className="h-4 w-4" />}>
            {t('actions.invite')}
          </Button>
        </>
      }
    >
      <form
        id="invite-form"
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (v) => {
          const err = await onInvite(v);
          if (!err) {
            reset();
            return;
          }
          if (err.code === 'CONFLICT') setError('email', { message: t('security.admins.emailTaken') });
          else if (err.fields.email) setError('email', { message: err.fields.email });
          else if (err.fields.mobile) setError('mobile', { message: err.fields.mobile });
          else if (err.fields.roleId) setError('roleId', { message: err.fields.roleId });
          else if (err.fields['name.en']) setError('name', { message: err.fields['name.en'] });
          else toastError(err);
        })}
      >
        <Field label={t('security.admins.fullName')} error={errors.name?.message} required htmlFor="inv-name">
          <Input id="inv-name" invalid={!!errors.name} placeholder="Zaid Al-Lami" {...register('name')} />
        </Field>
        <Field label={t('security.admins.fullNameAr')} htmlFor="inv-name-ar">
          <Input id="inv-name-ar" dir="rtl" placeholder="زيد اللامي" {...register('name_ar')} />
        </Field>
        <Field label={t('common.email')} error={errors.email?.message} required htmlFor="inv-email">
          <Input id="inv-email" type="email" dir="ltr" invalid={!!errors.email} placeholder="name@eduway.iq" {...register('email')} />
        </Field>
        <Field label={t('security.admins.mobileOptional')} hint={t('phone.hint')} error={errors.mobile?.message} htmlFor="inv-mobile">
          <Controller
            control={control}
            name="mobile"
            render={({ field }) => (
              <PhoneInput id="inv-mobile" name={field.name} ref={field.ref} value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.mobile} />
            )}
          />
        </Field>
        <Field label={t('security.admins.role')} error={errors.roleId?.message} required htmlFor="inv-role">
          <Select id="inv-role" options={[{ value: '', label: t('security.admins.selectRole') }, ...roleOptions]} invalid={!!errors.roleId} {...register('roleId')} />
        </Field>
      </form>
    </Drawer>
  );
}
