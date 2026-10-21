import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AlertTriangle, BadgeCheck, CheckCheck, Landmark, Percent, Undo2, Wallet } from 'lucide-react';
import type { Gateway } from '@/types';
import { cn } from '@/utils/cn';
import { fmtDate, fmtMoney, fmtNumber } from '@/utils/format';
import { useTransactions } from '@/store/core';
import { useCan } from '@/store/auth';
import { logAudit } from '@/store/audit';
import { rangeFromPreset, type DateRange } from '@/store/ui';
import { useMockLoading } from '@/hooks/useMockLoading';
import { PageHeader } from '@/components/layout/PageHeader';
import { AreaChart } from '@/components/charts';
import { Badge, Button, Card, CardBody, CardHeader, DataTable, DateRangePicker, FilterSelect, StatCard, Switch, useConfirm } from '@/components/ui';
import { CAPTURED, GATEWAYS, GATEWAY_FEE, GatewayChip } from './shared';

interface DayRow {
  id: string;
  day: string;
  gross: number;
  refunds: number;
  net: number;
  fees: number;
  count: number;
}

interface CompareRow {
  id: string;
  day: string;
  gateway: Gateway;
  count: number;
  system: number;
  reported: number;
  diff: number;
  state: 'matched' | 'mismatch' | 'reconciled';
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381);

/** Mock gateway settlement figure: mostly equal to system, with a few deterministic discrepancies. */
function reportedFor(key: string, system: number, count: number, avg: number) {
  const h = hash(key);
  if (h % 9 === 0 && count > 1) return system - Math.round(avg); // a transaction missing from the gateway file
  if (h % 13 === 0) return system - 2500; // fee withheld at source
  if (h % 17 === 0) return system + 5000; // duplicate settlement
  return system;
}

