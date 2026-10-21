import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, MailPlus, MoreHorizontal, Send, ShieldCheck, ShieldOff, UserCheck, UserCog, UserX, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { AdminUser } from '@/types';
import { useAdminUsers, useRoles } from '@/store/core';
import { useAuth, useCan } from '@/store/auth';
import { useAdminSessions } from '@/store/security';
import { logAudit } from '@/store/audit';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { uid } from '@/utils/id';
import { fmtDateTime, fmtNumber, fmtPercent, fmtRelative } from '@/utils/format';
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
  Popover,
  Select,
  StatCard,
  StatusBadge,
  useConfirm,
} from '@/components/ui';

export default function AdminUsers() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const loading = useMockLoading();
  const admins = useAdminUsers((s) => s.items);
  const addAdmin = useAdminUsers((s) => s.add);
  const updateAdmin = useAdminUsers((s) => s.update);
  const roles = useRoles((s) => s.items);
  const meId = useAuth((s) => s.adminId);
  const sessions = useAdminSessions((s) => s.items);
  const removeSessions = useAdminSessions((s) => s.removeMany);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
  const [newRoleId, setNewRoleId] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const roleName = (id: string) => {
    const r = roles.find((x) => x.id === id);
    return r ? L(r, 'name') : '—';
  };

  const roleOptions = roles.map((r) => ({ value: r.id, label: L(r, 'name') }));
  const canEdit = can('security', 'edit');

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
    updateAdmin(a.id, { status: 'deactivated' }, { action: 'admin.deactivate', summary: `Deactivated ${a.email} — ${ok.reason}` });
    const ids = sessions.filter((s) => s.adminId === a.id).map((s) => s.id);
    if (ids.length) removeSessions(ids, { silent: true });
    toast.success(t('security.admins.deactivated'));
  };

  const reactivate = (a: AdminUser) => {
    updateAdmin(a.id, { status: 'active' }, { action: 'admin.reactivate', summary: `Reactivated ${a.email}` });
    toast.success(t('security.admins.reactivated'));
  };

  const resetMfa = async (a: AdminUser) => {
    const ok = await confirm({ title: t('security.admins.resetMfaTitle', { name: a.name }), body: t('security.admins.resetMfaBody'), tone: 'warning', confirmText: t('security.admins.resetMfa') });
    if (!ok) return;
    updateAdmin(a.id, { mfaEnabled: false }, { action: 'admin.reset_mfa', summary: `Reset MFA for ${a.email}` });
    toast.success(t('security.admins.mfaReset'));
  };

  const resend = (a: AdminUser) => {
    logAudit({ action: 'admin.resend_invite', entity: 'admin_user', entityId: a.id, summary: `Re-sent invitation to ${a.email}` });
    toast.success(t('security.admins.inviteResent', { email: a.email }));
  };

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
        accessorFn: (a) => roleName(a.roleId),
        header: t('security.admins.role'),
        meta: { label: t('security.admins.role') },
        cell: ({ getValue }) => <Badge tone="navy">{String(getValue())}</Badge>,
      },
      {
        id: 'mfa',
        accessorFn: (a) => (a.mfaEnabled ? 'on' : 'off'),
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
    [t, L, roles, meId, canEdit, sessions],
  );

  const filtered = admins.filter((a) => (!roleFilter || a.roleId === roleFilter) && (!statusFilter || a.status === statusFilter));
  const active = admins.filter((a) => a.status === 'active');
  const mfaPct = active.length ? (active.filter((a) => a.mfaEnabled).length / active.length) * 100 : 0;

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
        <StatCard loading={loading} label={t('security.admins.kpiTotal')} value={fmtNumber(admins.length)} icon={<Users />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('security.admins.kpiActive')} value={fmtNumber(active.length)} icon={<UserCheck />} color="#16A34A" />
        <StatCard loading={loading} label={t('security.admins.kpiMfa')} value={fmtPercent(mfaPct)} icon={<ShieldCheck />} color="#C9A24A" />
        <StatCard loading={loading} label={t('security.admins.kpiPending')} value={fmtNumber(admins.filter((a) => a.status === 'invited').length)} icon={<Send />} color="#2563EB" />
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        loading={loading}
        exportName={can('security', 'export') ? 'admin-users' : undefined}
        searchText={(a) => `${a.name} ${a.name_ar} ${a.email} ${a.mobile}`}
        initialSort={[{ id: 'lastLogin', desc: true }]}
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
        existingEmails={admins.map((a) => a.email.toLowerCase())}
        onInvite={(v) => {
          const admin: AdminUser = {
            id: uid('adm'),
            name: v.name,
            name_ar: v.name_ar || v.name,
            email: v.email.toLowerCase(),
            mobile: '',
            roleId: v.roleId,
            avatar: '',
            mfaEnabled: false,
            status: 'invited',
            lastLogin: null,
            createdAt: new Date().toISOString(),
          };
          addAdmin(admin, { action: 'admin.invite', summary: `Invited ${admin.email} as ${roleName(v.roleId)}` });
          toast.success(t('security.admins.invited', { email: admin.email }));
          setInviteOpen(false);
        }}
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
              onClick={() => {
                if (!roleTarget) return;
                updateAdmin(roleTarget.id, { roleId: newRoleId }, { action: 'admin.change_role', summary: `Changed ${roleTarget.email} role: ${roleName(roleTarget.roleId)} → ${roleName(newRoleId)}` });
                toast.success(t('security.admins.roleChanged'));
                setRoleTarget(null);
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
  roleId: string;
}

function InviteDrawer({
  open,
  onClose,
  onInvite,
  roleOptions,
  existingEmails,
}: {
  open: boolean;
  onClose: () => void;
  onInvite: (v: InviteValues) => void;
  roleOptions: { value: string; label: string }[];
  existingEmails: string[];
}) {
  const { t } = useTranslation();
  const schema = z.object({
    name: z.string().trim().min(2, t('errors.required')),
    name_ar: z.string().trim(),
    email: z
      .string()
      .trim()
      .email(t('errors.invalidEmail'))
      .refine((e) => !existingEmails.includes(e.toLowerCase()), t('security.admins.emailTaken')),
    roleId: z.string().min(1, t('errors.required')),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteValues>({ resolver: zodResolver(schema), defaultValues: { name: '', name_ar: '', email: '', roleId: 'role_teacher' } });

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
          await new Promise((r) => setTimeout(r, 400));
          onInvite(v);
          reset();
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
        <Field label={t('security.admins.role')} error={errors.roleId?.message} required htmlFor="inv-role">
          <Select id="inv-role" options={roleOptions} invalid={!!errors.roleId} {...register('roleId')} />
        </Field>
      </form>
    </Drawer>
  );
}
