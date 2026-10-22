/**
 * Branded, responsive, bilingual email layout (pure — no I/O).
 *
 * Every email carries BOTH languages: the recipient's primary language first (Arabic RTL by default), then the
 * other one, each in its own `dir`/`lang` block. Table-based markup with inline styles (Gmail, Outlook, Apple Mail,
 * mobile clients), a hidden preheader, a bulletproof CTA button and a plain-text alternative built from the same
 * content. All dynamic values are HTML-escaped here; callers pass raw strings.
 */

export type EmailLang = 'en' | 'ar';

export interface EmailSection {
  /** Big heading at the top of the language block. */
  heading: string;
  /** Short greeting line (e.g. "Hi Ahmed,"). */
  greeting?: string;
  /** Body paragraphs (plain text; newlines inside a paragraph become line breaks). */
  paragraphs: string[];
  /** Label/value rows shown in a summary box (receipt lines, device details, ...). */
  details?: { label: string; value: string }[];
  /** Call-to-action button. */
  cta?: { label: string; url: string };
  /** Quoted block (e.g. a support reply). */
  quote?: string;
  /** Small print below the button (expiry, "ignore if not you", ...). */
  note?: string;
}

export interface EmailContent {
  subject: { en: string; ar: string };
  preheader: { en: string; ar: string };
  en: EmailSection;
  ar: EmailSection;
  /** Visual tone of the top accent bar. */
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  /** Only the primary-language block (content authored in one language, e.g. campaign texts). */
  monolingual?: boolean;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BRAND = {
  navy: '#0B1F3A',
  navyLight: '#15325C',
  gold: '#C9A24A',
  ink: '#1F2937',
  muted: '#6B7280',
  line: '#E5E7EB',
  bg: '#F3F4F6',
  card: '#FFFFFF',
  soft: '#F8FAFC',
};
const TONES = { brand: BRAND.gold, success: '#16A34A', warning: '#D97706', danger: '#DC2626' } as const;

const FONT = {
  en: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  ar: "'Segoe UI', Tahoma, 'Geeza Pro', 'Noto Sans Arabic', Arial, sans-serif",
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Only http(s) / mailto links are rendered as links (defence against `javascript:` in variables). */
export function safeUrl(url: string): string {
  return /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : '#';
}

const nl2br = (s: string) => escapeHtml(s).replace(/\r?\n/g, '<br>');

function sectionHtml(lang: EmailLang, s: EmailSection): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const align = lang === 'ar' ? 'right' : 'left';
  const font = FONT[lang];
  const p = (html: string, extra = '') => `<p style="margin:0 0 14px;font-family:${font};font-size:15px;line-height:1.7;color:${BRAND.ink};text-align:${align};${extra}">${html}</p>`;
  const parts: string[] = [];
  parts.push(`<h1 style="margin:0 0 16px;font-family:${font};font-size:22px;line-height:1.35;font-weight:700;color:${BRAND.navy};text-align:${align};">${escapeHtml(s.heading)}</h1>`);
  if (s.greeting) parts.push(p(escapeHtml(s.greeting), 'font-weight:600;'));
  for (const para of s.paragraphs) parts.push(p(nl2br(para)));
  if (s.quote) {
    const side = lang === 'ar' ? 'right' : 'left';
    parts.push(
      `<div style="margin:4px 0 18px;padding:14px 16px;background:${BRAND.soft};border-${side}:4px solid ${BRAND.gold};border-radius:6px;font-family:${font};font-size:15px;line-height:1.7;color:${BRAND.ink};text-align:${align};">${nl2br(s.quote)}</div>`,
    );
  }
  if (s.details?.length) {
    const rows = s.details
      .map(
        (d, i) =>
          `<tr><td style="padding:10px 14px;font-family:${font};font-size:14px;color:${BRAND.muted};text-align:${align};${i ? `border-top:1px solid ${BRAND.line};` : ''}">${escapeHtml(d.label)}</td>` +
          `<td style="padding:10px 14px;font-family:${font};font-size:14px;font-weight:600;color:${BRAND.ink};text-align:${lang === 'ar' ? 'left' : 'right'};${i ? `border-top:1px solid ${BRAND.line};` : ''}" dir="auto">${escapeHtml(d.value)}</td></tr>`,
      )
      .join('');
    parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;border:1px solid ${BRAND.line};border-radius:8px;border-collapse:separate;background:${BRAND.soft};" dir="${dir}">${rows}</table>`);
  }
  if (s.cta) {
    const url = escapeHtml(safeUrl(s.cta.url));
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align === 'right' ? 'right' : 'left'}" style="margin:6px 0 18px;"><tr><td style="border-radius:8px;background:${BRAND.navy};" bgcolor="${BRAND.navy}">` +
        `<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 28px;font-family:${font};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;border:1px solid ${BRAND.navy};">${escapeHtml(s.cta.label)}</a>` +
        `</td></tr></table><div style="clear:both;line-height:0;font-size:0;">&nbsp;</div>`,
    );
    const fallback = lang === 'ar' ? 'إذا لم يعمل الزر، انسخ هذا الرابط والصقه في المتصفح:' : "If the button doesn't work, copy and paste this link into your browser:";
    parts.push(
      `<p style="margin:0 0 14px;font-family:${font};font-size:12px;line-height:1.6;color:${BRAND.muted};text-align:${align};">${fallback}<br><a href="${url}" style="color:${BRAND.navyLight};word-break:break-all;" dir="ltr">${escapeHtml(safeUrl(s.cta.url))}</a></p>`,
    );
  }
  if (s.note) parts.push(`<p style="margin:0;font-family:${font};font-size:13px;line-height:1.6;color:${BRAND.muted};text-align:${align};">${nl2br(s.note)}</p>`);
  return `<div dir="${dir}" lang="${lang}" style="direction:${dir};text-align:${align};">${parts.join('')}</div>`;
}

