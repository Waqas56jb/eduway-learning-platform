import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { ArrowUpDown, CalendarPlus, Gift, MoreHorizontal, Search, XCircle } from 'lucide-react';
import { cn } from '@/utils/cn';
import { fmtDate, fmtRelative } from '@/utils/format';
import { formatPhone } from '@/utils/phone';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useDebounce } from '@/hooks/useMisc';
import { uuid } from '@/api/client';
import { qk } from '@/api/keys';
import { exportRequest, useExport, usePagedList, useApiQuery } from '@/api/hooks';
import { flatRef } from '@/api/adapters';
import { useLookups } from '@/api/lookups';
import type { StudentRef } from '@/api/types';
import { searchStudents, subscriptionsApi, toSubscriptionVM, useSubscriptionMutations, type SubscriptionVM } from '@/api/packages';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, DataTable, Field, FilterSelect, Input, MenuDivider, MenuItem, Modal, Popover, Select, StatusBadge, Switch, Textarea, type Tone } from '@/components/ui';

const STATUSES = ['active', 'trial', 'expired', 'cancelled'] as const;
const SOURCES = ['payment', 'manual', 'trial'] as const;
const SOURCE_TONE: Record<SubscriptionVM['source'], Tone> = { payment: 'success', manual: 'accent', trial: 'info' };

type Action = { kind: 'extend' | 'change' | 'cancel'; sub: SubscriptionVM };

