import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { BadgeCheck, CheckCheck, Clock, Sparkles, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { qk } from '@/api/keys';
import { exportRequest, useApiMutation, useExport, usePagedList } from '@/api/hooks';
import { useLookups } from '@/api/lookups';
import { partnerKeys, partnerModule, settlementsApi, type GenerateResult, type PartnerType, type SettlementsMeta, type SettlementVM } from '@/api/partners';
import type { BulkResult } from '@/api/types';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { fmtDate, fmtMoney, fmtNumber } from '@/utils/format';
import { Button, Checkbox, DataTable, Field, FilterSelect, Input, Modal, StatCard, StatusBadge, Textarea, useConfirm } from '@/components/ui';

/** Settlement periods are `yyyy-MM` (monthly) or `yyyy-Qn` / `yyyy-Sn` / `yyyy` for longer rule periods. */
export const fmtPeriod = (period: string) => (/^\d{4}-\d{2}$/.test(period) ? fmtDate(`${period}-01T00:00:00`, 'MMM yyyy') : period);

const prevMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

interface Props {
  partnerType: PartnerType;
  /** Restrict to one partner (detail pages). */
  partnerId?: string;
  /** Compact: no totals strip, no partner column. */
  compact?: boolean;
}

/** Settlement list with approve / mark-paid workflow, shared by schools and marketers. */
export function SettlementsTable({ partnerType, partnerId, compact }: Props) {
  const { t } = useTranslation();
  const L = useLocalize();
  const confirm = useConfirm();
  const can = useCan();
  const [period, setPeriod] = useState('');
  const [status, setStatus] = useState('');
  const [paying, setPaying] = useState<SettlementVM[] | null>(null);
  const [generating, setGenerating] = useState(false);

  const module = partnerModule(partnerType);
  const canApprove = can(module, 'approve');

  const list = usePagedList({
    key: qk.settlements.list,
    fetcher: settlementsApi.list,
    filters: { partnerType, partnerId, period, status },
    initialSort: '-period',
    pageSize: compact ? 5 : 10,
  });
  const meta = list.meta as unknown as Partial<SettlementsMeta>;
  const periods = meta.periods ?? [];
  const exp = useExport('/admin/settlements/export', `${partnerType}-settlements`);

  const bulkToast = (r: BulkResult, okKey: string) => {
    if (r.succeeded.length) toast.success(t(okKey, { count: r.succeeded.length }));
    if (r.failed.length) toast.error(t('schools.bulkFailed', { count: r.failed.length, reason: r.failed[0]?.message ?? '' }));
  };

  const approveM = useApiMutation((id: string) => settlementsApi.approve(id), { invalidate: [...partnerKeys], success: 'schools.settlements.approved' });
  const bulkApproveM = useApiMutation((ids: string[]) => settlementsApi.bulkApprove(ids), {
    invalidate: [...partnerKeys],
    onSuccess: (r) => bulkToast(r, 'schools.settlements.bulkApproved'),
  });

  const approve = async (s: SettlementVM) => {
    const ok = await confirm({ title: t('schools.settlements.approveTitle', { amount: fmtMoney(s.amount) }), body: t('schools.settlements.approveBody'), tone: 'primary', confirmText: t('schools.settlements.approve') });
    if (!ok) return;
    approveM.mutate(s.id);
  };

  const columns = useMemo<ColumnDef<SettlementVM>[]>(
    () => [
      { id: 'period', accessorKey: 'period', header: t('schools.settlements.period'), cell: ({ row }) => <span className="font-medium">{fmtPeriod(row.original.period)}</span> },
      ...(compact
        ? []
        : [
            {
              id: 'partner',
              accessorFn: (r: SettlementVM) => L(r, 'partner'),
              header: t('schools.settlements.partner'),
              enableSorting: false,
              cell: ({ row }: { row: { original: SettlementVM } }) => (
                <Link to={`/${module}/${row.original.partnerId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:text-accent hover:underline">
                  {L(row.original, 'partner')}
                </Link>
              ),
            } as ColumnDef<SettlementVM>,
          ]),
      { id: 'qualifiedStudents', accessorKey: 'qualifiedStudents', header: t('schools.settlements.qualified'), meta: { align: 'end' }, cell: ({ getValue }) => fmtNumber(getValue<number>()) },
      { id: 'amount', accessorKey: 'amount', header: t('schools.settlements.amount'), meta: { align: 'end' }, cell: ({ getValue }) => <span className="font-semibold">{fmtMoney(getValue<number>())}</span> },
      { id: 'status', accessorKey: 'status', header: t('common.status'), cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
      { id: 'approvedBy', accessorKey: 'approvedBy', header: t('schools.settlements.approvedBy'), enableSorting: false, cell: ({ getValue }) => <span className="text-muted">{getValue<string | null>() ?? '—'}</span> },
      {
        id: 'paidAt',
        accessorKey: 'paidAt',
        header: t('schools.settlements.paidAt'),
        cell: ({ row }) => (
          <span className="text-muted">
            {fmtDate(row.original.paidAt)}
            {row.original.paymentReference && (
              <span className="block text-[11px] num" dir="ltr">
                {row.original.paymentReference}
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row }) => {
          const s = row.original;
          if (!canApprove || s.status === 'paid') return null;
          return s.status === 'pending' ? (
            <Button size="xs" variant="outline" icon={<BadgeCheck className="h-3.5 w-3.5" />} loading={approveM.isPending && approveM.variables === s.id} onClick={() => approve(s)}>
              {t('schools.settlements.approve')}
            </Button>
          ) : (
            <Button size="xs" variant="success" icon={<Wallet className="h-3.5 w-3.5" />} onClick={() => setPaying([s])}>
              {t('schools.settlements.markPaid')}
            </Button>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, compact, canApprove, module, approveM.isPending, approveM.variables],
  );

  const icons = { pending: <Clock />, approved: <BadgeCheck />, paid: <CheckCheck /> };
  const colors = { pending: '#F59E0B', approved: '#2563EB', paid: '#16A34A' };

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="grid gap-4 sm:grid-cols-3">
          {(['pending', 'approved', 'paid'] as const).map((st) => (
            <StatCard
              key={st}
              loading={list.isLoading}
              label={t(`schools.settlements.totals.${st}`)}
              value={fmtMoney(meta.totals?.[st]?.amount ?? 0, 'IQD', true)}
              hint={t('schools.settlements.totals.count', { count: meta.totals?.[st]?.count ?? 0 })}
              icon={icons[st]}
              color={colors[st]}
              onClick={() => setStatus(status === st ? '' : st)}
            />
          ))}
        </div>
      )}
      <DataTable
        data={list.items}
        columns={columns}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        server={list.server}
        hideSearch={compact}
        onExport={can(module, 'export') ? (ids) => exp.mutate(exportRequest('csv', list.exportFilters, ids)) : undefined}
        exporting={exp.isPending}
        emptyTitle={t('schools.settlements.empty')}
        toolbar={
          <>
            <FilterSelect label={t('schools.settlements.period')} value={period} onChange={setPeriod} options={periods.map((p) => ({ value: p, label: fmtPeriod(p) }))} />
            <FilterSelect label={t('common.status')} value={status} onChange={setStatus} options={(['pending', 'approved', 'paid'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />
          </>
        }
        toolbarEnd={
          !compact && canApprove ? (
            <Button size="sm" icon={<Sparkles className="h-4 w-4" />} onClick={() => setGenerating(true)}>
              {t('schools.settlements.generate')}
            </Button>
          ) : undefined
        }
        bulkActions={
          canApprove
            ? (sel, clear) => {
                const pend = sel.filter((s) => s.status === 'pending');
                const appr = sel.filter((s) => s.status === 'approved');
                return (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!pend.length}
                      loading={bulkApproveM.isPending}
                      icon={<BadgeCheck className="h-4 w-4" />}
                      onClick={async () => {
                        if (!(await confirm({ title: t('schools.settlements.bulkApproveTitle', { count: pend.length }), body: t('schools.settlements.approveBody'), tone: 'primary' }))) return;
                        bulkApproveM.mutate(pend.map((s) => s.id), { onSuccess: clear });
                      }}
                    >
                      {t('schools.settlements.approve')} ({pend.length})
                    </Button>
                    <Button size="sm" variant="success" disabled={!appr.length} icon={<Wallet className="h-4 w-4" />} onClick={() => setPaying(appr)}>
                      {t('schools.settlements.markPaid')} ({appr.length})
                    </Button>
                  </>
                );
              }
            : undefined
        }
        bare={compact}
      />
      <MarkPaidModal items={paying} onClose={() => setPaying(null)} />
      {!compact && <GenerateModal open={generating} onClose={() => setGenerating(false)} partnerType={partnerType} />}
    </div>
  );
}

/** Mark one or several approved settlements as paid (ADM-SET-05 / ADM-SET-07) with an optional payment reference. */
function MarkPaidModal({ items, onClose }: { items: SettlementVM[] | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [paidAt, setPaidAt] = useState('');
  useEffect(() => {
    if (items) {
      setRef('');
      setNote('');
      setPaidAt(new Date().toISOString().slice(0, 10));
    }
  }, [items]);

  const single = items?.length === 1 ? items[0] : null;
  const total = (items ?? []).reduce((a, s) => a + s.amount, 0);

  const m = useApiMutation(
    async () => {
      if (!items?.length) return null;
      if (single) {
        await settlementsApi.markPaid(single.id, { paymentReference: ref.trim() || undefined, note: note.trim() || undefined, paidAt: paidAt ? new Date(paidAt).toISOString() : undefined });
        return null;
      }
      return settlementsApi.bulkMarkPaid(
        items.map((s) => s.id),
        ref.trim() || undefined,
      );
    },
    {
      invalidate: [...partnerKeys],
      onSuccess: (r) => {
        if (!r) toast.success(t('schools.settlements.paid'));
        else {
          if (r.succeeded.length) toast.success(t('schools.settlements.bulkPaid', { count: r.succeeded.length }));
          if (r.failed.length) toast.error(t('schools.bulkFailed', { count: r.failed.length, reason: r.failed[0]?.message ?? '' }));
        }
        onClose();
      },
    },
  );

  return (
    <Modal
      open={!!items}
      onClose={onClose}
      title={single ? t('schools.settlements.payTitle', { amount: fmtMoney(total) }) : t('schools.settlements.bulkPayTitle', { count: items?.length ?? 0 })}
      description={t('schools.settlements.payBody')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button variant="success" loading={m.isPending} icon={<Wallet className="h-4 w-4" />} onClick={() => m.mutate()}>
            {t('schools.settlements.markPaid')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!single && <p className="text-sm text-muted">{t('schools.settlements.bulkPayTotal', { amount: fmtMoney(total) })}</p>}
        <Field label={t('schools.settlements.paymentRef')} hint={t('schools.settlements.paymentRefHint')} htmlFor="sp-ref">
          <Input id="sp-ref" dir="ltr" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} />
        </Field>
        {single && (
          <>
            <Field label={t('schools.settlements.paidOn')} htmlFor="sp-date">
              <Input id="sp-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </Field>
            <Field label={t('schools.settlements.note')} htmlFor="sp-note">
              <Textarea id="sp-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Generate (or recalculate pending) settlements for a period — ADM-SET-03. */
function GenerateModal({ open, onClose, partnerType }: { open: boolean; onClose: () => void; partnerType: PartnerType }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const lookups = useLookups();
  const [period, setPeriod] = useState(prevMonth());
  const [all, setAll] = useState(true);
  const [ids, setIds] = useState<string[]>([]);
  const [result, setResult] = useState<GenerateResult | null>(null);

  useEffect(() => {
    if (open) {
      setPeriod(prevMonth());
      setAll(true);
      setIds([]);
      setResult(null);
    }
  }, [open]);

  const partners = partnerType === 'school' ? lookups.schools : lookups.marketers;
  const valid = /^\d{4}(-(0[1-9]|1[0-2]|Q[1-4]|S[12]))?$/.test(period.trim()) && (all || ids.length > 0);

  const m = useApiMutation(() => settlementsApi.generate({ partnerType, period: period.trim(), partnerIds: all ? undefined : ids }), {
    invalidate: [...partnerKeys],
    onSuccess: (r) => {
      setResult(r);
      toast.success(t('schools.settlements.generated', { created: r.created, updated: r.updated }));
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('schools.settlements.generateTitle')}
      description={t('schools.settlements.generateBody')}
      footer={
        result ? (
          <Button onClick={onClose}>{t('actions.close')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button loading={m.isPending} disabled={!valid} icon={<Sparkles className="h-4 w-4" />} onClick={() => m.mutate()}>
              {t('schools.settlements.generate')}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="grid grid-cols-3 gap-3 text-center">
          {(['created', 'updated', 'skipped'] as const).map((k) => (
            <div key={k} className="rounded-xl border border-line p-4">
              <div className="kpi-num text-2xl text-primary">{fmtNumber(result[k])}</div>
              <div className="mt-1 text-xs text-muted">{t(`schools.settlements.result.${k}`)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label={t('schools.settlements.period')} hint={t('schools.settlements.periodHint')} htmlFor="sg-period">
            <Input id="sg-period" dir="ltr" value={period} onChange={(e) => setPeriod(e.target.value.toUpperCase())} invalid={!/^\d{4}(-(0[1-9]|1[0-2]|Q[1-4]|S[12]))?$/.test(period.trim())} />
          </Field>
          <div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={all} onChange={() => setAll(!all)} />
              {partnerType === 'school' ? t('schools.settlements.allSchools') : t('schools.settlements.allMarketers')}
            </label>
            {!all && (
              <div className="scrollbar-thin mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
                {partners.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-ink/5">
                    <Checkbox checked={ids.includes(p.id)} onChange={() => setIds((cur) => (cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]))} />
                    {L(p, 'name')}
                  </label>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-muted">{t('schools.settlements.generateNote')}</p>
        </div>
      )}
    </Modal>
  );
}

