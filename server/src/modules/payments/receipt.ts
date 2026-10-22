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

// ── minimal PDF writer (text only, Helvetica) ──────────────────────────────────────────────────────

const pdfText = (s: string) =>
  s
    .replace(/[^\x20-\x7E]/g, (ch) => ({ '—': '-', '–': '-', '·': '-', '•': '-' })[ch] ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const money = (n: number, cur: string) => `${n.toLocaleString('en-US')} ${cur}`;

export function renderReceiptPdf(r: ReceiptDto, locale: 'en' | 'ar'): Buffer {
  const lab = locale === 'ar'
    ? { title: 'RECEIPT / Eisal', no: 'Receipt no.', ref: 'Reference', paid: 'Paid at', billed: 'Billed to', via: 'Paid via', sub: 'Subtotal', disc: 'Discount', tot: 'Total', ref2: 'Refunded' }
    : { title: 'RECEIPT', no: 'Receipt no.', ref: 'Reference', paid: 'Paid at', billed: 'Billed to', via: 'Paid via', sub: 'Subtotal', disc: 'Discount', tot: 'Total', ref2: 'Refunded' };
  const ops: string[] = [];
  let y = 790;
  const line = (text: string, size = 11, bold = false, x = 50) => {
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfText(text)}) Tj ET`);
    y -= size + 8;
  };
  const pair = (k: string, v: string) => {
    ops.push(`BT /F1 11 Tf 50 ${y} Td (${pdfText(k)}) Tj ET`);
    ops.push(`BT /F2 11 Tf 330 ${y} Td (${pdfText(v)}) Tj ET`);
    y -= 19;
  };
  line(r.company.name.en, 18, true);
  line(r.company.address.en, 10);
  line(r.company.email, 10);
  y -= 10;
  line(lab.title, 16, true);
  pair(lab.no, r.receiptNumber);
  pair(lab.ref, r.ref);
  pair(lab.paid, r.paidAt.replace('T', ' ').slice(0, 16) + ' UTC');
  pair(lab.billed, `${r.billedTo.name.en} (${r.billedTo.mobile})`);
  pair(lab.via, r.gatewayName.en);
  y -= 6;
  ops.push(`50 ${y + 12} m 545 ${y + 12} l S`);
  for (const l of r.lines) pair(l.description.en, money(l.amount, r.currency));
  pair(lab.sub, money(r.subtotal, r.currency));
  pair(`${lab.disc}${r.promoCode ? ` (${r.promoCode})` : ''}`, `-${money(r.discount, r.currency)}`);
  pair(lab.tot, money(r.total, r.currency));
  if (r.refunded) pair(lab.ref2, `-${money(r.refunded, r.currency)}`);
  y -= 10;
  line(r.taxNote.en, 9);
  const content = ops.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