export default function Subscriptions() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const { packages } = useLookups();
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [pkg, setPkg] = useState('');
  const [expiring, setExpiring] = useState(false);
  const [grant, setGrant] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const canEdit = can('packages', 'edit');

  // Stable "expiring within 7 days" cut-off for the lifetime of the toggle.
  const expiringBefore = useMemo(() => (expiring ? new Date(Date.now() + 7 * 86_400_000).toISOString() : undefined), [expiring]);

  const list = usePagedList({
    key: qk.subscriptions.list,
    fetcher: (p) => subscriptionsApi.list(p),
    filters: { status, source, packageId: pkg, expiringBefore },
    initialSort: 'endsAt',
  });
  const rows = useMemo(() => list.items.map(toSubscriptionVM), [list.items]);
  const exp = useExport('/admin/subscriptions/export', 'subscriptions');

  const columns = useMemo<ColumnDef<SubscriptionVM>[]>(
    () => [
      {
        id: 'student',
        enableSorting: false,
        accessorFn: (s) => s.studentName_en,
        header: t('common.student'),
        meta: { label: t('common.student') },
        cell: ({ row }) => (
          <div className="flex min-w-[12rem] items-center gap-2.5">
            <Avatar name={row.original.studentName_en} src={row.original.student.avatarUrl} size="sm" />
            <div className="min-w-0">
              <Link to={`/users/${row.original.student.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:text-accent hover:underline">
                {L(row.original, 'studentName')}
              </Link>
              <div className="text-[11px] text-muted num" dir="ltr">
                {formatPhone(row.original.student.mobile)}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'package',
        enableSorting: false,
        accessorFn: (s) => s.packageName_en,
        header: t('common.package'),
        meta: { label: t('common.package') },
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <div className="text-ink/80">{L(row.original, 'packageName')}</div>
            <div className="text-[11px] text-muted">{t(`payments.cycles.${row.original.cycle}`)}</div>
          </div>
        ),
      },
      {
        id: 'source',
        enableSorting: false,
        accessorKey: 'source',
        header: t('packages.subs.source'),
        meta: { label: t('packages.subs.source') },
        cell: ({ row }) => <Badge tone={SOURCE_TONE[row.original.source]}>{t(`packages.subs.sources.${row.original.source}`)}</Badge>,
      },
      {
        id: 'startedAt',
        accessorKey: 'startedAt',
        header: t('packages.subs.started'),
        meta: { label: t('packages.subs.started') },
        cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted num">{fmtDate(row.original.startedAt)}</span>,
      },
      {
        id: 'endsAt',
        accessorKey: 'endsAt',
        header: t('packages.subs.ends'),
        meta: { label: t('packages.subs.ends') },
        cell: ({ row }) => {
          const soon = row.original.status === 'active' && new Date(row.original.endsAt).getTime() - Date.now() < 7 * 86_400_000;
          return (
            <div className="whitespace-nowrap">
              <div className={cn('text-xs num', soon ? 'font-semibold text-warning' : 'text-ink/80')}>{fmtDate(row.original.endsAt)}</div>
              <div className="text-[11px] text-muted">{fmtRelative(row.original.endsAt)}</div>
            </div>
          );
        },
      },
      {
        id: 'status',
        enableSorting: false,
        accessorKey: 'status',
        header: t('common.status'),
        meta: { label: t('common.status') },
        cell: ({ row }) => (
          <div>
            <StatusBadge status={row.original.status} />
            {row.original.cancelledAt && row.original.status !== 'cancelled' && (
              <div className="mt-0.5 text-[11px] text-muted">{t('packages.subs.cancelsAtEnd')}</div>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end', className: 'w-12' },
        cell: ({ row }) =>
          canEdit ? (
            <span onClick={(e) => e.stopPropagation()}>
              <Popover
                panelClassName="w-52"
                trigger={({ toggle, open }) => (
                  <Button variant="ghost" size="icon-sm" onClick={toggle} aria-expanded={open} aria-label={t('actions.more')}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                )}
              >
                {(close) => (
                  <div role="menu">
                    <MenuItem icon={<CalendarPlus />} disabled={row.original.status === 'cancelled'} onClick={() => { close(); setAction({ kind: 'extend', sub: row.original }); }}>
                      {t('packages.subs.extend')}
                    </MenuItem>
                    <MenuItem icon={<ArrowUpDown />} disabled={row.original.status === 'expired' || row.original.status === 'cancelled'} onClick={() => { close(); setAction({ kind: 'change', sub: row.original }); }}>
                      {t('packages.subs.change')}
                    </MenuItem>
                    <MenuDivider />
                    <MenuItem danger icon={<XCircle />} disabled={row.original.status === 'expired' || row.original.status === 'cancelled'} onClick={() => { close(); setAction({ kind: 'cancel', sub: row.original }); }}>
                      {t('packages.subs.cancel')}
                    </MenuItem>
                  </div>
                )}
              </Popover>
            </span>
          ) : null,
      },
    ],
    [t, L, canEdit],
  );

  return (
    <div>
      <PageHeader
        title={t('packages.subs.title')}
        subtitle={t('packages.subs.subtitle')}
        actions={
          canEdit && (
            <Button icon={<Gift className="h-4 w-4" />} onClick={() => setGrant(true)}>
              {t('packages.subs.grant')}
            </Button>
          )
        }
      />

      <DataTable
        data={rows}
        columns={columns}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        server={list.server}
        searchPlaceholder={t('packages.subs.searchPh')}
        onExport={can('packages', 'export') ? () => exp.mutate(exportRequest('csv', list.exportFilters)) : undefined}
        exporting={exp.isPending}
        toolbar={
          <>
            <FilterSelect label={t('common.status')} value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} />
            <FilterSelect label={t('packages.subs.source')} value={source} onChange={setSource} options={SOURCES.map((s) => ({ value: s, label: t(`packages.subs.sources.${s}`) }))} />
            <FilterSelect label={t('common.package')} value={pkg} onChange={setPkg} options={packages.map((p) => ({ value: p.id, label: L(p, 'name') }))} />
            <Switch size="sm" checked={expiring} onChange={setExpiring} label={t('packages.subs.expiringSoon')} />
          </>
        }
        emptyTitle={t('packages.subs.empty')}
        emptyHint={t('packages.subs.emptyHint')}
      />

      {grant && <GrantModal onClose={() => setGrant(false)} />}
      {action && <ActionModal action={action} onClose={() => setAction(null)} />}
    </div>
  );
}

/* ─── Grant (ADM-SBS-02) ─────────────────────────────────────────────────── */

function GrantModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const { packages } = useLookups();
  const m = useSubscriptionMutations();
  const [key] = useState(() => uuid());
  const [query, setQuery] = useState('');
  const q = useDebounce(query.trim(), 300);
  const [student, setStudent] = useState<StudentRef | null>(null);
  const [packageId, setPackageId] = useState('');
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const results = useApiQuery(qk.students.sub('search', q), () => searchStudents(q), { enabled: q.length >= 2 && !student });
  const active = packages.filter((p) => p.status === 'active');

  useEffect(() => {
    if (student) setQuery('');
  }, [student]);

  const daysNum = days.trim() === '' ? undefined : Number(days);
  const errors = {
    student: !student ? t('packages.subs.errStudent') : undefined,
    package: !packageId ? t('packages.subs.errPackage') : undefined,
    days: daysNum !== undefined && (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > 3650) ? t('packages.subs.errDays') : undefined,
    reason: reason.trim().length < 3 ? t('packages.subs.errReason') : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);

  const submit = () => {
    setTouched(true);
    if (invalid || !student) return;
    m.grant.mutate({ studentId: student.id, packageId, days: daysNum, reason: reason.trim(), key }, { onSuccess: onClose });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('packages.subs.grantTitle')}
      description={t('packages.subs.grantSub')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button icon={<Gift className="h-4 w-4" />} loading={m.grant.isPending} onClick={submit}>
            {t('packages.subs.grant')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('common.student')} required error={touched ? errors.student : undefined} htmlFor="sb-student">
          {student ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-accent/50 bg-accent/[0.05] px-3 py-2">
              <Avatar name={student.name.en} src={student.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink">{L(flatRef(student), 'name')}</div>
                <div className="text-[11px] text-muted num" dir="ltr">
                  {formatPhone(student.mobile)}
                </div>
              </div>
              <Button variant="ghost" size="xs" onClick={() => setStudent(null)}>
                {t('packages.subs.changeStudent')}
              </Button>
            </div>
          ) : (
            <div>
              <Input id="sb-student" icon={<Search />} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('packages.subs.studentPh')} />
              {q.length >= 2 && (
                <div className="mt-1.5 max-h-48 overflow-auto rounded-lg border border-line">
                  {results.isLoading ? (
                    <div className="px-3 py-2 text-xs text-muted">{t('common.loading')}</div>
                  ) : (results.data ?? []).length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted">{t('common.noResults')}</div>
                  ) : (
                    results.data!.map((s) => (
                      <button key={s.id} type="button" onClick={() => setStudent(s)} className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-accent/[0.06]">
                        <Avatar name={s.name.en} src={s.avatarUrl} size="xs" />
                        <span className="flex-1 truncate">{L(flatRef(s), 'name')}</span>
                        <span className="text-[11px] text-muted num" dir="ltr">
                          {formatPhone(s.mobile)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </Field>
        <Field label={t('common.package')} required error={touched ? errors.package : undefined} htmlFor="sb-pkg">
          <Select id="sb-pkg" placeholder="—" value={packageId} onChange={(e) => setPackageId(e.target.value)} options={active.map((p) => ({ value: p.id, label: L(p, 'name') }))} />
        </Field>
        <Field label={t('packages.subs.days')} hint={t('packages.subs.daysHint')} error={touched ? errors.days : undefined} htmlFor="sb-days">
          <Input id="sb-days" type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} suffix={t('common.days')} />
        </Field>
        <Field label={t('common.reason')} required error={touched ? errors.reason : undefined} htmlFor="sb-reason">
          <Textarea id="sb-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('packages.subs.reasonPh')} />
        </Field>
      </div>
    </Modal>
  );
}

/* ─── Extend / change package / cancel (ADM-SBS-03..05) ──────────────────── */

function ActionModal({ action, onClose }: { action: Action; onClose: () => void }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const { packages } = useLookups();
  const m = useSubscriptionMutations();
  const { kind, sub } = action;
  const [days, setDays] = useState('30');
  const [packageId, setPackageId] = useState('');
  const [keepEndDate, setKeepEndDate] = useState(true);
  const [immediate, setImmediate] = useState(false);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  const daysNum = Number(days);
  const errors = {
    days: kind === 'extend' && (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > 365) ? t('packages.subs.errExtendDays') : undefined,
    package: kind === 'change' && !packageId ? t('packages.subs.errPackage') : undefined,
    reason: reason.trim().length < 3 ? t('packages.subs.errReason') : undefined,
  };
  const pending = m.extend.isPending || m.change.isPending || m.cancel.isPending;

  const submit = () => {
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    const r = reason.trim();
    if (kind === 'extend') m.extend.mutate({ id: sub.id, days: daysNum, reason: r }, { onSuccess: onClose });
    else if (kind === 'change') m.change.mutate({ id: sub.id, packageId, reason: r, keepEndDate }, { onSuccess: onClose });
    else m.cancel.mutate({ id: sub.id, reason: r, immediate }, { onSuccess: onClose });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t(`packages.subs.${kind}Title`)}
      description={`${L(sub, 'studentName')} · ${L(sub, 'packageName')} · ${t('packages.subs.ends')} ${fmtDate(sub.endsAt)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button variant={kind === 'cancel' ? 'danger' : 'primary'} loading={pending} onClick={submit}>
            {t(`packages.subs.${kind}`)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {kind === 'extend' && (
          <Field label={t('packages.subs.extendDays')} required error={touched ? errors.days : undefined} htmlFor="sa-days">
            <Input id="sa-days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} suffix={t('common.days')} />
          </Field>
        )}
        {kind === 'change' && (
          <>
            <Field label={t('packages.subs.newPackage')} required error={touched ? errors.package : undefined} htmlFor="sa-pkg">
              <Select
                id="sa-pkg"
                placeholder="—"
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
                options={packages.filter((p) => p.id !== sub.package.id && p.status === 'active').map((p) => ({ value: p.id, label: L(p, 'name') }))}
              />
            </Field>
            <Switch checked={keepEndDate} onChange={setKeepEndDate} label={t('packages.subs.keepEndDate')} description={t('packages.subs.keepEndDateHint')} />
          </>
        )}
        {kind === 'cancel' && (
          <div className="rounded-lg border border-line bg-surface-2 p-3">
            <Switch checked={immediate} onChange={setImmediate} label={t('packages.subs.immediate')} description={t('packages.subs.immediateHint')} />
          </div>
        )}
        <Field label={t('common.reason')} required error={touched ? errors.reason : undefined} htmlFor="sa-reason">
          <Textarea id="sa-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('packages.subs.reasonPh')} />
        </Field>
      </div>
    </Modal>
  );
}
