import { useTranslation } from 'react-i18next';
import type { Gateway, Refund, Transaction, TxnStatus } from '@/types';
import { cn } from '@/utils/cn';
import { uid } from '@/utils/id';
import { useRefunds, useTransactions } from '@/store/core';

export const GATEWAYS: Gateway[] = ['zaincash', 'fastpay', 'qicard', 'asiahawala', 'visa'];

/** Brand-ish colours per gateway. */
export const GATEWAY_COLOR: Record<Gateway, string> = {
  zaincash: '#E0115F',
  fastpay: '#E5481B',
  qicard: '#0E7C3A',
  asiahawala: '#D21F3C',
  visa: '#1A1F71',
};

/** Estimated processing fee rate per gateway (for reconciliation). */
export const GATEWAY_FEE: Record<Gateway, number> = {
  zaincash: 0.02,
  fastpay: 0.018,
  qicard: 0.015,
  asiahawala: 0.022,
  visa: 0.03,
};

const GATEWAY_MARK: Record<Gateway, string> = { zaincash: 'ZC', fastpay: 'FP', qicard: 'Qi', asiahawala: 'AH', visa: 'V' };

export function GatewayChip({ gateway, className }: { gateway: Gateway; className?: string }) {
  const { t } = useTranslation();
  const c = GATEWAY_COLOR[gateway];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-ink/80', className)}>
      <span className="grid h-5 min-w-5 place-items-center rounded px-1 text-[9px] font-bold text-white" style={{ background: c }} aria-hidden>
        {GATEWAY_MARK[gateway]}
      </span>
      {t(`payments.gateways.${gateway}`)}
    </span>
  );
}

/** Statuses counted as money actually captured. */
export const CAPTURED: TxnStatus[] = ['paid', 'refunded', 'partially_refunded'];

export const refundable = (t: Transaction) => (t.status === 'paid' || t.status === 'partially_refunded' ? t.amount - t.refundedAmount : 0);

/** Settle a refund against its transaction: amount, status and timeline. */
export function settleRefund(txnId: string, amount: number, note: string) {
  const txn = useTransactions.getState().get(txnId);
  if (!txn) return;
  const refundedAmount = Math.min(txn.amount, txn.refundedAmount + amount);
  const status: TxnStatus = refundedAmount >= txn.amount ? 'refunded' : 'partially_refunded';
  useTransactions.getState().update(
    txnId,
    {
      refundedAmount,
      status,
      timeline: [...txn.timeline, { id: uid('ev'), status, at: new Date().toISOString(), note }],
    },
    { action: 'transaction.refund', summary: `Refunded ${amount.toLocaleString('en-US')} IQD on ${txn.ref}` },
  );
}

/** Append a timeline event without changing status. */
export function addTimelineEvent(txnId: string, status: Transaction['timeline'][number]['status'], note: string) {
  const txn = useTransactions.getState().get(txnId);
  if (!txn) return;
  useTransactions.getState().update(txnId, { timeline: [...txn.timeline, { id: uid('ev'), status, at: new Date().toISOString(), note }] }, { silent: true });
}

/** Approve a pending refund and settle it on the transaction. */
export function approveRefund(r: Refund, by: string) {
  useRefunds.getState().update(r.id, { status: 'approved', decidedBy: by, decidedAt: new Date().toISOString() }, { action: 'refund.approve', summary: `Approved ${r.kind} refund of ${r.amount.toLocaleString('en-US')} IQD` });
  settleRefund(r.transactionId, r.amount, `Refund approved by ${by} — ${r.reason}`);
}

export function rejectRefund(r: Refund, by: string, reason: string) {
  useRefunds.getState().update(r.id, { status: 'rejected', decidedBy: by, decidedAt: new Date().toISOString() }, { action: 'refund.reject', summary: `Rejected refund request: ${reason}` });
  addTimelineEvent(r.transactionId, 'refund_requested', `Refund request rejected by ${by}: ${reason}`);
}
