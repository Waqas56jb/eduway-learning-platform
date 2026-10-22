import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, CheckCheck, CircleDot, Clock, Coins, GitBranch, Receipt, Users, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApiMutation } from '@/api/hooks';
import { partnerKeys, partnerModule, settlementsApi, toSettlement, type SettlementVM } from '@/api/partners';
import { useSettlement, type SettlementItemDto } from '@/api/drilldown';
import { useCan } from '@/store/auth';
import { useLang } from '@/hooks/useLocale';
import { cn } from '@/utils/cn';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, DataTable, EmptyState, SkeletonCard, StatCard, StatusBadge, useConfirm } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { fmtPeriod, MarkPaidModal } from './SettlementsTable';

/** ADM-SET-02 — one settlement with its counted payments, workflow timeline and approve / mark-paid actions. */
export default function SettlementDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const can = useCan();
  const { pathname } = useLocation();
  const routeModule = pathname.startsWith('/marketers') ? 'marketers' : 'schools';
  const q = useSettlement(id);
  const s = q.data;
  const [paying, setPaying] = useState<SettlementVM[] | null>(null);
  const approveM = useApiMutation(() => settlementsApi.approve(id!), { invalidate: [...partnerKeys], success: 'schools.settlements.approved' });

  const items = useMemo(() => s?.items ?? [], [s]);
  const columns = useMemo<ColumnDef<SettlementItemDto>[]>(
    () => [
      {
        id: 'student',
        accessorFn: (r) => r.studentName[lang] || r.studentName.en,
        header: t('common.student'),
        meta: { exportValue: (r: SettlementItemDto) => r.studentName.en },
        cell: ({ row }) =>
          can('users', 'view') ? (
            <Link to={`/users/${row.original.studentId}`} className="font-medium text-ink hover:text-accent hover:underline">
              {row.original.studentName[lang] || row.original.studentName.en}
            </Link>
          ) : (
            <span className="font-medium">{row.original.studentName[lang] || row.original.studentName.en}</span>
          ),
      },
      {
        id: 'ref',
        accessorKey: 'ref',
        header: t('drilldown.settlement.paymentRef'),
        cell: ({ row }) =>
          can('payments', 'view') ? (
            <Link to={`/payments/transactions/${row.original.paymentId}`} className="text-xs num hover:text-accent hover:underline" dir="ltr">
              {row.original.ref}
            </Link>
          ) : (
            <span className="text-xs num" dir="ltr">
              {row.original.ref}
            </span>
          ),
      },
      { id: 'paidAt', accessorKey: 'paidAt', header: t('drilldown.settlement.paymentDate'), cell: ({ getValue }) => <span className="whitespace-nowrap text-muted">{fmtDate(getValue<string>())}</span> },
      { id: 'amount', accessorKey: 'amount', header: t('drilldown.settlement.paymentAmount'), meta: { align: 'end' }, cell: ({ getValue }) => <span className="font-medium num">{fmtMoney(getValue<number>())}</span> },
    ],
    [t, lang, can],
  );

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCard key={i} loading label="" value="" />
          ))}
        </div>
        <SkeletonCard lines={8} />
      </div>
    );
  }

  if (!s) {
    if (q.error && q.error.code !== 'NOT_FOUND') return <QueryError error={q.error} onRetry={() => q.refetch()} />;
    return (
      <Card>
        <EmptyState
          title={t('drilldown.settlement.notFound')}
          action={
            <ButtonLink to={`/${routeModule}/settlements`} variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>
              {t('drilldown.settlement.back')}
            </ButtonLink>
          }
        />
      </Card>
    );
  }

  const module = partnerModule(s.partnerType);
  if (module !== routeModule) return <Navigate to={`/${module}/settlements/${s.id}`} replace />;

  const canApprove = can(module, 'approve');
  const partnerName = s.partner?.name[lang] || s.partner?.name.en || '—';
  const paymentsTotal = items.reduce((a, x) => a + x.amount, 0);
  const uniqueStudents = new Set(items.map((x) => x.studentId)).size;

  const approve = async () => {
    const ok = await confirm({ title: t('schools.settlements.approveTitle', { amount: fmtMoney(s.amount) }), body: t('schools.settlements.approveBody'), tone: 'primary', confirmText: t('schools.settlements.approve') });
    if (ok) approveM.mutate();
  };

  const steps = [
    { key: 'created', icon: <CircleDot />, done: true, title: t('drilldown.settlement.stepCreated'), at: s.createdAt, by: null as string | null, extra: null as string | null },
    { key: 'approved', icon: <BadgeCheck />, done: !!s.approvedAt || s.status !== 'pending', title: t('status.approved'), at: s.approvedAt, by: s.approvedBy?.name[lang] ?? null, extra: null },
    {
      key: 'paid',
      icon: <CheckCheck />,
      done: s.status === 'paid',
      title: t('status.paid'),
      at: s.paidAt,
      by: s.paidBy?.name[lang] ?? null,
      extra: s.paymentReference ? `${t('schools.settlements.paymentRef')}: ${s.paymentReference}` : null,
    },
  ];

  return (
    <>
      <PageHeader
        title={`${partnerName} · ${fmtPeriod(s.period)}`}
        current={fmtPeriod(s.period)}
        meta={
          <>
            <StatusBadge status={s.status} />
            <Badge tone={s.partnerType === 'school' ? 'info' : 'purple'}>{s.partnerType === 'school' ? t('common.school') : t('common.marketer')}</Badge>
            <span className="text-xs text-muted num" dir="ltr">
              {s.period}
            </span>
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />} onClick={() => navigate(`/${module}/settlements`)}>
              {t('actions.back')}
            </Button>
            {canApprove && s.status === 'pending' && (
              <Button variant="outline" icon={<BadgeCheck className="h-4 w-4" />} loading={approveM.isPending} onClick={approve}>
                {t('schools.settlements.approve')}
              </Button>
            )}
            {canApprove && s.status === 'approved' && (
              <Button variant="success" icon={<Wallet className="h-4 w-4" />} onClick={() => setPaying([toSettlement(s)])}>
                {t('schools.settlements.markPaid')}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('schools.settlements.amount')} value={fmtMoney(s.amount)} icon={<Coins />} color="#C9A24A" />
        <StatCard label={t('schools.settlements.qualified')} value={fmtNumber(s.qualifiedStudents)} icon={<Users />} color="#0B1F3A" />
        <StatCard label={t('drilldown.settlement.payments')} value={fmtNumber(items.length)} hint={fmtMoney(paymentsTotal)} icon={<Receipt />} color="#2563EB" />
        <StatCard label={t('common.version')} value={s.ruleVersion !== null ? `v${s.ruleVersion}` : '—'} icon={<GitBranch />} color="#7C3AED" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="min-w-0 overflow-hidden xl:col-span-2">
          <CardHeader icon={<Receipt className="h-4 w-4" />} title={t('drilldown.settlement.items')} subtitle={t('drilldown.settlement.itemsSub', { payments: items.length, students: uniqueStudents })} />
          <DataTable
            bare
            data={items}
            columns={columns}
            getRowId={(r) => r.paymentId}
            exportName={`settlement-${s.period}`}
            searchText={(r) => `${r.studentName.en} ${r.studentName.ar} ${r.ref}`}
            searchPlaceholder={t('drilldown.settlement.search')}
            initialSort={[{ id: 'paidAt', desc: true }]}
            pageSize={10}
            emptyTitle={t('drilldown.settlement.noItems')}
            emptyHint={t('drilldown.settlement.noItemsHint')}
          />
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={<Clock className="h-4 w-4" />} title={t('drilldown.settlement.timeline')} />
            <CardBody>
              <ol className="relative space-y-5">
                {steps.map((st, i) => (
                  <li key={st.key} className="relative ps-9">
                    {i < steps.length - 1 && <span className="absolute start-[13px] top-7 h-[calc(100%-4px)] w-px bg-line" aria-hidden />}
                    <span
                      className={cn('absolute start-0 top-0 grid h-7 w-7 place-items-center rounded-full [&>svg]:h-4 [&>svg]:w-4', st.done ? 'bg-success/15 text-success' : 'bg-ink/5 text-muted')}
                      aria-hidden
                    >
                      {st.icon}
                    </span>
                    <div className={cn('text-sm font-semibold', !st.done && 'text-muted')}>{st.title}</div>
                    <div className="text-xs text-muted">
                      {st.at ? fmtDateTime(st.at) : t('drilldown.settlement.notYet')}
                      {st.by && <> · {st.by}</>}
                    </div>
                    {st.extra && (
                      <div className="mt-0.5 text-xs text-muted num" dir="auto">
                        {st.extra}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              {s.note && (
                <div className="mt-5 rounded-lg border border-line bg-surface-2 p-3 text-sm">
                  <div className="mb-1 text-xs text-muted">{t('schools.settlements.note')}</div>
                  <p className="whitespace-pre-wrap">{s.note}</p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('schools.settlements.partner')} />
            <dl className="divide-y divide-line text-sm">
              <div className="flex items-start justify-between gap-3 px-5 py-3">
                <dt className="text-muted">{s.partnerType === 'school' ? t('common.school') : t('common.marketer')}</dt>
                <dd className="text-end font-medium">
                  <Link to={`/${module}/${s.partnerId}`} className="hover:text-accent hover:underline">
                    {partnerName}
                  </Link>
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3 px-5 py-3">
                <dt className="text-muted">{t('drilldown.settlement.rule')}</dt>
                <dd className="text-end font-medium">
                  {s.ruleId ? (
                    <Link to={`/${module}/incentive-rules/${s.ruleId}`} className="hover:text-accent hover:underline">
                      {s.ruleVersion !== null ? t('schools.rules.version', { version: s.ruleVersion }) : t('drilldown.settlement.rule')}
                    </Link>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3 px-5 py-3">
                <dt className="text-muted">{t('common.currency')}</dt>
                <dd className="text-end font-medium">{s.currency}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      <MarkPaidModal items={paying} onClose={() => setPaying(null)} />
    </>
  );
}
