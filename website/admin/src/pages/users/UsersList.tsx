import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Lock, LockOpen, UserCheck, UserRoundX, Users, Hourglass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, DataTable, DateRangePicker, FilterSelect, StatCard, StatusBadge, useConfirm } from '@/components/ui';
import { governorates } from '@/data/geo';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { useCan } from '@/store/auth';
import { usePackages, useSchools, useStudents } from '@/store/core';
import { rangeFromPreset, type DateRange } from '@/store/ui';
import type { AcquisitionSource, Student, SubscriptionStatus } from '@/types';
import { exportCsv } from '@/utils/csv';
import { fmtDate, fmtNumber, fmtRelative } from '@/utils/format';

const STATUSES: SubscriptionStatus[] = ['active', 'trial', 'expired', 'cancelled', 'none'];
const SOURCES: AcquisitionSource[] = ['organic', 'school', 'marketer', 'referral', 'campaign'];

export default function UsersList() {
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const can = useCan();
  const confirm = useConfirm();
  const loading = useMockLoading();

  const students = useStudents((s) => s.items);
  const updateMany = useStudents((s) => s.updateMany);
  const packages = usePackages((s) => s.items);
  const schools = useSchools((s) => s.items);

  const [status, setStatus] = useState('');
  const [pkg, setPkg] = useState('');
  const [gov, setGov] = useState('');
  const [school, setSchool] = useState('');
  const [source, setSource] = useState('');
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset('12m'));

  const filtered = useMemo(() => {
    const from = range.from.slice(0, 10);
    const to = range.to.slice(0, 10);
    return students.filter((s) => {
      if (status === 'locked' ? !s.locked : status && s.subscriptionStatus !== status) return false;
      if (pkg && (pkg === '__none' ? s.packageId : s.packageId !== pkg)) return false;
      if (gov && s.governorateId !== gov) return false;
      if (school && (school === '__none' ? s.schoolId : s.schoolId !== school)) return false;
      if (source && s.source !== source) return false;
      const d = s.createdAt.slice(0, 10);
      return d >= from && d <= to;
    });
  }, [students, status, pkg, gov, school, source, range]);

  const activeFilters = [status, pkg, gov, school, source].filter(Boolean).length + (range.preset === '12m' ? 0 : 1);
  const clearFilters = () => {
    setStatus('');
    setPkg('');
    setGov('');
    setSchool('');
    setSource('');
    setRange(rangeFromPreset('12m'));
  };

  const pkgName = (id: string | null) => {
    const p = packages.find((x) => x.id === id);
    return p ? L(p, 'name') : t('users.filters.noPackage');
  };
  const schoolName = (id: string | null) => {
    const s = schools.find((x) => x.id === id);
    return s ? L(s, 'name') : '—';
  };
  const govName = (id: string) => L(governorates.find((g) => g.id === id), 'name');

  const columns = useMemo<ColumnDef<Student>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (s) => L(s, 'name'),
        header: t('users.cols.student'),
        meta: { label: t('users.cols.student'), exportValue: (s) => s.name_en },
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex min-w-[13rem] items-center gap-3">
            <Avatar name={row.original.name_en} src={row.original.avatar} size="sm" />
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{L(row.original, 'name')}</div>
              <div className="text-xs text-muted num">{row.original.id}</div>
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
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: 'governorate',
        accessorFn: (s) => govName(s.governorateId),
        header: t('users.cols.governorate'),
        meta: { label: t('users.cols.governorate') },
      },
      {
        id: 'school',
        accessorFn: (s) => schoolName(s.schoolId),
        header: t('users.cols.school'),
        meta: { label: t('users.cols.school') },
        cell: ({ getValue }) => <span className="block max-w-[14rem] truncate text-ink/80">{getValue<string>()}</span>,
      },
      {
        id: 'package',
        accessorFn: (s) => pkgName(s.packageId),
        header: t('users.cols.package'),
        meta: { label: t('users.cols.package') },
        cell: ({ row, getValue }) =>
          row.original.packageId ? <span className="whitespace-nowrap text-ink/85">{getValue<string>()}</span> : <span className="text-muted">—</span>,
      },
      {
        id: 'status',
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
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <div className="text-ink/85">{t(`users.source.${row.original.source}`)}</div>
            {row.original.referralCode && <div className="text-[11px] text-muted num">{row.original.referralCode}</div>}
          </div>
        ),
      },
      {
        accessorKey: 'lastActive',
        header: t('users.cols.lastActive'),
        meta: { label: t('users.cols.lastActive') },
        cell: ({ getValue }) => <span className="whitespace-nowrap text-ink/80">{fmtRelative(getValue<string>())}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: t('users.cols.created'),
        meta: { label: t('users.cols.created') },
        cell: ({ getValue }) => <span className="whitespace-nowrap text-ink/80">{fmtDate(getValue<string>())}</span>,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, packages, schools],
  );

  const bulkLock = async (rows: Student[], lock: boolean, clear: () => void) => {
    const ok = await confirm({
      title: t(lock ? 'users.bulk.lockTitle' : 'users.bulk.unlockTitle', { count: rows.length }),
      body: t(lock ? 'users.bulk.lockBody' : 'users.bulk.unlockBody'),
      tone: lock ? 'danger' : 'primary',
      confirmText: t(lock ? 'users.bulk.lock' : 'users.bulk.unlock'),
      reason: lock,
    });
    if (!ok) return;
    updateMany(
      rows.map((r) => r.id),
      lock ? { locked: true, sessions: [] } : { locked: false },
      {
        action: lock ? 'student.bulk_lock' : 'student.bulk_unlock',
        summary: `${lock ? 'Locked' : 'Unlocked'} ${rows.length} student accounts${ok.reason ? ` — ${ok.reason}` : ''}`,
      },
    );
    toast.success(t(lock ? 'users.bulk.locked' : 'users.bulk.unlocked', { count: rows.length }));
    clear();
  };

  const exportRows = (rows: Student[]) => {
    exportCsv(
      'students-selected',
      rows.map((s) => ({
        id: s.id,
        name: s.name_en,
        name_ar: s.name_ar,
        mobile: s.mobile,
        governorate: govName(s.governorateId),
        school: schoolName(s.schoolId),
        package: pkgName(s.packageId),
        status: s.subscriptionStatus,
        locked: s.locked,
        source: s.source,
        created: s.createdAt,
      })),
    );
    toast.success(t('table.exported', { count: rows.length }));
  };

  const stats = useMemo(
    () => ({
      total: students.length,
      active: students.filter((s) => s.subscriptionStatus === 'active').length,
      trial: students.filter((s) => s.subscriptionStatus === 'trial').length,
      locked: students.filter((s) => s.locked).length,
    }),
    [students],
  );

  const canEdit = can('users', 'edit');
  const canExport = can('users', 'export');

  return (
    <div>
      <PageHeader title={t('users.title')} subtitle={t('users.subtitle')} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('users.stats.total')} value={fmtNumber(stats.total)} icon={<Users />} color="#0B1F3A" hint=" " />
        <StatCard loading={loading} label={t('users.stats.active')} value={fmtNumber(stats.active)} icon={<UserCheck />} color="#16A34A" hint=" " onClick={() => setStatus('active')} />
        <StatCard loading={loading} label={t('users.stats.trial')} value={fmtNumber(stats.trial)} icon={<Hourglass />} color="#2563EB" hint=" " onClick={() => setStatus('trial')} />
        <StatCard loading={loading} label={t('users.stats.locked')} value={fmtNumber(stats.locked)} icon={<UserRoundX />} color="#DC2626" hint=" " onClick={() => setStatus('locked')} />
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        loading={loading}
        onRowClick={(s) => navigate(`/users/${s.id}`)}
        searchText={(s) => `${s.name_en} ${s.name_ar} ${s.mobile} ${s.id} ${s.email ?? ''} ${s.referralCode ?? ''}`}
        exportName={canExport ? 'students' : undefined}
        initialSort={[{ id: 'createdAt', desc: true }]}
        initialHidden={['source']}
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
              options={[...packages.map((p) => ({ value: p.id, label: L(p, 'name') })), { value: '__none', label: t('users.filters.noPackage') }]}
            />
            <FilterSelect label={t('users.filters.governorate')} value={gov} onChange={setGov} options={governorates.map((g) => ({ value: g.id, label: L(g, 'name') }))} />
            <FilterSelect
              label={t('users.filters.school')}
              value={school}
              onChange={setSchool}
              className="max-w-[14rem]"
              options={[...schools.map((s) => ({ value: s.id, label: L(s, 'name') })), { value: '__none', label: t('users.filters.noSchool') }]}
            />
            <FilterSelect label={t('users.filters.source')} value={source} onChange={setSource} options={SOURCES.map((s) => ({ value: s, label: t(`users.source.${s}`) }))} />
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
                      <Button size="sm" variant="secondary" icon={<Lock className="h-4 w-4" />} onClick={() => bulkLock(rows, true, clear)}>
                        {t('users.bulk.lock')}
                      </Button>
                      <Button size="sm" variant="secondary" icon={<LockOpen className="h-4 w-4" />} onClick={() => bulkLock(rows, false, clear)}>
                        {t('users.bulk.unlock')}
                      </Button>
                    </>
                  )}
                  {canExport && (
                    <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => exportRows(rows)}>
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
