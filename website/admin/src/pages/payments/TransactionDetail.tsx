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
  Download,
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
import { cn } from '@/utils/cn';
import { fmtDate, fmtDateTime, fmtMoney } from '@/utils/format';
import { formatPhone } from '@/utils/phone';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { errorMessage, toastError, uuid } from '@/api/client';
import { flatRef } from '@/api/adapters';
import { paymentsApi, useReceipt, useRequestRefund, useTransaction, type ReceiptDto, type TransactionDetailVM, type TxnEventDto } from '@/api/payments';
import { QueryError } from '@/components/ui/QueryError';
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
import { GatewayChip } from './shared';

const EVENT_STYLE: Record<TxnEventDto['status'], { icon: typeof CircleDot; cls: string }> = {
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
  const query = useTransaction(id);
  const txn = query.data;
  const loading = query.isLoading;
  const pendingRefund = txn?.pendingRefund ?? null;
  const [openPayload, setOpenPayload] = useState<string | null>(null);
  const [receipt, setReceipt] = useState(false);
  const [refund, setRefund] = useState(false);

  const dupKeys = useMemo(() => {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const w of txn?.webhooks ?? []) {
      if (w.duplicate || seen.has(w.idempotencyKey)) dups.add(w.id);
      seen.add(w.idempotencyKey);
    }
    return dups;
  }, [txn]);

  if (loading) {
    return (
      <div>
        <PageHeader title={t('payments.transactions')} />
        <div className="grid gap-5 lg:grid-cols-3">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={5} />
          <SkeletonCard lines={5} />
          <SkeletonCard lines={8} className="lg:col-span-2" />
          <SkeletonCard lines={8} />
        </div>
      </div>
    );
  }

  if (query.error && query.error.code !== 'NOT_FOUND') {
    return (
      <div>
        <PageHeader title={t('payments.transactions')} />
        <QueryError error={query.error} onRetry={() => query.refetch()} />
      </div>
    );
  }

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

  const remaining = txn.refundable;
  const canRefund = can('payments', 'edit') && txn.canRefund && remaining > 0 && !pendingRefund;

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
            {txn.canViewReceipt && (
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

      {
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Student */}
          <Card>
            <CardHeader title={t('payments.detail.student')} icon={<User className="h-4 w-4" />} />
            <CardBody>
              {txn.studentId ? (
                <div className="flex items-start gap-3">
                  <Avatar name={txn.studentName_en} src={txn.studentAvatar} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-ink">{L(txn, 'studentName')}</div>
                    <div className="text-xs text-muted num" dir="ltr">
                      {formatPhone(txn.studentMobile)}
                    </div>
                    <div className="mt-1 text-xs text-muted">{L(txn, 'governorateName')}</div>
                    <Link to={`/users/${txn.studentId}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
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
              {txn.packageId ? (
                <div>
                  <div className="font-semibold text-ink">{L(txn, 'packageName')}</div>
                  <div className="mt-1 text-xs text-muted">
                    {fmtMoney(txn.packageListPrice, txn.currency)} · {t(`payments.cycles.${txn.cycle}`)}
                  </div>
                  <div className="mt-3 text-xs text-muted">{t('payments.detail.attribution')}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {txn.schoolId ? (
                      <Badge tone="info">
                        {txn.schoolCode} · {L(txn, 'schoolName')}
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
                <Row label={t('payments.detail.listPrice')} value={fmtMoney(txn.listPrice, txn.currency)} />
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
                        {e.actor && <div className="text-[11px] text-muted">{L(flatRef(e.actor), 'name')}</div>}
                        <div className="mt-0.5 text-[11px] text-muted/80 num">{fmtDateTime(e.at)}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardBody>
          </Card>
        </div>
      }

      <ReceiptModal open={receipt} onClose={() => setReceipt(false)} txn={txn} />
      {refund && <RefundModal txn={txn} remaining={remaining} studentName={L(txn, 'studentName')} onClose={() => setRefund(false)} />}
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

function ReceiptDoc({ receipt }: { receipt: ReceiptDto }) {
  const { t } = useTranslation();
  const money = (n: number) => `${n.toLocaleString('en-US')} ${receipt.currency}`;
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
            <div className="font-[Playfair_Display,serif] text-2xl font-bold tracking-wide text-[#0B1F3A]">{receipt.company?.name?.en || 'EDUWAY'}</div>
            <div className="text-[11px] text-[#6B7280]">{receipt.company?.address?.en || t('payments.receipt.company')}</div>
            {receipt.company?.email && <div className="text-[11px] text-[#6B7280]">{receipt.company.email}</div>}
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
          <div className="mt-1 text-sm font-semibold">{receipt.billedTo?.name?.en}</div>
          <div className="font-[Tajawal,sans-serif] text-sm" dir="rtl">
            {receipt.billedTo?.name?.ar}
          </div>
          <div className="text-[#6B7280]" dir="ltr">{formatPhone(receipt.billedTo?.mobile)}</div>
        </div>
        <div className="text-end">
          <div>
            <span className="text-[#6B7280]">{t('payments.receipt.number')}: </span>
            <span className="font-mono font-semibold">{receipt.receiptNumber}</span>
          </div>
          <div className="mt-1">
            <span className="text-[#6B7280]">{t('payments.receipt.date')}: </span>
            {fmtDate(receipt.paidAt ?? receipt.issuedAt, 'yyyy-MM-dd HH:mm')}
          </div>
          <div className="mt-1">
            <span className="text-[#6B7280]">{t('payments.receipt.paidVia')}: </span>
            {receipt.gatewayName?.en || t(`payments.gateways.${receipt.gateway}`, { defaultValue: receipt.gateway })}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[#6B7280]">{receipt.ref}</div>
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
          {receipt.lines.map((line, i) => (
            <tr key={i} className="border-b border-[#E5E1D8]">
              <td className="px-3 py-3">
                <div className="font-semibold">{line.description.en}</div>
                <div className="font-[Tajawal,sans-serif] text-xs text-[#6B7280]" dir="rtl">
                  {line.description.ar}
                </div>
              </td>
              <td className="px-3 py-3 text-end tabular-nums">{money(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ms-auto mt-4 w-64 space-y-1.5 text-sm tabular-nums">
        <div className="flex justify-between">
          <span className="text-[#6B7280]">{t('payments.receipt.subtotal')}</span>
          <span>{money(receipt.subtotal)}</span>
        </div>
        {receipt.discount > 0 && (
          <div className="flex justify-between text-[#16A34A]">
            <span>
              {t('payments.receipt.discount')} {receipt.promoCode && `(${receipt.promoCode})`}
            </span>
            <span>−{money(receipt.discount)}</span>
          </div>
        )}
        <div className="flex justify-between border-t-2 border-[#0B1F3A] pt-2 text-base font-bold text-[#0B1F3A]">
          <span>{t('payments.receipt.total')}</span>
          <span>{money(receipt.total)}</span>
        </div>
        {receipt.refunded > 0 && (
          <div className="flex justify-between text-xs text-[#DC2626]">
            <span>{t('payments.detail.refundedAmount')}</span>
            <span>−{money(receipt.refunded)}</span>
          </div>
        )}
      </div>

      <div className="mt-8 border-t border-dashed border-[#E5E1D8] pt-4 text-center text-xs text-[#6B7280]">
        <p className="mx-auto">{receipt.taxNote?.en || t('payments.receipt.taxNote')}</p>
        {receipt.taxNote?.ar && (
          <p className="mx-auto font-[Tajawal,sans-serif]" dir="rtl">
            {receipt.taxNote.ar}
          </p>
        )}
        <p className="mx-auto mt-1 font-semibold text-[#A9832F]">{t('payments.receipt.thanks')}</p>
      </div>
    </div>
  );
}

function ReceiptModal({ open, onClose, txn }: { open: boolean; onClose: () => void; txn: TransactionDetailVM }) {
  const { t } = useTranslation();
  const q = useReceipt(txn.id, open);
  const [downloading, setDownloading] = useState(false);
  const pdf = async () => {
    setDownloading(true);
    try {
      await paymentsApi.receiptPdf(txn.id, txn.ref);
    } catch (e) {
      toastError(e);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title={t('payments.detail.receipt')}
        description={txn.receiptNumber ?? txn.ref}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('actions.close')}
            </Button>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} loading={downloading} onClick={pdf}>
              {t('payments.detail.downloadPdf')}
            </Button>
            <Button icon={<Printer className="h-4 w-4" />} disabled={!q.data} onClick={() => window.print()}>
              {t('actions.print')}
            </Button>
          </>
        }
      >
        <div className="rounded-xl bg-[#F5F3EE] p-3 sm:p-6">
          {q.isLoading ? <SkeletonCard lines={8} /> : q.error ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : q.data ? <ReceiptDoc receipt={q.data} /> : null}
        </div>
      </Modal>
      {open &&
        q.data &&
        createPortal(
          <>
            <style>{`@media print { body > *:not(.eduway-receipt-print) { display: none !important; } .eduway-receipt-print { display: block !important; } @page { margin: 12mm; } }`}</style>
            <div className="eduway-receipt-print hidden">
              <ReceiptDoc receipt={q.data} />
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

/* ─── Refund ─────────────────────────────────────────────────────────────── */

const REFUND_REASON_KEYS: Record<string, string> = {
  REFUND_EXCEEDS_REMAINING: 'payments.refundForm.errExceeds',
  REFUND_PENDING_EXISTS: 'payments.refundForm.errPendingExists',
  NOT_REFUNDABLE: 'payments.refundForm.errNotRefundable',
};

function RefundModal({ txn, remaining, studentName, onClose }: { txn: TransactionDetailVM; remaining: number; studentName: string; onClose: () => void }) {
  const { t } = useTranslation();
  const can = useCan();
  const confirm = useConfirm();
  const canApprove = can('payments', 'approve');
  const mutation = useRequestRefund(txn.id);
  // One idempotency key per modal session: a retry of the same request replays instead of double-refunding.
  const [idemKey] = useState(() => uuid());
  const [kind, setKind] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState(String(Math.round(remaining / 2 / 1000) * 1000 || remaining));
  const [reason, setReason] = useState('');
  const [now, setNow] = useState(false);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const value = kind === 'full' ? remaining : Number(amount);
  const amountErr = kind === 'partial' && (!Number.isFinite(value) || value < 1000 || value > remaining) ? t('payments.refundForm.errAmount', { max: fmtMoney(remaining, txn.currency) }) : undefined;
  const reasonErr = reason.trim().length < 5 ? t('payments.refundForm.errReason') : undefined;

  const submit = async () => {
    setTouched(true);
    setServerError(null);
    if (amountErr || reasonErr) return;
    const process = canApprove && now;
    const ok = await confirm({
      title: t('payments.refundForm.confirmTitle', { amount: fmtMoney(value, txn.currency), name: studentName }),
      body: process ? t('payments.refundForm.confirmNow', { gateway: t(`payments.gateways.${txn.gateway}`) }) : t('payments.refundForm.confirmQueue'),
      tone: process ? 'danger' : 'warning',
      confirmText: process ? t('payments.detail.refund') : t('actions.send'),
    });
    if (!ok) return;
    mutation.mutate(
      { kind, amount: kind === 'partial' ? value : undefined, reason: reason.trim(), processNow: process, key: idemKey },
      {
        onSuccess: () => {
          toast.success(process ? t('payments.refundForm.processed') : t('payments.refundForm.queued'));
          onClose();
        },
        onError: (err) => {
          const key = err.reason ? REFUND_REASON_KEYS[err.reason] : undefined;
          setServerError(key ? t(key) : errorMessage(err));
        },
      },
    );
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
          <Button variant="danger" onClick={submit} loading={mutation.isPending}>
            {t('payments.refundForm.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {serverError && <div className="rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-2 text-sm text-danger">{serverError}</div>}
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
