/** Transactional email: templates, layout, From alignment, throttle, dispatch rendering — mocked transport, no SMTP. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Transporter } from 'nodemailer';
import { devRecipient, parseAddress, resolveFrom, setMailTransport } from '../../src/common/providers/mail.js';
import { EMAIL_TEMPLATES, SECRET_TEMPLATES, buildEmailContent, formatMoney, renderTemplateEmail, type EmailTemplateKey, type EmailVars } from '../../src/modules/notifications/email/catalog.js';
import { escapeHtml, renderEmail, safeUrl } from '../../src/modules/notifications/email/layout.js';
import { absoluteUserLink, emailRateLimiter, isEmailAddress, renderEmailPayload, sendTemplateNow } from '../../src/modules/notifications/email/send.js';
import { sendEmail } from '../../src/modules/notifications/channels.js';
import { deviceLabel } from '../../src/modules/auth/admin-auth.service.js';

vi.mock('../../src/modules/payments/receipt.js', () => ({
  buildReceipt: vi.fn(async () => ({
    receiptNumber: 'EW-R-0001',
    ref: 'PAY-1',
    issuedAt: '2026-10-01T10:00:00.000Z',
    paidAt: '2026-10-01T10:00:00.000Z',
    company: { name: { en: 'EDUWAY', ar: 'إديوواي' }, address: { en: 'Baghdad', ar: 'بغداد' }, email: 'billing@eduway.iq' },
    billedTo: { name: { en: 'Ali', ar: 'علي' }, mobile: '+9647700000000' },
    gateway: 'zaincash',
    gatewayName: { en: 'ZainCash', ar: 'زين كاش' },
    lines: [{ description: { en: 'Full year', ar: 'سنة كاملة' }, amount: 150000 }],
    subtotal: 150000,
    discount: 0,
    promoCode: null,
    total: 150000,
    refunded: 0,
    currency: 'IQD',
    taxNote: { en: 'VAT included', ar: 'شامل الضريبة' },
  })),
  renderReceiptPdf: vi.fn(async () => Buffer.alloc(16, 0x25)),
}));

const L = (en: string, ar: string) => ({ en, ar });
const SAMPLE: Record<EmailTemplateKey, EmailVars> = {
  admin_password_reset: { name: L('Sara', 'سارة'), link: 'https://admin.eduway.iq/reset-password?token=abc', minutes: 30 },
  admin_invite: { name: L('Omar', 'عمر'), link: 'https://admin.eduway.iq/accept-invite?token=xyz', hours: 168, email: 'omar@eduway.iq', roleName: L('Content Manager', 'مدير المحتوى'), inviter: L('Sara', 'سارة') },
  admin_password_changed: { name: L('Sara', 'سارة'), via: 'change', at: '2026-10-23T09:00:00Z', ip: '10.0.0.1', securityLink: 'https://admin.eduway.iq/profile' },
  admin_mfa_enabled: { name: L('Sara', 'سارة'), at: '2026-10-23T09:00:00Z', securityLink: 'https://admin.eduway.iq/profile' },
  admin_mfa_disabled: { name: L('Sara', 'سارة'), at: '2026-10-23T09:00:00Z', securityLink: 'https://admin.eduway.iq/profile', byAdmin: L('Omar', 'عمر') },
  admin_new_device_login: { name: L('Sara', 'سارة'), at: '2026-10-23T09:00:00Z', ip: '10.0.0.1', device: 'Chrome on Windows', sessionsLink: 'https://admin.eduway.iq/profile' },
  admin_alert: { name: L('Sara', 'سارة'), title: L('New support ticket EW-T-10001', 'تذكرة دعم جديدة EW-T-10001'), body: L('Video does not play', 'الفيديو لا يعمل'), link: 'https://admin.eduway.iq/support?ticket=EW-T-10001', kind: 'info' },
  admin_export_ready: { name: L('Sara', 'سارة'), report: L('payments', 'payments'), format: 'xlsx', rows: 12000, link: 'https://admin.eduway.iq/analytics/exports?download=1', expiresAt: '2026-11-22T00:00:00Z' },
  email_verification: { name: L('Ali', 'علي'), link: 'https://eduway.iq/verify-email?token=t', hours: 24 },
  payment_receipt: { name: L('Ali', 'علي'), package: L('Full Year', 'الباقة السنوية'), amount: 150000, currency: 'IQD', ref: 'PAY-1', receiptNumber: 'EW-R-0001', paidAt: '2026-10-01T10:00:00Z', until: '2027-10-01T00:00:00Z', gateway: 'ZainCash', link: 'https://eduway.iq/student/subscription' },
  subscription_activated: { name: L('Ali', 'علي'), package: L('Full Year', 'الباقة السنوية'), until: '2027-10-01T00:00:00Z', link: 'https://eduway.iq/student/dashboard' },
  subscription_expiring: { name: L('Ali', 'علي'), package: L('Full Year', 'الباقة السنوية'), days: 3, until: '2026-10-26T00:00:00Z', link: 'https://eduway.iq/student/subscription' },
  subscription_expired: { name: L('Ali', 'علي'), package: L('Full Year', 'الباقة السنوية'), link: 'https://eduway.iq/student/subscription' },
  support_reply: { name: L('Ali', 'علي'), ticket: 'EW-T-10001', subject: L('Video issue', 'Video issue'), message: 'Fixed!\nPlease refresh.', link: 'https://eduway.iq/student/notifications' },
  notification: { title: L('New lesson', 'درس جديد'), body: L('A new lesson is live.', 'تم نشر درس جديد.'), link: 'https://eduway.iq/student/progress' },
};

afterEach(() => {
  setMailTransport(null);
  emailRateLimiter.reset();
});

/** A transport that records every message instead of sending it. */
function capture(fail?: Error): { t: Transporter; sent: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = [];
  const t = {
    sendMail: vi.fn(async (m: Record<string, unknown>) => {
      if (fail) throw fail;
      sent.push(m);
      return { messageId: `<test-${sent.length}@eduway>` };
    }),
  } as unknown as Transporter;
  return { t, sent };
}

