/**
 * Receipt PDF (PAY-10 / ADM-PAY-04 `format=pdf`) in English or Arabic.
 *
 * Arabic support:
 *  - Font: Noto Sans Arabic (server/assets/fonts, SIL OFL 1.1 — OFL.txt alongside) is embedded and subset by
 *    pdfkit. Latin/digit runs use the standard Helvetica faces.
 *  - Bidi: every line is split with the Unicode Bidirectional Algorithm (bidi-js) into directional runs that are
 *    placed in visual order; mirrored characters (brackets) are swapped in RTL runs.
 *  - Shaping: Arabic runs are handed to pdfkit in logical order; fontkit applies the OpenType `arab` shaper
 *    (initial/medial/final/isolated forms + lam-alef ligatures) and returns the glyphs in visual (RTL) order.
 * The Arabic receipt mirrors the layout (labels on the right, amounts on the left).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bidiFactory from 'bidi-js';
import PDFDocument from 'pdfkit';
import type { ReceiptDto } from './receipt.js';

type Lang = 'en' | 'ar';
type Doc = InstanceType<typeof PDFDocument>;

const bidi = bidiFactory();

/** Walk up from this module (src/… or dist/src/…) to the server root that holds assets/fonts. */
function fontsDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'assets', 'fonts');
    if (existsSync(path.join(candidate, 'NotoSansArabic-Regular.ttf'))) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error('assets/fonts/NotoSansArabic-Regular.ttf not found');
}
let FONTS: { ar: string; arBold: string } | null = null;
const fonts = () => {
  if (!FONTS) {
    const d = fontsDir();
    FONTS = { ar: path.join(d, 'NotoSansArabic-Regular.ttf'), arBold: path.join(d, 'NotoSansArabic-Bold.ttf') };
  }
  return FONTS;
};

const isArabic = (c: number) =>
  (c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f) || (c >= 0x08a0 && c <= 0x08ff) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff);

const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«' };

interface Run {
  text: string;
  font: string;
  width: number;
}

/**
 * Splits `text` into visually ordered runs for a paragraph of direction `dir`.
 * Each run is drawn left→right at increasing x.
 */
export function bidiRuns(doc: Doc, text: string, dir: 'ltr' | 'rtl', size: number, bold: boolean): Run[] {
  if (!text) return [];
  const AR = bold ? 'ar-bold' : 'ar';
  const LAT = bold ? 'Helvetica-Bold' : 'Helvetica';
  const levels = bidi.getEmbeddingLevels(text, dir);
  const mirrored = bidi.getMirroredCharactersMap(text, levels);
  // bidi-js does not always report paired brackets; mirror the common ones on RTL levels ourselves.
  const mirror = (i: number) => {
    const ch = text[i] as string;
    if (mirrored.has(i)) return mirrored.get(i) as string;
    return ((levels.levels[i] ?? 0) & 1) === 1 ? (MIRROR[ch] ?? ch) : ch;
  };
  // Font per code unit: Arabic letters → Arabic face; everything else (incl. spaces, digits, punctuation) → Latin.
  // Spaces are their own Latin runs, so every Arabic word is shaped on its own (words never join across a space).
  const fontOf: string[] = [];
  for (let i = 0; i < text.length; i++) fontOf[i] = isArabic(text.charCodeAt(i)) ? AR : LAT;
  // Visual order of indices.
  const order = Array.from({ length: text.length }, (_, i) => i);
  for (const [s, e] of bidi.getReorderSegments(text, levels)) {
    const rev = order.slice(s, e + 1).reverse();
    order.splice(s, e - s + 1, ...rev);
  }
  // Group consecutive visual indices with the same font and direction.
  const groups: { idx: number[]; font: string; rtl: boolean }[] = [];
  for (const i of order) {
    const rtl = ((levels.levels[i] ?? 0) & 1) === 1;
    const f = fontOf[i] as string;
    const last = groups[groups.length - 1];
    if (last && last.font === f && last.rtl === rtl) last.idx.push(i);
    else groups.push({ idx: [i], font: f, rtl });
  }
  return groups.map((g) => {
    const visual = g.idx.map(mirror).join('').replace(/[‎‏⁦-⁩]/g, '');
    // Arabic runs go to fontkit in logical order (it shapes and reverses them); everything else is already visual.
    const hasArabic = g.font === AR && g.idx.some((i) => isArabic(text.charCodeAt(i)));
    const out = g.rtl && hasArabic ? Array.from(visual).reverse().join('') : visual;
    doc.font(g.font).fontSize(size);
    return { text: out, font: g.font, width: doc.widthOfString(out) };
  });
}

