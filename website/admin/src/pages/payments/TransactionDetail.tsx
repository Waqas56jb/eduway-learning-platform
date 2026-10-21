import { Fragment, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  CircleDot,
  Copy,
  CreditCard,
  FileX2,
  Package as PackageIcon,
  Printer,
  Receipt,
  RotateCcw,
  ShieldAlert,
  Undo2,
  User,
  Webhook,
  XCircle,
} from 'lucide-react';
import type { Transaction, TxnEvent } from '@/types';
import { cn } from '@/utils/cn';
import { uid } from '@/utils/id';
import { fmtDate, fmtDateTime, fmtMoney } from '@/utils/format';
import { governorateById } from '@/data/geo';
import { usePackages, useRefunds, useSchools, useStudents, useTransactions } from '@/store/core';
import { useCan, useCurrentAdmin } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Segmented,
  SkeletonCard,
  StatusBadge,
  Switch,
  Textarea,
  useConfirm,
} from '@/components/ui';
import { GatewayChip, addTimelineEvent, refundable, settleRefund } from './shared';

const EVENT_STYLE: Record<TxnEvent['status'], { icon: typeof CircleDot; cls: string }> = {
  initiated: { icon: CircleDot, cls: 'bg-ink/10 text-muted' },
  pending: { icon: CreditCard, cls: 'bg-warning/15 text-warning' },
  webhook: { icon: Webhook, cls: 'bg-info/15 text-info' },
  paid: { icon: BadgeCheck, cls: 'bg-success/15 text-success' },
  failed: { icon: XCircle, cls: 'bg-danger/15 text-danger' },
  cancelled: { icon: FileX2, cls: 'bg-ink/10 text-muted' },
  refund_requested: { icon: RotateCcw, cls: 'bg-accent/15 text-accent' },
  refunded: { icon: Undo2, cls: 'bg-[#7C3AED]/15 text-[#7C3AED]' },
  partially_refunded: { icon: Undo2, cls: 'bg-[#7C3AED]/15 text-[#7C3AED]' },
};