describe('email templates (bilingual, RTL default)', () => {
  it.each(EMAIL_TEMPLATES.map((k) => [k]))('%s renders subject, html and text in both languages', (key) => {
    const r = renderTemplateEmail(key as EmailTemplateKey, SAMPLE[key as EmailTemplateKey]);
    const c = buildEmailContent(key as EmailTemplateKey, SAMPLE[key as EmailTemplateKey]);
    expect(r.subject.length).toBeGreaterThan(3);
    expect(r.html).toContain('<!doctype html>');
    expect(r.html).toMatch(/<html lang="ar" dir="rtl"/); // Arabic first by default
    expect(r.html).toContain('dir="rtl"');
    expect(r.html).toContain(escapeHtml(c.ar.heading));
    if (!c.monolingual) {
      expect(r.html).toContain('dir="ltr"');
      expect(r.html).toContain(escapeHtml(c.en.heading));
      expect(r.text).toContain(c.en.heading);
    }
    expect(r.text).toContain(c.ar.heading);
    if (c.ar.cta) {
      expect(r.text).toContain(c.ar.cta.url);
      expect(r.html).toContain(escapeHtml(c.ar.cta.url));
    }
    expect(r.html).not.toMatch(/undefined|\[object Object\]/);
    expect(r.text).not.toMatch(/undefined|\[object Object\]/);
  });

  it('English-first when the recipient language is en', () => {
    const r = renderTemplateEmail('admin_password_reset', SAMPLE.admin_password_reset, { lang: 'en' });
    expect(r.html).toMatch(/<html lang="en" dir="ltr"/);
    expect(r.subject.startsWith('Reset your EDUWAY admin password')).toBe(true);
    expect(r.html.indexOf('Reset your password')).toBeLessThan(r.html.indexOf('إعادة تعيين كلمة المرور'));
  });

  it('escapes HTML in variables and refuses non-http links', () => {
    const r = renderTemplateEmail('support_reply', { ...SAMPLE.support_reply, message: '<script>alert(1)</script>', link: 'javascript:alert(1)' });
    expect(r.html).not.toContain('<script>alert(1)</script>');
    expect(r.html).toContain('&lt;script&gt;');
    expect(r.html).not.toContain('javascript:alert');
    expect(safeUrl('javascript:alert(1)')).toBe('#');
    expect(safeUrl('https://x.y/z')).toBe('https://x.y/z');
  });

  it('one-time-link templates are marked secret', () => {
    expect([...SECRET_TEMPLATES].sort()).toEqual(['admin_invite', 'admin_password_reset', 'email_verification']);
  });

  it('formats IQD amounts per language', () => {
    expect(formatMoney(150000, 'IQD', 'en')).toBe('150,000 IQD');
    expect(formatMoney(150000, 'IQD', 'ar')).toBe('150,000 د.ع');
  });

  it('monolingual layout renders only the primary block', () => {
    const r = renderEmail({ subject: L('Hi', 'Hi'), preheader: L('p', 'p'), en: { heading: 'Only', paragraphs: ['x'] }, ar: { heading: 'Only', paragraphs: ['x'] }, monolingual: true }, { lang: 'en' });
    expect(r.html.match(/>Only</g)?.length).toBe(1);
  });
});

