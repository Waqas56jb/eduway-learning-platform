import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Lock, LockOpen, UserCheck, UserRoundX, Users, Hourglass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, DataTable, DateRangePicker, FilterSelect, StatCard, StatusBadge, useConfirm } from '@/components/ui';
import { useLang } from '@/hooks/useLocale';
import { useCan } from '@/store/auth';
import { rangeFromPreset, type DateRange } from '@/store/ui';
import { fmtDate, fmtNumber, fmtRelative } from '@/utils/format';
import { formatPhone } from '@/utils/phone';
import { useApiMutation, useApiQuery, useExport, usePagedList, exportRequest } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useLookups } from '@/api/lookups';
import { studentsApi, type AcquisitionSource, type AdminStudentRow, type SubscriptionStatus } from '@/api/students';
import type { BulkResult, Platform } from '@/api/types';
import toast from 'react-hot-toast';
import { PlatformBadges } from './detail/shared';

const STATUSES: SubscriptionStatus[] = ['active', 'trial', 'expired', 'cancelled', 'none'];
const SOURCES: AcquisitionSource[] = ['organic', 'school', 'marketer', 'referral', 'campaign'];
const PLATFORMS: Platform[] = ['web', 'ios', 'android'];

export default function UsersList() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const can = useCan();
  const confirm = useConfirm();
  const lookups = useLookups();

  const [status, setStatus] = useState('');
  const [pkg, setPkg] = useState('');
  const [gov, setGov] = useState('');
  const [school, setSchool] = useState('');
  const [source, setSource] = useState('');
  const [platform, setPlatform] = useState('');
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset('12m'));

  const filters = useMemo(
    () => ({
      status,
      packageId: pkg,
      governorateId: gov,
      schoolId: school,
      source,
      platform,
      createdFrom: range.from,
      createdTo: range.to,
    }),
    [status, pkg, gov, school, source, platform, range],
  );

  const list = usePagedList<AdminStudentRow>({ key: qk.students.list, fetcher: studentsApi.list, filters, initialSort: '-createdAt' });
  const statsQ = useApiQuery(qk.students.sub('stats'), studentsApi.stats);
  const stats = statsQ.data;

  const activeFilters = [status, pkg, gov, school, source, platform].filter(Boolean).length + (range.preset === '12m' ? 0 : 1);
  const clearFilters = () => {
    setStatus('');
    setPkg('');
    setGov('');
    setSchool('');
    setSource('');
    setPlatform('');
    setRange(rangeFromPreset('12m'));
  };

  const columns = useMemo<ColumnDef<AdminStudentRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (s) => s.name[lang],
        header: t('users.cols.student'),
        meta: { label: t('users.cols.student') },
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex min-w-[13rem] items-center gap-3">
            <Avatar name={row.original.name.en} src={row.original.avatarUrl ?? undefined} size="sm" />
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{row.original.name[lang]}</div>
              <div className="text-xs text-muted num">{row.original.id.slice(0, 8)}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'mobile',
        header: t('users.cols.mobile'),
        meta: { label: t('users.cols.mobile') },
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap num" dir="ltr">
            {formatPhone(getValue<string>())}
          </span>
        ),
      },
      {
        id: 'governorate',
        accessorFn: (s) => s.governorate?.name[lang] ?? '—',
        header: t('users.cols.governorate'),
        meta: { label: t('users.cols.governorate') },
        enableSorting: false,
      },
      {
        id: 'school',
        accessorFn: (s) => s.school?.name[lang] ?? s.schoolName ?? '—',
        header: t('users.cols.school'),
        meta: { label: t('users.cols.school') },
        enableSorting: false,
        cell: ({ getValue }) => <span className="block max-w-[14rem] truncate text-ink/80">{getValue<string>()}</span>,
      },
      {
        id: 'package',
        accessorFn: (s) => s.package?.name[lang] ?? t('users.filters.noPackage'),
        header: t('users.cols.package'),
        meta: { label: t('users.cols.package') },
        enableSorting: false,
        cell: ({ row, getValue }) =>
          row.original.packageId ? <span className="whitespace-nowrap text-ink/85">{getValue<string>()}</span> : <span className="text-muted">—</span>,
      },
      {
        id: 'subscriptionStatus',
        accessorKey: 'subscriptionStatus',
        header: t('users.cols.subscription'),
        meta: { label: t('users.cols.subscription') },
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={row.original.subscriptionStatus} />
            {row.original.locked && (
              <Badge tone="danger" icon={<Lock className="h-3 w-3" />}>
                {t('status.locked')}
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: 'source',
        accessorFn: (s) => t(`users.source.${s.source}`),
        header: t('users.cols.source'),
        meta: { label: t('users.cols.source') },
        enableSorting: false,
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <div className="text-ink/85">{t(`users.source.${row.original.source}`)}</div>
            {row.original.referralCode && <div className="text-[11px] text-muted num">{row.original.referralCode}</div>}
          </div>
        ),
      },
      {
        id: 'platforms',
        accessorFn: (s) => s.platforms.join(', '),
        header: t('users.cols.platforms'),
        meta: { label: t('users.cols.platforms') },
        enableSorting: false,
        cell: ({ row }) => <PlatformBadges platforms={row.original.platforms} />,
      },
      {
        accessorKey: 'lastActive',
        header: t('users.cols.lastActive'),
        meta: { label: t('users.cols.lastActive') },
        cell: ({ getValue }) => <span className="whitespace-nowrap text-ink/80">{fmtRelative(getValue<string | null>())}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: t('users.cols.created'),
        meta: { label: t('users.cols.created') },
        cell: ({ getValue }) => <span className="whitespace-nowrap text-ink/80">{fmtDate(getValue<string>())}</span>,
      },
    ],
    [t, lang],
  );

  const bulkResultToast = (r: BulkResult, okKey: string) => {
    toast.success(t(okKey, { count: r.succeeded.length }));
    if (r.failed.length) toast.error(t('api.bulkPartial', { count: r.failed.length }));
  };
  const lockMut = useApiMutation((v: { ids: string[]; reason: string }) => studentsApi.bulkLock(v.ids, v.reason), {
    invalidate: [qk.students.all],
    onSuccess: (r) => bulkResultToast(r, 'users.bulk.locked'),
  });
  const unlockMut = useApiMutation((v: { ids: string[]; reason?: string }) => studentsApi.bulkUnlock(v.ids, v.reason), {
    invalidate: [qk.students.all],
    onSuccess: (r) => bulkResultToast(r, 'users.bulk.unlocked'),
  });
  const exp = useExport('/admin/students/export', 'students');

  const bulkLock = async (rows: AdminStudentRow[], lock: boolean, clear: () => void) => {
    const ok = await confirm({
      title: t(lock ? 'users.bulk.lockTitle' : 'users.bulk.unlockTitle', { count: rows.length }),
      body: t(lock ? 'users.bulk.lockBody' : 'users.bulk.unlockBody'),
      tone: lock ? 'danger' : 'primary',
      confirmText: t(lock ? 'users.bulk.lock' : 'users.bulk.unlock'),
      reason: lock,
    });
    if (!ok) return;
    const ids = rows.map((r) => r.id);
    if (lock) await lockMut.mutateAsync({ ids, reason: ok.reason }).catch(() => undefined);
    else await unlockMut.mutateAsync({ ids, reason: ok.reason }).catch(() => undefined);
    clear();
  };

  const canEdit = can('users', 'edit');
  const canExport = can('users', 'export');
  const statsLoading = statsQ.isLoading;

  return (
    <div>
      <PageHeader title={t('users.title')} subtitle={t('users.subtitle')} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={statsLoading} label={t('users.stats.total')} value={fmtNumber(stats?.total ?? 0)} icon={<Users />} color="#0B1F3A" hint=" " />
        <StatCard loading={statsLoading} label={t('users.stats.active')} value={fmtNumber(stats?.active ?? 0)} icon={<UserCheck />} color="#16A34A" hint=" " onClick={() => setStatus('active')} />
        <StatCard loading={statsLoading} label={t('users.stats.trial')} value={fmtNumber(stats?.trial ?? 0)} icon={<Hourglass />} color="#2563EB" hint=" " onClick={() => setStatus('trial')} />
        <StatCard loading={statsLoading} label={t('users.stats.locked')} value={fmtNumber(stats?.locked ?? 0)} icon={<UserRoundX />} color="#DC2626" hint=" " onClick={() => setStatus('locked')} />
      </div>

      <DataTable
        data={list.items}
        columns={columns}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        server={list.server}
        onRowClick={(s) => navigate(`/users/${s.id}`)}
        onExport={canExport ? () => exp.mutate(exportRequest('csv', list.exportFilters)) : undefined}
        exporting={exp.isPending}
        initialHidden={['source', 'platforms']}
        rowClassName={(s) => (s.locked ? 'opacity-75' : undefined)}
        toolbar={
          <>
            <FilterSelect
              label={t('users.filters.status')}
              value={status}
              onChange={setStatus}
              options={[...STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })), { value: 'locked', label: t('users.filters.locked') }]}
            />
            <FilterSelect
              label={t('users.filters.package')}
              value={pkg}
              onChange={setPkg}
              options={[...lookups.packages.map((p) => ({ value: p.id, label: p.name[lang] })), { value: '__none', label: t('users.filters.noPackage') }]}
            />
            <FilterSelect label={t('users.filters.governorate')} value={gov} onChange={setGov} options={lookups.governorates.map((g) => ({ value: g.id, label: g.name[lang] }))} />
            <FilterSelect
              label={t('users.filters.school')}
              value={school}
              onChange={setSchool}
              className="max-w-[14rem]"
              options={[...lookups.schools.map((s) => ({ value: s.id, label: s.name[lang] })), { value: '__none', label: t('users.filters.noSchool') }]}
            />
            <FilterSelect label={t('users.filters.source')} value={source} onChange={setSource} options={SOURCES.map((s) => ({ value: s, label: t(`users.source.${s}`) }))} />
            <FilterSelect
              label={t('users.filters.platform')}
              value={platform}
              onChange={setPlatform}
              options={PLATFORMS.map((p) => ({ value: p, label: p === 'ios' ? 'iOS' : p === 'android' ? 'Android' : 'Web' }))}
            />
            <DateRangePicker value={range} onChange={setRange} align="start" />
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                {t('actions.clearFilters')} ({activeFilters})
              </Button>
            )}
          </>
        }
        bulkActions={
          canEdit || canExport
            ? (rows, clear) => (
                <>
                  {canEdit && (
                    <>
                      <Button size="sm" variant="secondary" loading={lockMut.isPending} icon={<Lock className="h-4 w-4" />} onClick={() => bulkLock(rows, true, clear)}>
                        {t('users.bulk.lock')}
                      </Button>
                      <Button size="sm" variant="secondary" loading={unlockMut.isPending} icon={<LockOpen className="h-4 w-4" />} onClick={() => bulkLock(rows, false, clear)}>
                        {t('users.bulk.unlock')}
                      </Button>
                    </>
                  )}
                  {canExport && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={exp.isPending}
                      icon={<Download className="h-4 w-4" />}
                      onClick={() => exp.mutate(exportRequest('csv', list.exportFilters, rows.map((r) => r.id)))}
                    >
                      {t('users.bulk.export')}
                    </Button>
                  )}
                </>
              )
            : undefined
        }
      />
    </div>
  );
}
