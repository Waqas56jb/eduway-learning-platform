import type { Gateway, Refund, Transaction, TxnEvent, TxnStatus, WebhookEvent } from '@/types';
import { createRng, daysAgo } from '@/utils/random';
import { packages } from './packages';
import { schools } from './partners';
import { students } from './students';

const rng = createRng(4242);

const STATUS_PLAN: [TxnStatus, number][] = [
  ['paid', 52],
  ['pending', 6],
  ['initiated', 4],
  ['failed', 8],
  ['cancelled', 4],
  ['refunded', 3],
  ['partially_refunded', 3],
];

const GATEWAYS: [Gateway, number][] = [
  ['zaincash', 40],
  ['fastpay', 20],
  ['qicard', 20],
  ['asiahawala', 12],
  ['visa', 8],
];

const PROMOS = ['BACK2SCHOOL26', 'EARLYBIRD15', 'REF-SAA25', 'MEDTRACK10'];

const hex = (n: number) => Array.from({ length: n }, () => rng.int(0, 15).toString(16)).join('');

function timelineFor(status: TxnStatus, created: number, gateway: Gateway): TxnEvent[] {
  const t = (offsetMin: number) => new Date(new Date(daysAgo(created)).getTime() + offsetMin * 60_000).toISOString();
  const ev: TxnEvent[] = [{ id: hex(8), status: 'initiated', at: t(0), note: 'Checkout started from mobile app' }];
  if (status === 'initiated') return ev;
  ev.push({ id: hex(8), status: 'pending', at: t(1), note: `Redirected to ${gateway} payment page` });
  if (status === 'pending') return ev;
  if (status === 'cancelled') {
    ev.push({ id: hex(8), status: 'cancelled', at: t(9), note: 'Customer cancelled on gateway page' });
    return ev;
  }
  if (status === 'failed') {
    ev.push({ id: hex(8), status: 'webhook', at: t(3), note: 'payment.failed webhook received' });
    ev.push({ id: hex(8), status: 'failed', at: t(3), note: rng.pick(['Insufficient wallet balance', 'Card declined by issuer', 'OTP verification failed at gateway']) });
    return ev;
  }
  ev.push({ id: hex(8), status: 'webhook', at: t(2), note: 'payment.succeeded webhook received (signature verified)' });
  ev.push({ id: hex(8), status: 'paid', at: t(2), note: 'Subscription activated and entitlements granted' });
  if (status === 'refunded' || status === 'partially_refunded') {
    ev.push({ id: hex(8), status: 'refund_requested', at: t(60 * 24 * 2), note: 'Refund requested by support' });
    ev.push({ id: hex(8), status, at: t(60 * 24 * 3), note: status === 'refunded' ? 'Full refund settled to wallet' : 'Partial refund settled to wallet' });
  }
  return ev;
}

function webhooksFor(status: TxnStatus, created: number, ref: string, amount: number): WebhookEvent[] {
  if (status === 'initiated' || status === 'pending' || status === 'cancelled') return [];
  const at = new Date(new Date(daysAgo(created)).getTime() + 2 * 60_000).toISOString();
  const type = status === 'failed' ? 'payment.failed' : 'payment.succeeded';
  const out: WebhookEvent[] = [
    { id: hex(10), type, verified: true, idempotencyKey: `idem_${hex(16)}`, receivedAt: at, payload: { reference: ref, amount, currency: 'IQD', status: type.split('.')[1] } },
  ];
  if (rng.bool(0.2)) {
    out.push({ ...out[0], id: hex(10), receivedAt: new Date(new Date(at).getTime() + 30_000).toISOString(), payload: { ...out[0].payload, duplicate: true } });
  }
  if (status === 'refunded' || status === 'partially_refunded') {
    out.push({ id: hex(10), type: 'refund.completed', verified: true, idempotencyKey: `idem_${hex(16)}`, receivedAt: daysAgo(created - 3), payload: { reference: ref } });
  }
  return out;
}

const payers = students.filter((s) => s.packageId);
const statuses = rng.shuffle(STATUS_PLAN.flatMap(([s, n]) => Array<TxnStatus>(n).fill(s)));

export const transactions: Transaction[] = statuses
  .map((status, i) => {
    const student = payers[i % payers.length];
    const pkg = packages.find((p) => p.id === student.packageId) ?? packages[0];
    const school = schools.find((s) => s.id === student.schoolId);
    const promo = student.referralCode ?? (rng.bool(0.2) ? rng.pick(PROMOS) : null);
    const discount = promo ? Math.round((pkg.price * rng.pick([0.1, 0.15, 0.2])) / 1000) * 1000 : 0;
    const amount = pkg.price - discount;
    // Recent-weighted spread over ~11 months so monthly charts derive from real transactions.
    const created = i < 12 ? rng.int(0, 6) : Math.floor(Math.pow(rng.next(), 1.35) * 330);
    const gateway = rng.weighted(GATEWAYS);
    const ref = `EDW-${(26000 + i * 37).toString(36).toUpperCase()}-${hex(4).toUpperCase()}`;
    return {
      id: `txn_${String(i + 1).padStart(4, '0')}`,
      ref,
      studentId: student.id,
      packageId: pkg.id,
      amount,
      currency: 'IQD' as const,
      discount,
      gateway,
      status,
      refundedAmount: status === 'refunded' ? amount : status === 'partially_refunded' ? Math.round(amount * 0.4 / 1000) * 1000 : 0,
      promoCode: promo,
      schoolId: student.source === 'school' ? (school?.id ?? null) : null,
      marketerId: student.marketerId,
      createdAt: daysAgo(created, rng.int(0, 22)),
      timeline: timelineFor(status, created, gateway),
      webhooks: webhooksFor(status, created, ref, amount),
    };
  })
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const refunds: Refund[] = [
  ...transactions
    .filter((t) => t.status === 'refunded' || t.status === 'partially_refunded')
    .map<Refund>((t, i) => ({
      id: `rfd_${i + 1}`,
      transactionId: t.id,
      studentId: t.studentId,
      amount: t.refundedAmount,
      currency: t.currency,
      kind: t.status === 'refunded' ? 'full' : 'partial',
      reason: rng.pick(['Duplicate payment', 'Student switched to a smaller package', 'Purchased by mistake', 'Technical issue prevented access for 5 days']),
      status: 'approved',
      requestedBy: 'Mariam Abbas',
      requestedAt: t.timeline.find((e) => e.status === 'refund_requested')?.at ?? t.createdAt,
      decidedBy: 'Huda Kareem',
      decidedAt: t.timeline[t.timeline.length - 1].at,
    })),
  ...transactions
    .filter((t) => t.status === 'paid')
    .slice(2, 6)
    .map<Refund>((t, i) => ({
      id: `rfd_p${i + 1}`,
      transactionId: t.id,
      studentId: t.studentId,
      amount: i % 2 ? Math.round(t.amount / 2 / 1000) * 1000 : t.amount,
      currency: t.currency,
      kind: i % 2 ? 'partial' : 'full',
      reason: ['Paid twice through ZainCash', 'Wants to downgrade to Math Mastery', 'Parent disputes the charge', 'Enrolled in the wrong package'][i],
      status: 'pending',
      requestedBy: 'Mariam Abbas',
      requestedAt: daysAgo(i + 1, 3),
      decidedBy: null,
      decidedAt: null,
    })),
];