interface DrawOpts {
  size?: number;
  bold?: boolean;
  color?: string;
  align?: 'left' | 'right' | 'center';
  dir?: 'ltr' | 'rtl';
}

/**
 * Draws one line of mixed-direction text inside [x, x + width]; `y` is the top of the line box.
 * All runs share one alphabetic baseline (Arabic and Latin faces have different ascenders).
 */
export function drawLine(doc: Doc, text: string, x: number, y: number, width: number, o: DrawOpts = {}): number {
  const size = o.size ?? 10;
  const runs = bidiRuns(doc, text, o.dir ?? 'ltr', size, !!o.bold);
  const total = runs.reduce((a, r) => a + r.width, 0);
  let cx = o.align === 'right' ? x + width - total : o.align === 'center' ? x + (width - total) / 2 : x;
  doc.fillColor(o.color ?? '#0B1F3A');
  const baseline = y + size * 0.85;
  // Arabic finals (e.g. meem) overhang their advance width; keep a hairline gap where the face changes.
  const gap = size * 0.08;
  const isAr = (f: string) => f.startsWith('ar');
  const gaps = runs.reduce((a, r, i) => a + (i && isAr(r.font) !== isAr((runs[i - 1] as Run).font) ? gap : 0), 0);
  cx -= o.align === 'right' ? gaps : o.align === 'center' ? gaps / 2 : 0;
  runs.forEach((r, i) => {
    if (i && isAr(r.font) !== isAr((runs[i - 1] as Run).font)) cx += gap;
    doc.font(r.font).fontSize(size).text(r.text, cx, baseline, { lineBreak: false, baseline: 'alphabetic' });
    cx += r.width;
  });
  return total;
}

const LABELS: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Payment receipt',
    no: 'Receipt no.',
    ref: 'Reference',
    paid: 'Paid at',
    issued: 'Issued at',
    billed: 'Billed to',
    mobile: 'Mobile',
    via: 'Paid via',
    item: 'Description',
    amount: 'Amount',
    sub: 'Subtotal',
    disc: 'Discount',
    tot: 'Total paid',
    refunded: 'Refunded',
    status: 'PAID',
  },
  ar: {
    title: 'إيصال دفع',
    no: 'رقم الإيصال',
    ref: 'المرجع',
    paid: 'تاريخ الدفع',
    issued: 'تاريخ الإصدار',
    billed: 'فاتورة إلى',
    mobile: 'رقم الهاتف',
    via: 'طريقة الدفع',
    item: 'الوصف',
    amount: 'المبلغ',
    sub: 'المجموع الفرعي',
    disc: 'الخصم',
    tot: 'الإجمالي المدفوع',
    refunded: 'المبلغ المسترد',
    status: 'مدفوع',
  },
};

const money = (n: number, cur: string, lang: Lang) => {
  const unit = lang === 'ar' ? (cur === 'IQD' ? 'د.ع' : 'دولار') : cur;
  return `${n.toLocaleString('en-US')} ${unit}`;
};
/** Negative amount; in Arabic the signed number is an LTR isolate (LRI…PDI) so the minus stays on its left. */
const neg = (n: number, cur: string, lang: Lang) =>
  lang === 'ar' ? `⁦-${n.toLocaleString('en-US')}⁩ ${money(n, cur, lang).split(' ').slice(1).join(' ')}` : `-${money(n, cur, lang)}`;
const when = (isoDate: string) => `${isoDate.replace('T', ' ').slice(0, 16)} UTC`;