describe('From address', () => {
  it('parses display-name addresses', () => {
    expect(parseAddress('EDUWAY <no-reply@eduway.iq>')).toEqual({ name: 'EDUWAY', address: 'no-reply@eduway.iq' });
    expect(parseAddress('"EDUWAY Team" <a@b.c>')).toEqual({ name: 'EDUWAY Team', address: 'a@b.c' });
    expect(parseAddress('a@b.c')).toEqual({ name: null, address: 'a@b.c' });
  });
  it('aligns the address with the Gmail account but keeps the display name', () => {
    expect(resolveFrom({ MAIL_FROM: 'EDUWAY <no-reply@eduway.iq>', SMTP_HOST: 'smtp.gmail.com', SMTP_URL: undefined, SMTP_USER: 'owner@gmail.com' })).toBe('"EDUWAY" <owner@gmail.com>');
    expect(resolveFrom({ MAIL_FROM: 'EDUWAY <owner@gmail.com>', SMTP_HOST: 'smtp.gmail.com', SMTP_URL: undefined, SMTP_USER: 'owner@gmail.com' })).toBe('"EDUWAY" <owner@gmail.com>');
    expect(resolveFrom({ MAIL_FROM: 'no-reply@eduway.iq', SMTP_HOST: undefined, SMTP_URL: 'smtps://u:p@smtp.gmail.com:465', SMTP_USER: 'owner@gmail.com' })).toBe('"EDUWAY" <owner@gmail.com>');
    expect(resolveFrom({ MAIL_FROM: 'EDUWAY <no-reply@eduway.iq>', SMTP_HOST: 'email-smtp.eu-west-1.amazonaws.com', SMTP_URL: undefined, SMTP_USER: 'AKIA123' })).toBe('"EDUWAY" <no-reply@eduway.iq>');
  });
});

describe('development recipient guard', () => {
  it('outside production only allowlisted mailboxes (and their +aliases) receive real mail', () => {
    const dev = { NODE_ENV: 'development' as const, MAIL_DEV_ALLOWLIST: undefined, SMTP_USER: 'owner@gmail.com' };
    expect(devRecipient('owner@gmail.com', dev)).toEqual({ to: 'owner@gmail.com', redirected: false });
    expect(devRecipient('owner+e2e@gmail.com', dev)).toEqual({ to: 'owner+e2e@gmail.com', redirected: false });
    expect(devRecipient('admin@gmail.com', dev)).toEqual({ to: 'owner@gmail.com', redirected: true });
    expect(devRecipient('a@x.iq', { ...dev, MAIL_DEV_ALLOWLIST: 'qa@x.iq, a@x.iq' })).toEqual({ to: 'a@x.iq', redirected: false });
    expect(devRecipient('admin@gmail.com', { ...dev, NODE_ENV: 'production' as const })).toEqual({ to: 'admin@gmail.com', redirected: false });
  });
});

