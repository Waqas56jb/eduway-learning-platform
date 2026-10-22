/**
 * Receipts (PAY-10 / ADM-PAY-04): ReceiptDto (JSON) + a dependency-free PDF rendering.
 * Company block, tax note and gateway names come from settings.payments (admin-editable).
 * PDF note: the built-in PDF fonts (Helvetica) cover Latin text only, so the PDF renders the English values of
 * bilingual fields with labels localized where representable; Arabic clients use the JSON receipt for display.
 */
import { T } from '../../config/constants.js';
import { db, pool, type Executor } from '../../config/db.js';
import { ConflictError, NotFoundError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { iso, L, newReceiptNumber, type Row } from '../commerce/lib.js';

export interface ReceiptDto {
  receiptNumber: string;
  ref: string;
  issuedAt: string;
  paidAt: string;
  company: { name: Localized; address: Localized; email: string };
  billedTo: { name: Localized; mobile: string };
  gateway: string;
  gatewayName: Localized;
  lines: { description: Localized; amount: number }[];
  subtotal: number;
  discount: number;
  promoCode: string | null;
  total: number;
  refunded: number;
  currency: 'IQD' | 'USD';
  taxNote: Localized;
}

/** Issue the receipt row for a paid payment (idempotent; unique per payment). */
export async function issueReceipt(paymentId: string, ex: Executor): Promise<string> {
  const existing = await db.scalar<string>(`SELECT number FROM ${T.receipts} WHERE payment_id = $1`, [paymentId], ex);
  if (existing) return existing;
  for (let i = 0; i < 5; i++) {
    const number = newReceiptNumber();
    const r = await db.maybeOne<{ number: string }>(
      `INSERT INTO ${T.receipts} (payment_id, number, data) VALUES ($1, $2, '{}'::jsonb) ON CONFLICT DO NOTHING RETURNING number`,
      [paymentId, number],
      ex,
    );
    if (r) return r.number;
    const again = await db.scalar<string>(`SELECT number FROM ${T.receipts} WHERE payment_id = $1`, [paymentId], ex);
    if (again) return again;
  }
  throw new ConflictError('ALREADY_EXISTS', { entity: 'receipt' });
}

export async function buildReceipt(paymentId: string, ownerId?: string): Promise<ReceiptDto> {
  const r = await db.maybeOne<Row>(
    `SELECT pay.*, rc.number AS receipt_number, rc.issued_at, u.name_en AS u_name_en, u.name_ar AS u_name_ar, u.phone AS u_phone,
            p.name_en AS p_name_en, p.name_ar AS p_name_ar
       FROM ${T.payments} pay
       JOIN ${T.users} u ON u.id = pay.user_id
       JOIN ${T.packages} p ON p.id = pay.package_id
       LEFT JOIN ${T.receipts} rc ON rc.payment_id = pay.id
      WHERE pay.id = $1`,
    [paymentId],
  );
  if (!r || (ownerId && r.user_id !== ownerId)) throw new NotFoundError('payment');
  if (!['paid', 'partially_refunded', 'refunded'].includes(String(r.status)) || !r.paid_at) throw new ConflictError('PAYMENT_NOT_PAID', { status: r.status });
  let number = r.receipt_number as string | null;
  if (!number) number = await issueReceipt(paymentId, pool);
  const settings = await settingsStore.get('payments');
  const gw = settings.gateways.find((g) => g.id === r.provider);
  const pkg = L(r, 'p_name');
  const cycle = r.billing_cycle === 'yearly' ? { en: 'yearly plan', ar: 'خطة سنوية' } : { en: 'plan', ar: 'خطة' };
  const total = Number(r.total);
  const discount = Number(r.discount);
  return {
    receiptNumber: number,
    ref: String(r.ref),
    issuedAt: iso(r.issued_at ?? r.paid_at),
    paidAt: iso(r.paid_at),
    company: settings.receiptCompany,
    billedTo: { name: L(r, 'u_name'), mobile: String(r.u_phone ?? '') },
    gateway: String(r.provider),
    gatewayName: gw?.name ?? { en: String(r.provider), ar: String(r.provider) },
    lines: [{ description: { en: `${pkg.en} — ${cycle.en}`, ar: `${pkg.ar} — ${cycle.ar}` }, amount: total + discount }],
    subtotal: total + discount,
    discount,
    promoCode: (r.promo_code as string | null) ?? null,
    total,
    refunded: Number(r.refunded_amount),
    currency: r.currency as 'IQD' | 'USD',
    taxNote: settings.taxNote,
  };
}

/** Language of the payer's account (fallback for the receipt PDF when the request names none). */
export async function payerLocale(paymentId: string): Promise<'en' | 'ar'> {
  const l = await db.scalar<string>(`SELECT u.locale FROM ${T.payments} pay JOIN ${T.users} u ON u.id = pay.user_id WHERE pay.id = $1`, [paymentId]);
  return l === 'en' ? 'en' : 'ar';
}

export { renderReceiptPdf } from './receipt-pdf.js';
