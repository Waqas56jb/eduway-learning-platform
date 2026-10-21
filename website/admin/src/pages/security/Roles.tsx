import { useNavigate } from 'react-router-dom';
import { Copy, Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { MODULES, type Role } from '@/types';
import { useAdminUsers, useRoles } from '@/store/core';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { uid } from '@/utils/id';
import { fmtDate, fmtNumber } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, ButtonLink, Card, ProgressBar, SkeletonCard, StatCard, Tooltip, useConfirm } from '@/components/ui';
import { cloneMatrix, countGranted, TOTAL_PERMISSIONS } from '@/components/forms/RoleForm';

export default function Roles() {
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const can = useCan();
  const loading = useMockLoading();
  const roles = useRoles((s) => s.items);
  const addRole = useRoles((s) => s.add);
  const removeRole = useRoles((s) => s.remove);
  const admins = useAdminUsers((s) => s.items);

  const adminsFor = (r: Role) => admins.filter((a) => a.roleId === r.id && a.status !== 'deactivated');

  const clone = (r: Role) => {
    let key = `${r.key}_copy`;
    let n = 2;
    while (roles.some((x) => x.key === key)) key = `${r.key}_copy_${n++}`;
    const copy: Role = {
      ...r,
      id: uid('role'),
      key,
      name_en: t('security.roles.copyOf', { name: r.name_en, lng: 'en' }),
      name_ar: t('security.roles.copyOfAr', { name: r.name_ar }),
      system: false,
      permissions: cloneMatrix(r.permissions),
      createdAt: new Date().toISOString(),
    };
    addRole(copy, { action: 'role.clone', summary: `Cloned role “${r.name_en}” → “${copy.name_en}”` });
    toast.success(t('security.roles.cloned'));
    navigate(`/security/roles/${copy.id}`);
  };

  const del = async (r: Role) => {
    const assigned = adminsFor(r).length;
    if (assigned) {
      toast.error(t('security.roles.deleteBlocked', { count: assigned }));
      return;
    }
    const ok = await confirm({
      title: t('confirm.deleteTitle', { entity: L(r, 'name') }),
      body: t('confirm.deleteBody'),
      confirmText: t('actions.delete'),
      typeToConfirm: r.key,
    });
    if (!ok) return;
    removeRole(r.id);
    toast.success(t('security.roles.deleted'));
  };

  const assignedTotal = admins.filter((a) => a.status !== 'deactivated').length;

  return (
    <>
      <PageHeader
        title={t('security.roles.title')}
        subtitle={t('security.roles.subtitle')}
        actions={
          can('security', 'create') && (
            <ButtonLink to="/security/roles/new" icon={<Plus className="h-4 w-4" />}>
              {t('security.roles.newRole')}
            </ButtonLink>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard loading={loading} label={t('security.roles.totalRoles')} value={fmtNumber(roles.length)} icon={<ShieldCheck />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('security.roles.customRoles')} value={fmtNumber(roles.filter((r) => !r.system).length)} icon={<Copy />} color="#C9A24A" />
        <StatCard loading={loading} label={t('security.roles.assignedAdmins')} value={fmtNumber(assignedTotal)} icon={<Users />} color="#2563EB" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} lines={4} />)
          : roles.map((r) => {
              const granted = countGranted(r.permissions);
              const mods = MODULES.filter((m) => r.permissions[m].view).length;
              const ra = adminsFor(r);
              const locked = r.key === 'super_admin';
              return (
                <Card key={r.id} className="flex flex-col p-5 transition hover:border-accent/40 hover:shadow-soft">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-ink">{L(r, 'name')}</h3>
                        {r.system ? (
                          <Badge tone="navy" icon={<Lock className="h-3 w-3" />}>
                            {t('security.roles.system')}
                          </Badge>
                        ) : (
                          <Badge tone="accent">{t('security.roles.custom')}</Badge>
                        )}
                      </div>
                      <code className="mt-1 block text-[11px] text-muted" dir="ltr">
                        {r.key}
                      </code>
                    </div>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                      <ShieldCheck className="h-5 w-5" />
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-muted">{L(r, 'description')}</p>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-ink/80">{t('security.roles.coverage')}</span>
                      <span className="text-muted num">{t('security.roles.coverageValue', { granted, total: TOTAL_PERMISSIONS })}</span>
                    </div>
                    <ProgressBar value={granted} max={TOTAL_PERMISSIONS} label={t('security.roles.coverage')} />
                    <div className="mt-2 text-xs text-muted">
                      {t('security.roles.modulesAccess')}: <span className="font-semibold text-ink num">{mods}/{MODULES.length}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2 rtl:space-x-reverse">
                        {ra.slice(0, 4).map((a) => (
                          <Tooltip key={a.id} content={a.name}>
                            <Avatar name={a.name} src={a.avatar} size="xs" />
                          </Tooltip>
                        ))}
                      </div>
                      <span className="text-xs text-muted num">{t('security.roles.adminsCount', { count: ra.length })}</span>
                    </div>
                    <span className="text-[11px] text-muted">{fmtDate(r.createdAt)}</span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <ButtonLink to={`/security/roles/${r.id}`} variant="secondary" size="sm" icon={locked ? <Lock className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}>
                      {locked || !can('security', 'edit') ? t('actions.view') : t('security.roles.editPermissions')}
                    </ButtonLink>
                    {can('security', 'create') && (
                      <Button variant="ghost" size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => clone(r)}>
                        {t('actions.clone')}
                      </Button>
                    )}
                    {can('security', 'delete') && !r.system && (
                      <Button variant="ghost" size="sm" className="ms-auto text-danger hover:bg-danger/10 hover:text-danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => del(r)}>
                        {t('actions.delete')}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
      </div>
    </>
  );
}