export default function Reconciliation() {
  const { t } = useTranslation();
  const can = useCan();
  const confirm = useConfirm();
  const txns = useTransactions((s) => s.items);
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset('90d'));
  const loading = useMockLoading(450, [range]);
  const [gateway, setGateway] = useState('');
  const [onlyMismatch, setOnlyMismatch] = useState(false);
  const [reconciled, setReconciled] = useState<Set<string>>(() => new Set());

  const inRange = useMemo(
    () => txns.filter((x) => CAPTURED.includes(x.status) && x.createdAt >= range.from && x.createdAt <= range.to && (!gateway || x.gateway === gateway)),
    [txns, range, gateway],
  );

  const days = useMemo<DayRow[]>(() => {
    const m = new Map<string, DayRow>();
    for (const x of inRange) {
      const day = x.createdAt.slice(0, 10);
      const r = m.get(day) ?? { id: day, day, gross: 0, refunds: 0, net: 0, fees: 0, count: 0 };
      r.gross += x.amount;
      r.refunds += x.refundedAmount;
      r.fees += Math.round(x.amount * GATEWAY_FEE[x.gateway]);
      r.count += 1;
      r.net = r.gross - r.refunds - r.fees;
      m.set(day, r);
    }
    return [...m.values()].sort((a, b) => b.day.localeCompare(a.day));
  }, [inRange]);

  const chart = useMemo(() => {
    const byDay = new Map(days.map((d) => [d.day, d]));
    const from = parseISO(range.from);
    const to = parseISO(range.to);
    if (from > to) return [];
    return eachDayOfInterval({ start: from, end: to }).map((d) => {
      const key = format(d, 'yyyy-MM-dd');
      const r = byDay.get(key);
      return { day: key, gross: r?.gross ?? 0, refunds: r?.refunds ?? 0 };
    });
  }, [days, range]);

  const compare = useMemo<CompareRow[]>(() => {
    const m = new Map<string, { day: string; gateway: Gateway; count: number; system: number }>();
    for (const x of inRange) {
      const day = x.createdAt.slice(0, 10);
      const key = `${day}|${x.gateway}`;
      const r = m.get(key) ?? { day, gateway: x.gateway, count: 0, system: 0 };
      r.count += 1;
      r.system += x.amount;
      m.set(key, r);
    }
    return [...m.entries()]
      .map(([key, r]) => {
        const reported = reportedFor(key, r.system, r.count, r.system / r.count);
        const diff = reported - r.system;
        const state: CompareRow['state'] = reconciled.has(key) ? 'reconciled' : diff === 0 ? 'matched' : 'mismatch';
        return { id: key, ...r, reported, diff, state };
      })
      .sort((a, b) => b.day.localeCompare(a.day));
  }, [inRange, reconciled]);

  const rows = onlyMismatch ? compare.filter((r) => r.state === 'mismatch') : compare;

  const totals = useMemo(() => {
    const gross = days.reduce((s, d) => s + d.gross, 0);
    const refunds = days.reduce((s, d) => s + d.refunds, 0);
    const fees = days.reduce((s, d) => s + d.fees, 0);
    return { gross, refunds, fees, net: gross - refunds - fees, mismatches: compare.filter((r) => r.state === 'mismatch').length };
  }, [days, compare]);

  const markReconciled = async (r: CompareRow) => {
    const gw = t(`payments.gateways.${r.gateway}`);
    const ok = await confirm({
      title: t('payments.recon.markTitle', { gateway: gw, day: fmtDate(r.day) }),
      body: t('payments.recon.markBody', { diff: fmtMoney(r.diff, 'IQD') }),
      tone: 'primary',
      reason: true,
      confirmText: t('payments.recon.markReconciled'),
    });
    if (!ok) return;
    setReconciled((s) => new Set(s).add(r.id));
    logAudit({
      action: 'reconciliation.mark_reconciled',
      entity: 'reconciliation',
      entityId: r.id,
      summary: `Reconciled ${gw} settlement for ${r.day} (difference ${r.diff.toLocaleString('en-US')} IQD): ${ok.reason}`,
      before: { state: 'mismatch', diff: r.diff },
      after: { state: 'reconciled' },
    });
    toast.success(t('payments.recon.marked'));
  };

  const dayColumns = useMemo<ColumnDef<DayRow>[]>(
    () => [
      { id: 'day', accessorKey: 'day', header: t('payments.recon.day'), meta: { label: t('payments.recon.day') }, cell: ({ row }) => <span className="whitespace-nowrap num">{fmtDate(row.original.day)}</span> },
      { id: 'count', accessorKey: 'count', header: t('payments.recon.txnCount'), meta: { label: t('payments.recon.txnCount'), align: 'end' } },
      { id: 'gross', accessorKey: 'gross', header: t('payments.recon.gross'), meta: { label: t('payments.recon.gross'), align: 'end' }, cell: ({ row }) => fmtMoney(row.original.gross) },
      {
        id: 'refunds',
        accessorKey: 'refunds',
        header: t('payments.recon.refunds'),
        meta: { label: t('payments.recon.refunds'), align: 'end' },
        cell: ({ row }) => <span className={row.original.refunds ? 'text-danger' : 'text-muted'}>{row.original.refunds ? `−${fmtMoney(row.original.refunds)}` : '—'}</span>,
      },
      { id: 'fees', accessorKey: 'fees', header: t('payments.recon.fees'), meta: { label: t('payments.recon.fees'), align: 'end' }, cell: ({ row }) => <span className="text-muted">−{fmtMoney(row.original.fees)}</span> },
      { id: 'net', accessorKey: 'net', header: t('payments.recon.net'), meta: { label: t('payments.recon.net'), align: 'end' }, cell: ({ row }) => <span className="font-semibold">{fmtMoney(row.original.net)}</span> },
    ],
    [t],
  );

  const compareColumns = useMemo<ColumnDef<CompareRow>[]>(
    () => [
      { id: 'day', accessorKey: 'day', header: t('payments.recon.day'), meta: { label: t('payments.recon.day') }, cell: ({ row }) => <span className="whitespace-nowrap num">{fmtDate(row.original.day)}</span> },
      {
        id: 'gateway',
        accessorKey: 'gateway',
        header: t('payments.gateway'),
        meta: { label: t('payments.gateway'), exportValue: (r) => t(`payments.gateways.${r.gateway}`) },
        cell: ({ row }) => <GatewayChip gateway={row.original.gateway} />,
      },
      { id: 'count', accessorKey: 'count', header: t('payments.recon.txnCount'), meta: { label: t('payments.recon.txnCount'), align: 'end' } },
      { id: 'system', accessorKey: 'system', header: t('payments.recon.system'), meta: { label: t('payments.recon.system'), align: 'end' }, cell: ({ row }) => fmtMoney(row.original.system) },
      { id: 'reported', accessorKey: 'reported', header: t('payments.recon.gatewayReported'), meta: { label: t('payments.recon.gatewayReported'), align: 'end' }, cell: ({ row }) => fmtMoney(row.original.reported) },
      {
        id: 'diff',
        accessorKey: 'diff',
        header: t('payments.recon.difference'),
        meta: { label: t('payments.recon.difference'), align: 'end' },
        cell: ({ row }) => {
          const d = row.original.diff;
          return <span className={cn('font-semibold', d === 0 ? 'text-muted' : d < 0 ? 'text-danger' : 'text-warning')}>{d === 0 ? '—' : `${d > 0 ? '+' : '−'}${fmtMoney(Math.abs(d))}`}</span>;
        },
      },
      {
        id: 'state',
        accessorKey: 'state',
        header: t('common.status'),
        meta: { label: t('common.status') },
        cell: ({ row }) => {
          const s = row.original.state;
          return (
            <Badge tone={s === 'matched' ? 'success' : s === 'reconciled' ? 'info' : 'danger'} dot>
              {t(`payments.recon.${s}`)}
            </Badge>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row }) =>
          row.original.state === 'mismatch' && can('payments', 'approve') ? (
            <Button size="xs" variant="secondary" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => markReconciled(row.original)}>
              {t('payments.recon.markReconciled')}
            </Button>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, can],
  );

  return (
    <div>
      <PageHeader
        title={t('payments.recon.title')}
        subtitle={t('payments.recon.subtitle')}
        actions={
          <>
            <FilterSelect label={t('payments.gateway')} value={gateway} onChange={setGateway} options={GATEWAYS.map((g) => ({ value: g, label: t(`payments.gateways.${g}`) }))} />
            <DateRangePicker value={range} onChange={setRange} />
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard loading={loading} label={t('payments.recon.gross')} value={fmtMoney(totals.gross, 'IQD', true)} icon={<Wallet />} color="#C9A24A" hint={t('common.results', { count: inRange.length })} />
        <StatCard loading={loading} label={t('payments.recon.refunds')} value={fmtMoney(totals.refunds, 'IQD', true)} icon={<Undo2 />} color="#7C3AED" hint={' '} />
        <StatCard loading={loading} label={t('payments.kpi.fees')} value={fmtMoney(totals.fees, 'IQD', true)} icon={<Percent />} color="#64748B" hint={' '} />
        <StatCard loading={loading} label={t('payments.kpi.net')} value={fmtMoney(totals.net, 'IQD', true)} icon={<Landmark />} color="#16A34A" hint={' '} />
        <StatCard
          loading={loading}
          label={t('payments.kpi.mismatches')}
          value={fmtNumber(totals.mismatches)}
          icon={totals.mismatches ? <AlertTriangle /> : <BadgeCheck />}
          color={totals.mismatches ? '#DC2626' : '#16A34A'}
          hint={' '}
          onClick={() => setOnlyMismatch(true)}
        />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title={t('payments.recon.daily')} subtitle={t('payments.recon.dailySub')} />
          <CardBody>
            <AreaChart
              data={chart}
              xKey="day"
              loading={loading}
              height={300}
              valueFormat={(v) => fmtMoney(v, 'IQD', true)}
              xFormat={(v) => fmtDate(v, 'd MMM')}
              series={[
                { key: 'gross', label: t('payments.recon.gross'), color: '#C9A24A' },
                { key: 'refunds', label: t('payments.recon.refunds'), color: '#DC2626' },
              ]}
            />
          </CardBody>
        </Card>
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader title={t('payments.recon.daily')} subtitle={t(`dateRange.${range.preset}`)} />
          <DataTable
            bare
            hideSearch
            data={days}
            columns={dayColumns}
            loading={loading}
            pageSize={10}
            maxHeight="340px"
            initialHidden={['fees']}
            exportName={can('payments', 'export') ? 'daily-settlements' : undefined}
            emptyTitle={t('payments.recon.noActivity')}
            emptyHint={t('payments.recon.noActivityHint')}
          />
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title={t('payments.recon.comparison')}
          subtitle={t('payments.recon.comparisonSub')}
          action={<Switch size="sm" checked={onlyMismatch} onChange={setOnlyMismatch} label={t('payments.recon.onlyMismatches')} />}
        />
        <DataTable
          bare
          data={rows}
          columns={compareColumns}
          loading={loading}
          pageSize={10}
          rowClassName={(r) => (r.state === 'mismatch' ? 'bg-danger/[0.03]' : undefined)}
          exportName={can('payments', 'export') ? 'gateway-reconciliation' : undefined}
          searchText={(r) => `${r.day} ${t(`payments.gateways.${r.gateway}`)} ${r.state}`}
          emptyTitle={t('payments.recon.noActivity')}
          emptyHint={t('payments.recon.noActivityHint')}
        />
      </Card>
    </div>
  );
}
