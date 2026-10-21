import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Globe2, LogOut, Monitor, MonitorSmartphone, Smartphone, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { AdminSession } from '@/types';
import { useAdminSessions } from '@/store/security';
import { useAdminUsers } from '@/store/core';
import { useCan } from '@/store/auth';
import { useMockLoading } from '@/hooks/useMockLoading';
import { fmtDateTime, fmtNumber, fmtRelative } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, DataTable, StatCard, Tooltip, useConfirm } from '@/components/ui';

const isMobile = (s: AdminSession) => /iPhone|Galaxy|Redmi|Tab|Android/i.test(s.device);
const isAbroad = (s: AdminSession) => !s.location.endsWith(', IQ');

export default function Sessions() {
  const { t } = useTranslation();
  const can = useCan();
  const confirm = useConfirm();
  const loading = useMockLoading();
  const sessions = useAdminSessions((s) => s.items);
  const remove = useAdminSessions((s) => s.remove);
  const removeMany = useAdminSessions((s) => s.removeMany);
  const admins = useAdminUsers((s) => s.items);
  const canRevoke = can('security', 'edit');

  const adminOf = (id: string) => admins.find((a) => a.id === id);

  const revoke = async (s: AdminSession) => {
    if (s.current) {
      toast.error(t('security.sessions.cannotCurrent'));
      return;
    }
    const a = adminOf(s.adminId);
    const ok = await confirm({
      title: t('security.sessions.revokeTitle'),
      body: t('security.sessions.revokeBody', { name: a?.name ?? '—', device: s.device }),
      confirmText: t('security.sessions.revoke'),
    });
    if (!ok) return;
    remove(s.id, { action: 'admin_session.revoke', summary: `Revoked session of ${a?.email ?? s.adminId} on ${s.device} (${s.ip})` });
    toast.success(t('security.sessions.revoked'));
  };

  const others = sessions.filter((s) => !s.current);

  const revokeAll = async () => {
    const ok = await confirm({
      title: t('security.sessions.revokeAllTitle'),
      body: t('security.sessions.revokeAllBody', { count: others.length }),
      confirmText: t('security.sessions.revokeAll'),
    });
    if (!ok) return;
    removeMany(
      others.map((s) => s.id),
      { action: 'admin_session.revoke_all', summary: `Revoked ${others.length} admin sessions (kept current session)` },
    );
    toast.success(t('security.sessions.revokedAll', { count: others.length }));
  };

  const columns = useMemo<ColumnDef<AdminSession, unknown>[]>(
    () => [
      {
        id: 'admin',
        accessorFn: (s) => adminOf(s.adminId)?.name ?? s.adminId,
        header: t('security.sessions.admin'),
        meta: { label: t('security.sessions.admin') },
        cell: ({ row: { original: s } }) => {
          const a = adminOf(s.adminId);
          return (
            <div className="flex items-center gap-2.5">
              <Avatar name={a?.name ?? '?'} src={a?.avatar} size="sm" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="truncate">{a?.name ?? s.adminId}</span>
                  {s.current && <Badge tone="success" dot>{t('security.sessions.current')}</Badge>}
                </div>
                <div className="truncate text-xs text-muted" dir="ltr">
                  {a?.email}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: 'device',
        accessorKey: 'device',
        header: t('security.sessions.device'),
        meta: { label: t('security.sessions.device') },
        cell: ({ row: { original: s } }) => (
          <span className="inline-flex items-center gap-2">
            {isMobile(s) ? <Smartphone className="h-4 w-4 text-muted" /> : <Monitor className="h-4 w-4 text-muted" />}
            {s.device}
          </span>
        ),
      },
      { id: 'browser', accessorKey: 'browser', header: t('security.sessions.browser'), meta: { label: t('security.sessions.browser') } },
      {
        id: 'ip',
        accessorKey: 'ip',
        header: t('security.sessions.ip'),
        meta: { label: t('security.sessions.ip') },
        cell: ({ getValue }) => (
          <code className="text-xs" dir="ltr">
            {String(getValue())}
          </code>
        ),
      },
      {
        id: 'location',
        accessorKey: 'location',
        header: t('security.sessions.location'),
        meta: { label: t('security.sessions.location') },
        cell: ({ row: { original: s } }) => (
          <span className="inline-flex items-center gap-1.5">
            {s.location}
            {isAbroad(s) && <Badge tone="warning">{t('security.sessions.abroad')}</Badge>}
          </span>
        ),
      },
      {
        id: 'startedAt',
        accessorKey: 'startedAt',
        header: t('security.sessions.started'),
        meta: { label: t('security.sessions.started') },
        cell: ({ getValue }) => <span className="whitespace-nowrap text-ink/80 num">{fmtDateTime(String(getValue()))}</span>,
      },
      {
        id: 'lastActive',
        accessorKey: 'lastActive',
        header: t('security.sessions.lastActive'),
        meta: { label: t('security.sessions.lastActive') },
        cell: ({ getValue }) => <span title={fmtDateTime(String(getValue()))}>{fmtRelative(String(getValue()))}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row: { original: s } }) =>
          canRevoke &&
          (s.current ? (
            <Tooltip content={t('security.sessions.cannotCurrent')} side="bottom">
              <Button variant="ghost" size="xs" disabled aria-label={t('security.sessions.revoke')}>
                {t('security.sessions.revoke')}
              </Button>
            </Tooltip>
          ) : (
            <Button variant="ghost" size="xs" className="text-danger hover:bg-danger/10 hover:text-danger" icon={<LogOut className="h-3.5 w-3.5" />} onClick={() => revoke(s)}>
              {t('security.sessions.revoke')}
            </Button>
          )),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, admins, canRevoke, sessions],
  );

  return (
    <>
      <PageHeader
        title={t('security.sessions.title')}
        subtitle={t('security.sessions.subtitle')}
        actions={
          canRevoke && (
            <Button variant="danger" icon={<LogOut className="h-4 w-4" />} disabled={others.length === 0} onClick={revokeAll}>
              {t('security.sessions.revokeAll')}
            </Button>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('security.sessions.kpiActive')} value={fmtNumber(sessions.length)} icon={<MonitorSmartphone />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('security.sessions.kpiAdmins')} value={fmtNumber(new Set(sessions.map((s) => s.adminId)).size)} icon={<Users />} color="#C9A24A" />
        <StatCard loading={loading} label={t('security.sessions.kpiMobile')} value={fmtNumber(sessions.filter(isMobile).length)} icon={<Smartphone />} color="#2563EB" />
        <StatCard loading={loading} label={t('security.sessions.kpiAbroad')} value={fmtNumber(sessions.filter(isAbroad).length)} icon={<Globe2 />} color="#F59E0B" />
      </div>

      <DataTable
        data={sessions}
        columns={columns}
        loading={loading}
        exportName={can('security', 'export') ? 'admin-sessions' : undefined}
        searchText={(s) => `${adminOf(s.adminId)?.name ?? ''} ${s.device} ${s.browser} ${s.ip} ${s.location}`}
        initialSort={[{ id: 'lastActive', desc: true }]}
        rowClassName={(s) => (s.current ? 'bg-success/[0.04]' : undefined)}
      />
    </>
  );
}