function sectionText(s: EmailSection): string {
  const out: string[] = [s.heading, '='.repeat(Math.min(60, Math.max(8, s.heading.length))), ''];
  if (s.greeting) out.push(s.greeting, '');
  for (const p of s.paragraphs) out.push(p, '');
  if (s.quote) out.push(s.quote.split(/\r?\n/).map((l) => `> ${l}`).join('\n'), '');
  if (s.details?.length) {
    for (const d of s.details) out.push(`${d.label}: ${d.value}`);
    out.push('');
  }
  if (s.cta) out.push(`${s.cta.label}:`, s.cta.url, '');
  if (s.note) out.push(s.note, '');
  return out.join('\n').trim();
}

export interface LayoutOptions {
  /** Primary language (first block). Default Arabic. */
  lang?: EmailLang;
  /** Base URL used for the footer link. */
  siteUrl?: string;
  /** Footer reason line override (e.g. why the recipient gets this). */
  footerReason?: { en: string; ar: string };
}

/** Renders subject + HTML + plain text for one email. */
export function renderEmail(content: EmailContent, opts: LayoutOptions = {}): RenderedEmail {
  const primary: EmailLang = opts.lang === 'en' ? 'en' : 'ar';
  const secondary: EmailLang = primary === 'ar' ? 'en' : 'ar';
  const accent = TONES[content.tone ?? 'brand'];
  const mono = content.monolingual === true;
  const subject = mono || content.subject[primary] === content.subject[secondary] ? content.subject[primary] : `${content.subject[primary]} | ${content.subject[secondary]}`;
  const year = new Date().getUTCFullYear();
  const reason = opts.footerReason ?? {
    en: 'You are receiving this email because of activity on your EDUWAY account. This is an automated message — please do not reply.',
    ar: 'تصلك هذه الرسالة بسبب نشاط على حسابك في EDUWAY. هذه رسالة آلية — يرجى عدم الرد عليها.',
  };
  const divider = (lang: EmailLang) =>
    `<tr><td style="padding:0 32px;" class="px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px dashed ${BRAND.line};font-size:0;line-height:0;padding-top:22px;">&nbsp;</td></tr></table>` +
    `<p dir="${lang === 'ar' ? 'rtl' : 'ltr'}" style="margin:0 0 14px;font-family:${FONT[lang]};font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:${BRAND.muted};text-align:${lang === 'ar' ? 'right' : 'left'};">${lang === 'ar' ? 'النسخة العربية' : 'English version'}</p></td></tr>`;
  const site = opts.siteUrl ? escapeHtml(safeUrl(opts.siteUrl)) : null;

  const html = `<!doctype html>
<html lang="${primary}" dir="${primary === 'ar' ? 'rtl' : 'ltr'}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<style>
  body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
  a{color:${BRAND.navyLight};}
  @media only screen and (max-width:620px){
    .container{width:100%!important;border-radius:0!important;}
    .px{padding-left:20px!important;padding-right:20px!important;}
    h1{font-size:20px!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.bg};">${escapeHtml(content.preheader[primary])} &#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};" bgcolor="${BRAND.bg}">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${BRAND.card};border-radius:12px;overflow:hidden;" bgcolor="${BRAND.card}">
    <tr><td style="background:${BRAND.navy};padding:22px 32px;" bgcolor="${BRAND.navy}" class="px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="font-family:${FONT.en};font-size:24px;font-weight:800;letter-spacing:.08em;color:#ffffff;" dir="ltr">EDU<span style="color:${BRAND.gold};">WAY</span></td>
        <td align="right" style="font-family:${FONT.ar};font-size:13px;color:#C7D2FE;" dir="rtl">منصة إديوواي التعليمية</td>
      </tr></table>
    </td></tr>
    <tr><td style="height:4px;line-height:4px;font-size:0;background:${accent};" bgcolor="${accent}">&nbsp;</td></tr>
    <tr><td style="padding:30px 32px 10px;" class="px">${sectionHtml(primary, content[primary])}</td></tr>
    ${mono ? '<tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>' : `${divider(secondary)}
    <tr><td style="padding:0 32px 26px;" class="px">${sectionHtml(secondary, content[secondary])}</td></tr>`}
    <tr><td style="background:${BRAND.soft};border-top:1px solid ${BRAND.line};padding:20px 32px;" class="px">
      <p dir="rtl" style="margin:0 0 8px;font-family:${FONT.ar};font-size:12px;line-height:1.6;color:${BRAND.muted};text-align:right;">${escapeHtml(reason.ar)}</p>
      <p dir="ltr" style="margin:0 0 8px;font-family:${FONT.en};font-size:12px;line-height:1.6;color:${BRAND.muted};text-align:left;">${escapeHtml(reason.en)}</p>
      <p style="margin:0;font-family:${FONT.en};font-size:12px;color:${BRAND.muted};text-align:center;" dir="ltr">&copy; ${year} EDUWAY${site ? ` &middot; <a href="${site}" style="color:${BRAND.navyLight};text-decoration:none;">${escapeHtml(opts.siteUrl!.replace(/^https?:\/\//, ''))}</a>` : ''}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    'EDUWAY',
    '',
    sectionText(content[primary]),
    '',
    ...(mono ? [] : ['------------------------------------------------------------', '', sectionText(content[secondary]), '']),
    '------------------------------------------------------------',
    reason[primary],
    reason[secondary],
    `(c) ${year} EDUWAY${opts.siteUrl ? ` - ${opts.siteUrl}` : ''}`,
  ].join('\n');

  return { subject, html, text };
}