describe('sending (mocked transport)', () => {
  it('sends HTML + text + display-name From', async () => {
    const { t, sent } = capture();
    setMailTransport(t);
    const r = await sendTemplateNow('owner@example.com', 'admin_mfa_enabled', SAMPLE.admin_mfa_enabled);
    expect(r.messageId).toBe('<test-1@eduway>');
    const m = sent[0] as { to: string; from: string; subject: string; html: string; text: string };
    expect(m.to).toBe('owner@example.com');
    expect(m.from).toMatch(/^"EDUWAY" </);
    expect(m.subject).toContain('تم تفعيل المصادقة الثنائية');
    expect(m.html).toContain('dir="rtl"');
    expect(m.text).toContain('Two-factor authentication is on');
  });

  it('attaches the receipt PDF', async () => {
    const { t, sent } = capture();
    setMailTransport(t);
    await sendTemplateNow('owner@example.com', 'payment_receipt', SAMPLE.payment_receipt, { attachments: [{ kind: 'receipt_pdf', paymentId: '00000000-0000-0000-0000-000000000001' }] });
    const m = sent[0] as { attachments: { filename: string; contentType: string; content: Buffer }[] };
    expect(m.attachments).toHaveLength(1);
    expect(m.attachments[0]?.filename).toBe('EDUWAY-receipt-EW-R-0001.pdf');
    expect(m.attachments[0]?.contentType).toBe('application/pdf');
  });

  it('renders plain campaign deliveries in the branded layout (bilingual when both texts exist)', async () => {
    const m = await renderEmailPayload({ title: 'Exam tomorrow', subject: 'Exam tomorrow', body: 'Good luck!', lang: 'en', data: { link: '/exams' }, i18n: { title: L('Exam tomorrow', 'امتحان غداً'), body: L('Good luck!', 'بالتوفيق!') } });
    expect(m.subject).toBe('Exam tomorrow | امتحان غداً');
    expect(m.html).toContain('Good luck!');
    expect(m.html).toContain('بالتوفيق!');
    expect(m.text).toMatch(/https?:\/\/[^\s]+\/student\/exams/);
  });

  it('refuses scrubbed one-time links (admin retry after the link was removed)', async () => {
    await expect(renderEmailPayload({ template: 'admin_password_reset', vars: { name: 'x' }, scrubbed: true })).rejects.toMatchObject({ permanent: true });
  });

  it('classifies SMTP 5xx as permanent and connection errors as retryable', async () => {
    setMailTransport(capture(Object.assign(new Error('550 mailbox unavailable'), { responseCode: 550 })).t);
    await expect(sendEmail('x@example.com', { template: 'admin_alert', vars: SAMPLE.admin_alert })).rejects.toMatchObject({ permanent: true });
    setMailTransport(capture(Object.assign(new Error('ECONNRESET'), { code: 'ECONNECTION' })).t);
    await expect(sendEmail('x@example.com', { template: 'admin_alert', vars: SAMPLE.admin_alert })).rejects.toMatchObject({ permanent: false });
  });
});

describe('helpers', () => {
  it('throttles to N messages per rolling minute', () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(emailRateLimiter.tryAcquire(now, 3)).toBe(true);
    expect(emailRateLimiter.tryAcquire(now + 1000, 3)).toBe(false);
    expect(emailRateLimiter.tryAcquire(now + 60_001, 3)).toBe(true);
  });
  it('validates addresses and builds absolute web links', () => {
    expect(isEmailAddress('a@b.co')).toBe(true);
    expect(isEmailAddress('+9647700000000')).toBe(false);
    expect(isEmailAddress('a b@c.d')).toBe(false);
    expect(absoluteUserLink('/subscription')).toMatch(/\/student\/subscription$/);
    expect(absoluteUserLink('https://x.y/z')).toBe('https://x.y/z');
    expect(absoluteUserLink(null)).toBeNull();
  });
  it('labels admin devices from the user agent', () => {
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36')).toBe('Chrome on Windows');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iOS');
    expect(deviceLabel(null)).toBe('');
  });
});