/** Renders the receipt PDF in `lang` (labels, bilingual fields and layout direction). */
export function renderReceiptPdf(r: ReceiptDto, lang: Lang): Promise<Buffer> {
  const L = LABELS[lang];
  const rtl = lang === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';
  const pick = (v: { en: string; ar: string }) => (rtl ? v.ar || v.en : v.en || v.ar);
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    info: { Title: `${L.title} ${r.receiptNumber}`, Author: pick(r.company.name), Subject: r.ref, Creator: 'EDUWAY' },
    lang: rtl ? 'ar' : 'en',
  } as PDFKit.PDFDocumentOptions);
  const f = fonts();
  doc.registerFont('ar', f.ar);
  doc.registerFont('ar-bold', f.arBold);

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const M = 50;
  const W = 595.28 - M * 2;
  const NAVY = '#0B1F3A';
  const GOLD = '#C9A24A';
  const MUTED = '#64748B';
  const start = rtl ? 'right' : 'left';
  const end = rtl ? 'left' : 'right';

  // Header band
  doc.rect(0, 0, 595.28, 110).fill(NAVY);
  doc.rect(0, 110, 595.28, 4).fill(GOLD);
  drawLine(doc, pick(r.company.name), M, 32, W, { size: 20, bold: true, color: '#FFFFFF', align: start, dir });
  drawLine(doc, pick(r.company.address), M, 62, W, { size: 9.5, color: '#CBD5E1', align: start, dir });
  drawLine(doc, r.company.email, M, 78, W, { size: 9.5, color: '#CBD5E1', align: start, dir: 'ltr' });

  // Title + status
  let y = 140;
  drawLine(doc, L.title as string, M, y, W, { size: 18, bold: true, align: start, dir });
  const status = r.refunded >= r.total && r.total > 0 ? (rtl ? 'مسترد' : 'REFUNDED') : (L.status as string);
  doc.font(rtl ? 'ar-bold' : 'Helvetica-Bold').fontSize(9);
  const badgeW = 74;
  const bx = rtl ? M : M + W - badgeW;
  doc.roundedRect(bx, y + 2, badgeW, 20, 10).fill(r.refunded > 0 ? '#FEF3C7' : '#DCFCE7');
  drawLine(doc, status, bx, y + 6, badgeW, { size: 9, bold: true, color: r.refunded > 0 ? '#92400E' : '#166534', align: 'center', dir });

  // Meta grid (two columns of label/value pairs)
  y += 44;
  const meta: [string, string, 'ltr' | 'rtl'][] = [
    [L.no as string, r.receiptNumber, 'ltr'],
    [L.ref as string, r.ref, 'ltr'],
    [L.paid as string, when(r.paidAt), 'ltr'],
    [L.issued as string, when(r.issuedAt), 'ltr'],
    [L.billed as string, pick(r.billedTo.name), dir],
    [L.mobile as string, r.billedTo.mobile, 'ltr'],
    [L.via as string, pick(r.gatewayName), dir],
  ];
  const colW = W / 2 - 10;
  meta.forEach(([k, v, vdir], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = rtl ? M + W - (col + 1) * colW - col * 20 : M + col * (colW + 20);
    const cy = y + row * 38;
    drawLine(doc, k, cx, cy, colW, { size: 8.5, color: MUTED, align: start, dir });
    drawLine(doc, v, cx, cy + 13, colW, { size: 11, bold: true, align: start, dir: vdir });
  });
  y += Math.ceil(meta.length / 2) * 38 + 14;

  // Line items table
  doc.rect(M, y, W, 24).fill('#F1F5F9');
  drawLine(doc, L.item as string, M + 12, y + 7, W - 24, { size: 9, bold: true, color: MUTED, align: start, dir });
  drawLine(doc, L.amount as string, M + 12, y + 7, W - 24, { size: 9, bold: true, color: MUTED, align: end, dir });
  y += 32;
  for (const line of r.lines) {
    const descW = W * 0.65;
    drawLine(doc, pick(line.description), rtl ? M + W - 12 - descW : M + 12, y, descW, { size: 10.5, align: start, dir });
    drawLine(doc, money(line.amount, r.currency, lang), M + 12, y, W - 24, { size: 10.5, align: end, dir });
    y += 22;
  }
  doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.6).strokeColor('#E2E8F0').stroke();
  y += 12;

  // Totals
  const totals: [string, string, boolean][] = [[L.sub as string, money(r.subtotal, r.currency, lang), false]];
  if (r.discount) totals.push([`${L.disc}${r.promoCode ? ` (${r.promoCode})` : ''}`, neg(r.discount, r.currency, lang), false]);
  totals.push([L.tot as string, money(r.total, r.currency, lang), true]);
  if (r.refunded) totals.push([L.refunded as string, neg(r.refunded, r.currency, lang), false]);
  const tw = 240;
  const tx = rtl ? M : M + W - tw;
  for (const [k, v, strong] of totals) {
    if (strong) {
      doc.rect(tx, y - 6, tw, 26).fill(NAVY);
      drawLine(doc, k, tx + 10, y, tw - 20, { size: 11, bold: true, color: '#FFFFFF', align: start, dir });
      drawLine(doc, v, tx + 10, y, tw - 20, { size: 11, bold: true, color: GOLD, align: end, dir });
      y += 30;
    } else {
      drawLine(doc, k, tx + 10, y, tw - 20, { size: 10, color: MUTED, align: start, dir });
      drawLine(doc, v, tx + 10, y, tw - 20, { size: 10, bold: true, align: end, dir });
      y += 20;
    }
  }

  // Tax note + footer
  y += 24;
  const note = pick(r.taxNote);
  if (note) drawLine(doc, note, M, y, W, { size: 8.5, color: MUTED, align: start, dir });
  drawLine(doc, rtl ? 'شكراً لاختياركم EDUWAY' : 'Thank you for learning with EDUWAY', M, 800, W, { size: 9, color: MUTED, align: 'center', dir });

  doc.end();
  return done;
}
