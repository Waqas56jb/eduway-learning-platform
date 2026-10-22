import { describe, expect, it } from 'vitest';
import PDFDocument from 'pdfkit';
import { bidiRuns, renderReceiptPdf } from '../../src/modules/payments/receipt-pdf.js';
import type { ReceiptDto } from '../../src/modules/payments/receipt.js';

const dto: ReceiptDto = {
  receiptNumber: 'EW-R-2026-000123',
  ref: 'EW-TX-8F3K2',
  issuedAt: '2026-10-22T10:15:00.000Z',
  paidAt: '2026-10-22T10:14:00.000Z',
  company: { name: { en: 'EDUWAY Learning', ar: 'إيدوواي للتعليم' }, address: { en: 'Baghdad, Iraq', ar: 'بغداد، العراق' }, email: 'billing@eduway.iq' },
  billedTo: { name: { en: 'Ali Hassan', ar: 'علي حسن' }, mobile: '+9647701234567' },
  gateway: 'zaincash',
  gatewayName: { en: 'ZainCash', ar: 'زين كاش' },
  lines: [{ description: { en: 'Full Access — yearly plan', ar: 'الوصول الكامل — خطة سنوية' }, amount: 150000 }],
  subtotal: 150000,
  discount: 15000,
  promoCode: 'WELCOME10',
  total: 135000,
  refunded: 0,
  currency: 'IQD',
  taxNote: { en: 'Prices include taxes.', ar: 'الأسعار تشمل الضرائب.' },
};

function doc() {
  const d = new PDFDocument();
  d.registerFont('ar', 'assets/fonts/NotoSansArabic-Regular.ttf');
  d.registerFont('ar-bold', 'assets/fonts/NotoSansArabic-Bold.ttf');
  return d;
}

describe('receipt PDF', () => {
  it('renders an English receipt with the standard fonts only', async () => {
    const pdf = await renderReceiptPdf(dto, 'en');
    const s = pdf.toString('latin1');
    expect(s.startsWith('%PDF-')).toBe(true);
    expect(s).toContain('/Helvetica');
    expect(s).not.toContain('NotoSansArabic');
  });

  it('embeds Noto Sans Arabic for the Arabic receipt', async () => {
    const pdf = await renderReceiptPdf(dto, 'ar');
    const s = pdf.toString('latin1');
    expect(s.startsWith('%PDF-')).toBe(true);
    expect(s).toMatch(/\/FontName \/[A-Z]{6}\+NotoSansArabic/);
    expect(s).toContain('/ToUnicode');
  });

  it('orders mixed Arabic / Latin text visually (RTL paragraph)', () => {
    const runs = bidiRuns(doc(), 'الخصم (WELCOME10)', 'rtl', 10, false).map((r) => r.text);
    // Left → right: mirrored "(" , the code, ") ", then the Arabic word (logical order; fontkit reverses it when shaping).
    expect(runs).toEqual(['(', 'WELCOME10', ') ', 'الخصم']);
  });

  it('keeps the minus sign left of a negative amount inside an LTR isolate', () => {
    const runs = bidiRuns(doc(), '⁦-15,000⁩ د.ع', 'rtl', 10, false).map((r) => r.text).filter(Boolean);
    expect(runs).toEqual(['ع', '.', 'د', ' ', '-15,000']);
  });

  it('shapes each Arabic word separately (spaces are Latin runs)', () => {
    const runs = bidiRuns(doc(), 'إيصال دفع', 'rtl', 10, false);
    expect(runs.map((r) => [r.text, r.font])).toEqual([
      ['دفع', 'ar'],
      [' ', 'Helvetica'],
      ['إيصال', 'ar'],
    ]);
  });
});