export default function TransactionDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const loading = useMockLoading(350);
  const txn = useTransactions((s) => s.items.find((x) => x.id === id));
  const student = useStudents((s) => s.items.find((x) => x.id === txn?.studentId));
  const pkg = usePackages((s) => s.items.find((x) => x.id === txn?.packageId));
  const school = useSchools((s) => s.items.find((x) => x.id === txn?.schoolId));
  const pendingRefund = useRefunds((s) => s.items.find((r) => r.transactionId === id && r.status === 'pending'));
  const [openPayload, setOpenPayload] = useState<string | null>(null);
  const [receipt, setReceipt] = useState(false);
  const [refund, setRefund] = useState(false);

  const dupKeys = useMemo(() => {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const w of txn?.webhooks ?? []) {
      if (seen.has(w.idempotencyKey)) dups.add(w.id);
      seen.add(w.idempotencyKey);
    }
    return dups;
  }, [txn]);

  if (!txn) {
    return (
      <div>
        <PageHeader title={t('payments.detail.notFound')} />
        <Card>
          <EmptyState
            title={t('payments.detail.notFound')}
            hint={t('payments.detail.notFoundSub')}
            action={
              <ButtonLink to="/payments/transactions" variant="secondary" size="sm" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>
                {t('payments.detail.back')}
              </ButtonLink>
            }
          />
        </Card>
      </div>
    );
  }

  const remaining = refundable(txn);
  const canRefund = can('payments', 'edit') && remaining > 0 && !pendingRefund;

  const copy = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      toast.success(t('toast.copied'));
    } catch {
      toast.error(t('toast.error'));
    }
  };

  return (
    <div>
      <PageHeader
        title={t('payments.detail.title', { ref: txn.ref })}
        current={txn.ref}
        meta={
          <>
            <StatusBadge status={txn.status} />
            <GatewayChip gateway={txn.gateway} />
            <span className="text-xs text-muted num">{fmtDateTime(txn.createdAt)}</span>
            {pendingRefund && (
              <Badge tone="warning" icon={<RotateCcw className="h-3 w-3" />}>
                {t('payments.detail.events.refund_requested')} · {t('status.pending')}
              </Badge>
            )}
          </>
        }
        actions={
          <>
            <ButtonLink to="/payments/transactions" variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>
              {t('actions.back')}
            </ButtonLink>
            {txn.status !== 'initiated' && txn.status !== 'pending' && txn.status !== 'failed' && txn.status !== 'cancelled' && (
              <Button variant="secondary" icon={<Receipt className="h-4 w-4" />} onClick={() => setReceipt(true)}>
                {t('payments.detail.viewReceipt')}
              </Button>
            )}
            {can('payments', 'edit') && (
              <Button
                variant="danger"
                icon={<Undo2 className="h-4 w-4" />}
                disabled={!canRefund}
                title={!canRefund ? t('payments.detail.refundNotAllowed') : undefined}
                onClick={() => setRefund(true)}
              >
                {t('payments.detail.refund')}
              </Button>
            )}
          </>
        }
      />

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={5} />
          <SkeletonCard lines={5} />
          <SkeletonCard lines={8} className="lg:col-span-2" />
          <SkeletonCard lines={8} />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Student */}
          <Card>
            <CardHeader title={t('payments.detail.student')} icon={<User className="h-4 w-4" />} />
            <CardBody>
              {student ? (
                <div className="flex items-start gap-3">
                  <Avatar name={student.name_en} src={student.avatar} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-ink">{L(student, 'name')}</div>
                    <div className="text-xs text-muted num" dir="ltr">
                      {student.mobile}
                    </div>
                    <div className="mt-1 text-xs text-muted">{L(governorateById(student.governorateId), 'name')}</div>
                    <Link to={`/users/${student.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                      {t('payments.detail.openProfile')} <ArrowRight className="h-3 w-3 flip-rtl" />
                    </Link>
                  </div>
                </div>
              ) : (
                <span className="text-sm text-muted">{t('common.unknown')}</span>
              )}
            </CardBody>
          </Card>

          {/* Package */}
          <Card>
            <CardHeader title={t('payments.detail.package')} icon={<PackageIcon className="h-4 w-4" />} />
            <CardBody>
              {pkg ? (
                <div>
                  <div className="font-semibold text-ink">{L(pkg, 'name')}</div>
                  <div className="mt-1 text-xs text-muted">{fmtMoney(pkg.price, pkg.currency)}</div>
                  <div className="mt-3 text-xs text-muted">{t('payments.detail.attribution')}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {school ? (
                      <Badge tone="info">
                        {school.code} · {L(school, 'name')}
                      </Badge>
                    ) : txn.promoCode ? (
                      <Badge tone="accent">{txn.promoCode}</Badge>
                    ) : (
                      <Badge>{t('payments.sources.direct')}</Badge>
                    )}
                  </div>
                  <Link to="/packages" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                    {t('nav.packages')} <ArrowRight className="h-3 w-3 flip-rtl" />
                  </Link>
                </div>
              ) : (
                <span className="text-sm text-muted">{t('common.unknown')}</span>
              )}
            </CardBody>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader title={t('payments.detail.summary')} icon={<CreditCard className="h-4 w-4" />} />
            <CardBody>
              <dl className="space-y-2.5 text-sm">
                <Row label={t('payments.detail.listPrice')} value={fmtMoney(txn.amount + txn.discount, txn.currency)} />
                {txn.discount > 0 && <Row label={t('payments.discount')} value={`−${fmtMoney(txn.discount, txn.currency)}`} className="text-success" />}
                <Row label={t('payments.detail.charged')} value={fmtMoney(txn.amount, txn.currency)} strong />
                {txn.refundedAmount > 0 && <Row label={t('payments.detail.refundedAmount')} value={`−${fmtMoney(txn.refundedAmount, txn.currency)}`} className="text-danger" />}
                <div className="border-t border-line pt-2.5">
                  <Row label={t('payments.detail.remaining')} value={fmtMoney(remaining, txn.currency)} strong />
                </div>
              </dl>
            </CardBody>
          </Card>

          {/* Webhooks */}
          <Card className="overflow-hidden lg:col-span-2">
            <CardHeader title={t('payments.detail.webhooks')} icon={<Webhook className="h-4 w-4" />} subtitle={`${txn.webhooks.length}`} />
            {txn.webhooks.length === 0 ? (
              <EmptyState compact title={t('payments.detail.webhooks')} hint={t('payments.detail.noWebhooks')} />
            ) : (
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      <th className="px-4 py-2.5 text-start">{t('payments.detail.event')}</th>
                      <th className="px-4 py-2.5 text-start">{t('common.status')}</th>
                      <th className="px-4 py-2.5 text-start">{t('payments.detail.idempotency')}</th>
                      <th className="px-4 py-2.5 text-start">{t('payments.detail.received')}</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {txn.webhooks.map((w) => {
                      const dup = dupKeys.has(w.id);
                      const open = openPayload === w.id;
                      return (
                        <Fragment key={w.id}>
                          <tr className="border-t border-line">
                            <td className="px-4 py-3 font-mono text-xs font-semibold text-ink" dir="ltr">
                              {w.type}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {w.verified ? (
                                  <Badge tone="success" icon={<BadgeCheck className="h-3 w-3" />}>
                                    {t('payments.detail.verified')}
                                  </Badge>
                                ) : (
                                  <Badge tone="danger" icon={<ShieldAlert className="h-3 w-3" />}>
                                    {t('payments.detail.unverified')}
                                  </Badge>
                                )}
                                {dup && <Badge tone="warning">{t('payments.detail.duplicate')}</Badge>}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1">
                                <code className="max-w-[11rem] truncate rounded bg-ink/5 px-1.5 py-0.5 text-[11px] text-ink/80" dir="ltr">
                                  {w.idempotencyKey}
                                </code>
                                <button onClick={() => copy(w.idempotencyKey)} className="rounded p-1 text-muted hover:text-ink" aria-label={t('actions.copy')}>
                                  <Copy className="h-3 w-3" />
                                </button>
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-xs text-muted num">{fmtDateTime(w.receivedAt)}</td>
                            <td className="px-4 py-3 text-end">
                              <Button variant="ghost" size="xs" aria-expanded={open} onClick={() => setOpenPayload(open ? null : w.id)}>
                                {open ? t('payments.detail.hidePayload') : t('payments.detail.showPayload')}
                                <ChevronDown className={cn('h-3.5 w-3.5 transition', open && 'rotate-180')} />
                              </Button>
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={5} className="bg-surface-2 px-4 py-3">
                                <pre className="scrollbar-thin overflow-x-auto rounded-lg bg-[#0B1F3A] p-3 text-[11px] leading-relaxed text-[#E6C77A]" dir="ltr">
                                  {JSON.stringify({ id: w.id, type: w.type, idempotency_key: w.idempotencyKey, received_at: w.receivedAt, data: w.payload }, null, 2)}
                                </pre>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader title={t('payments.detail.timeline')} icon={<CircleDot className="h-4 w-4" />} />
            <CardBody>
              <ol className="relative space-y-5">
                {txn.timeline.map((e, i) => {
                  const st = EVENT_STYLE[e.status];
                  const Icon = st.icon;
                  return (
                    <li key={e.id} className="relative flex gap-3">
                      {i < txn.timeline.length - 1 && <span className="absolute start-[15px] top-8 h-[calc(100%-4px)] w-px bg-line" aria-hidden />}
                      <span className={cn('relative grid h-8 w-8 shrink-0 place-items-center rounded-full', st.cls)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <div className="text-sm font-semibold text-ink">{t(`payments.detail.events.${e.status}`)}</div>
                        <div className="text-xs text-muted">{e.note}</div>
                        <div className="mt-0.5 text-[11px] text-muted/80 num">{fmtDateTime(e.at)}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardBody>
          </Card>
        </div>
      )}

      <ReceiptModal open={receipt} onClose={() => setReceipt(false)} txn={txn} />
      {refund && <RefundModal txn={txn} remaining={remaining} studentName={student ? L(student, 'name') : '—'} onClose={() => setRefund(false)} />}
    </div>
  );
}

function Row({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <dt className="text-muted">{label}</dt>
      <dd className={cn('num', strong ? 'font-semibold text-ink' : 'text-ink/80', className)}>{value}</dd>
    </div>
  );
}

/* ─── Receipt ────────────────────────────────────────────────────────────── */

function ReceiptDoc({ txn }: { txn: Transaction }) {
  const { t } = useTranslation();
  const student = useStudents((s) => s.items.find((x) => x.id === txn.studentId));
  const pkg = usePackages((s) => s.items.find((x) => x.id === txn.packageId));
  const num = `R-${txn.ref.replace(/^EDW-/, '')}`;
  return (
    <div className="mx-auto max-w-[640px] rounded-xl border border-[#E5E1D8] bg-white p-8 font-[Inter,Tajawal,sans-serif] text-[#111827]" dir="ltr">
      <div className="flex items-start justify-between border-b-2 border-[#C9A24A] pb-5">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 64 64" className="h-11 w-11" aria-hidden>
            <rect width="64" height="64" rx="14" fill="#0B1F3A" />
            <path d="M32 16 8 27l24 11 18-8.2V42h4V27L32 16Z" fill="#C9A24A" />
            <path d="M18 34v8c0 3.3 6.3 6 14 6s14-2.7 14-6v-8l-14 6.4L18 34Z" fill="#E6C77A" />
          </svg>
          <div>
            <div className="font-[Playfair_Display,serif] text-2xl font-bold tracking-wide text-[#0B1F3A]">EDUWAY</div>
            <div className="text-[11px] text-[#6B7280]">{t('payments.receipt.company')}</div>
          </div>
        </div>
        <div className="text-end">
          <div className="text-sm font-bold uppercase tracking-wider text-[#0B1F3A]">{t('payments.receipt.title')}</div>
          <div className="font-[Tajawal,sans-serif] text-sm font-bold text-[#A9832F]" dir="rtl">
            {t('payments.receipt.titleAr')}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-xs">
        <div>
          <div className="font-semibold uppercase text-[#6B7280]">{t('payments.receipt.billedTo')}</div>
          <div className="mt-1 text-sm font-semibold">{student?.name_en}</div>
          <div className="font-[Tajawal,sans-serif] text-sm" dir="rtl">
            {student?.name_ar}
          </div>
          <div className="text-[#6B7280]">{student?.mobile}</div>
        </div>
        <div className="text-end">
          <div>
            <span className="text-[#6B7280]">{t('payments.receipt.number')}: </span>
            <span className="font-mono font-semibold">{num}</span>
          </div>
          <div className="mt-1">
            <span className="text-[#6B7280]">{t('payments.receipt.date')}: </span>
            {fmtDate(txn.createdAt, 'yyyy-MM-dd HH:mm')}
          </div>
          <div className="mt-1">
            <span className="text-[#6B7280]">{t('payments.receipt.paidVia')}: </span>
            {t(`payments.gateways.${txn.gateway}`)}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[#6B7280]">{txn.ref}</div>
        </div>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="bg-[#F5F3EE] text-[11px] uppercase text-[#6B7280]">
            <th className="px-3 py-2 text-start">{t('payments.receipt.item')}</th>
            <th className="px-3 py-2 text-end">{t('common.amount')}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[#E5E1D8]">
            <td className="px-3 py-3">
              <div className="font-semibold">{pkg?.name_en}</div>
              <div className="font-[Tajawal,sans-serif] text-xs text-[#6B7280]" dir="rtl">
                {pkg?.name_ar}
              </div>
            </td>
            <td className="px-3 py-3 text-end tabular-nums">{(txn.amount + txn.discount).toLocaleString('en-US')} IQD</td>
          </tr>
        </tbody>
      </table>

      <div className="ms-auto mt-4 w-64 space-y-1.5 text-sm tabular-nums">
        <div className="flex justify-between">
          <span className="text-[#6B7280]">{t('payments.receipt.subtotal')}</span>
          <span>{(txn.amount + txn.discount).toLocaleString('en-US')} IQD</span>
        </div>
        {txn.discount > 0 && (
          <div className="flex justify-between text-[#16A34A]">
            <span>
              {t('payments.receipt.discount')} {txn.promoCode && `(${txn.promoCode})`}
            </span>
            <span>−{txn.discount.toLocaleString('en-US')} IQD</span>
          </div>
        )}
        <div className="flex justify-between border-t-2 border-[#0B1F3A] pt-2 text-base font-bold text-[#0B1F3A]">
          <span>{t('payments.receipt.total')}</span>
          <span>{txn.amount.toLocaleString('en-US')} IQD</span>
        </div>
        {txn.refundedAmount > 0 && (
          <div className="flex justify-between text-xs text-[#DC2626]">
            <span>{t('payments.detail.refundedAmount')}</span>
            <span>−{txn.refundedAmount.toLocaleString('en-US')} IQD</span>
          </div>
        )}
      </div>

      <div className="mt-8 border-t border-dashed border-[#E5E1D8] pt-4 text-center text-xs text-[#6B7280]">
        <p className="mx-auto">{t('payments.receipt.taxNote')}</p>
        <p className="mx-auto mt-1 font-semibold text-[#A9832F]">{t('payments.receipt.thanks')}</p>
      </div>
    </div>
  );
}

function ReceiptModal({ open, onClose, txn }: { open: boolean; onClose: () => void; txn: Transaction }) {
  const { t } = useTranslation();
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title={t('payments.detail.receipt')}
        description={txn.ref}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('actions.close')}
            </Button>
            <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              {t('actions.print')}
            </Button>
          </>
        }
      >
        <div className="rounded-xl bg-[#F5F3EE] p-3 sm:p-6">
          <ReceiptDoc txn={txn} />
        </div>
      </Modal>
      {open &&
        createPortal(
          <>
            <style>{`@media print { body > *:not(.eduway-receipt-print) { display: none !important; } .eduway-receipt-print { display: block !important; } @page { margin: 12mm; } }`}</style>
            <div className="eduway-receipt-print hidden">
              <ReceiptDoc txn={txn} />
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

/* ─── Refund ─────────────────────────────────────────────────────────────── */

function RefundModal({ txn, remaining, studentName, onClose }: { txn: Transaction; remaining: number; studentName: string; onClose: () => void }) {
  const { t } = useTranslation();
  const can = useCan();
  const confirm = useConfirm();
  const admin = useCurrentAdmin();
  const addRefund = useRefunds((s) => s.add);
  const canApprove = can('payments', 'approve');
  const [kind, setKind] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState(String(Math.round(remaining / 2 / 1000) * 1000 || remaining));
  const [reason, setReason] = useState('');
  const [now, setNow] = useState(false);
  const [touched, setTouched] = useState(false);

  const value = kind === 'full' ? remaining : Number(amount);
  const amountErr = kind === 'partial' && (!Number.isFinite(value) || value < 1000 || value > remaining) ? t('payments.refundForm.errAmount', { max: fmtMoney(remaining, txn.currency) }) : undefined;
  const reasonErr = reason.trim().length < 5 ? t('payments.refundForm.errReason') : undefined;

  const submit = async () => {
    setTouched(true);
    if (amountErr || reasonErr) return;
    const process = canApprove && now;
    const ok = await confirm({
      title: t('payments.refundForm.confirmTitle', { amount: fmtMoney(value, txn.currency), name: studentName }),
      body: process ? t('payments.refundForm.confirmNow', { gateway: t(`payments.gateways.${txn.gateway}`) }) : t('payments.refundForm.confirmQueue'),
      tone: process ? 'danger' : 'warning',
      confirmText: process ? t('payments.detail.refund') : t('actions.send'),
    });
    if (!ok) return;
    const by = admin?.name ?? 'System';
    const nowIso = new Date().toISOString();
    const refundKind = value >= remaining && txn.refundedAmount === 0 ? 'full' : 'partial';
    addRefund(
      {
        id: uid('rfd'),
        transactionId: txn.id,
        studentId: txn.studentId,
        amount: value,
        currency: txn.currency,
        kind: refundKind,
        reason: reason.trim(),
        status: process ? 'approved' : 'pending',
        requestedBy: by,
        requestedAt: nowIso,
        decidedBy: process ? by : null,
        decidedAt: process ? nowIso : null,
      },
      { action: process ? 'refund.process' : 'refund.request', summary: `${process ? 'Processed' : 'Requested'} ${refundKind} refund of ${value.toLocaleString('en-US')} IQD on ${txn.ref}` },
    );
    addTimelineEvent(txn.id, 'refund_requested', `Refund of ${value.toLocaleString('en-US')} IQD requested by ${by} — ${reason.trim()}`);
    if (process) {
      settleRefund(txn.id, value, `Refund processed by ${by}`);
      toast.success(t('payments.refundForm.processed'));
    } else {
      toast.success(t('payments.refundForm.queued'));
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('payments.refundForm.title')}
      description={t('payments.refundForm.subtitle', { amount: fmtMoney(remaining, txn.currency) })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button variant="danger" onClick={submit}>
            {t('payments.refundForm.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('payments.refundForm.kind')}>
          <Segmented
            aria-label={t('payments.refundForm.kind')}
            value={kind}
            onChange={setKind}
            className="flex w-full [&>button]:flex-1"
            options={[
              { value: 'full', label: t('payments.refundForm.full') },
              { value: 'partial', label: t('payments.refundForm.partial') },
            ]}
          />
        </Field>
        <Field label={t('payments.refundForm.amount')} error={touched ? amountErr : undefined} htmlFor="rf-amount">
          <Input
            id="rf-amount"
            type="number"
            min={1000}
            step={1000}
            max={remaining}
            suffix={txn.currency}
            disabled={kind === 'full'}
            value={kind === 'full' ? String(remaining) : amount}
            onChange={(e) => setAmount(e.target.value)}
            invalid={touched && !!amountErr}
          />
        </Field>
        <Field label={t('payments.refundForm.reason')} required error={touched ? reasonErr : undefined} htmlFor="rf-reason">
          <Textarea id="rf-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('payments.refundForm.reasonPh')} invalid={touched && !!reasonErr} />
        </Field>
        {canApprove && (
          <div className="rounded-lg border border-line bg-surface-2 p-3">
            <Switch checked={now} onChange={setNow} label={t('payments.refundForm.processNow')} description={t('payments.refundForm.processNowHint')} />
          </div>
        )}
      </div>
    </Modal>
  );
}
