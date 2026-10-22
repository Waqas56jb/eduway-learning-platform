import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Globe2, LogOut, Monitor, MonitorSmartphone, Smartphone, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { fmtDateTime, fmtNumber, fmtRelative } from '@/utils/format';
import { exportRequest, useApiMutation, useExport, usePagedList } from '@/api/hooks';
import { qk } from '@/api/keys';
import { securityApi, type AdminSessionVM, type SessionsMeta } from '@/api/security';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, DataTable, StatCard, Tooltip, useConfirm } from '@/components/ui';

type AdminSession = AdminSessionVM;

const isMobile = (s: AdminSession) => s.deviceType !== 'desktop';
const isAbroad = (s: AdminSession) => s.abroad;

export default function Sessions() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const canRevoke = can('security', 'edit');

  const list = usePagedList({
    key: qk.adminSessions.list,
    fetcher: securityApi.sessions,
    initialSort: '-lastActive',
  });
  const sessions = list.items;
  const kpis = (list.meta as SessionsMeta).kpis;
  const loading = list.isLoading;
  const exp = useExport('/admin/admin-sessions/export', 'admin-sessions');

  const adminName = (s: AdminSession) => L({ n_en: s.adminName, n_ar: s.adminName_ar }, 'n');

  const revokeM = useApiMutation((id: string) => securityApi.revokeSession(id), {
    invalidate: [qk.adminSessions.all],
    success: 'security.sessions.revoked',
  });
  const revokeAllM = useApiMutation(() => securityApi.revokeAllSessions(), {
    invalidate: [qk.adminSessions.all],
    success: (r) => t('security.sessions.revokedAll', { count: r.revoked }),
  });

  const revoke = async (s: AdminSession) => {
    if (s.current) {
      toast.error(t('security.sessions.cannotCurrent'));
      return;
    }
    const ok = await confirm({
      title: t('security.sessions.revokeTitle'),
      body: t('security.sessions.revokeBody', { name: adminName(s), device: s.device }),
      confirmText: t('security.sessions.revoke'),
    });
    if (!ok) return;
    revokeM.mutate(s.id);
  };

  const othersCount = Math.max(0, (kpis?.active ?? list.meta.total) - (sessions.some((s) => s.current) ? 1 : 0));

  const revokeAll = async () => {
    const ok = await confirm({
      title: t('security.sessions.revokeAllTitle'),
      body: t('security.sessions.revokeAllBody', { count: othersCount }),
      confirmText: t('security.sessions.revokeAll'),
    });
    if (!ok) return;
    revokeAllM.mutate();
  };

  const columns = useMemo<ColumnDef<AdminSession, unknown>[]>(
    () => [
      {
        id: 'admin',
        accessorFn: (s) => adminName(s),
        enableSorting: false,
        header: t('security.sessions.admin'),
        meta: { label: t('security.sessions.admin') },
        cell: ({ row: { original: s } }) => {
          return (
            <div className="flex items-center gap-2.5">
              <Avatar name={s.adminName || '?'} src={s.adminAvatar} size="sm" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="truncate">{adminName(s)}</span>
                  {s.current && <Badge tone="success" dot>{t('security.sessions.current')}</Badge>}
                </div>
                <div className="truncate text-xs text-muted" dir="ltr">
                  {s.adminEmail}
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
            <Button
              variant="ghost"
              size="xs"
              className="text-danger hover:bg-danger/10 hover:text-danger"
              icon={<LogOut className="h-3.5 w-3.5" />}
              loading={revokeM.isPending && revokeM.variables === s.id}
              onClick={() => revoke(s)}
            >
              {t('security.sessions.revoke')}
            </Button>
          )),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, canRevoke, revokeM.isPending, revokeM.variables],
  );

  return (
    <>
      <PageHeader
        title={t('security.sessions.title')}
        subtitle={t('security.sessions.subtitle')}
        actions={
          canRevoke && (
            <Button variant="danger" icon={<LogOut className="h-4 w-4" />} disabled={othersCount === 0} loading={revokeAllM.isPending} onClick={revokeAll}>
              {t('security.sessions.revokeAll')}
            </Button>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('security.sessions.kpiActive')} value={fmtNumber(kpis?.active ?? list.meta.total)} icon={<MonitorSmartphone />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('security.sessions.kpiAdmins')} value={fmtNumber(kpis?.admins ?? new Set(sessions.map((s) => s.adminId)).size)} icon={<Users />} color="#C9A24A" />
        <StatCard loading={loading} label={t('security.sessions.kpiMobile')} value={fmtNumber(kpis?.mobile ?? sessions.filter(isMobile).length)} icon={<Smartphone />} color="#2563EB" />
        <StatCard loading={loading} label={t('security.sessions.kpiAbroad')} value={fmtNumber(kpis?.abroad ?? sessions.filter(isAbroad).length)} icon={<Globe2 />} color="#F59E0B" />
      </div>

      <DataTable
        data={sessions}
        columns={columns}
        loading={loading}
        error={list.error}
        onRetry={() => list.refetch()}
        server={list.server}
        onExport={can('security', 'export') ? (ids) => exp.mutate(exportRequest('csv', list.exportFilters, ids)) : undefined}
        exporting={exp.isPending}
        rowClassName={(s) => (s.current ? 'bg-success/[0.04]' : undefined)}
      />
    </>
  );
}
