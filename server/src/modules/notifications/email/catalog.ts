/**
 * Transactional email catalogue (pure): template key + variables → bilingual EmailContent → rendered email.
 * Keys are stored on delivery rows (`payload.template`), so renaming one is a breaking change.
 */
import { renderEmail, type EmailContent, type EmailLang, type RenderedEmail } from './layout.js';

type L = { en: string; ar: string };
export type EmailVarValue = string | number | boolean | L | null | undefined;
export type EmailVars = Record<string, EmailVarValue>;

export const EMAIL_TEMPLATES = [
  'admin_password_reset',
  'admin_invite',
  'admin_password_changed',
  'admin_mfa_enabled',
  'admin_mfa_disabled',
  'admin_new_device_login',
  'admin_alert',
  'admin_export_ready',
  'email_verification',
  'payment_receipt',
  'subscription_activated',
  'subscription_expiring',
  'subscription_expired',
  'support_reply',
  'notification',
] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATES)[number];

/** Templates whose variables contain a secret (one-time link): never kept on the delivery row after sending. */
export const SECRET_TEMPLATES: ReadonlySet<EmailTemplateKey> = new Set(['admin_password_reset', 'admin_invite', 'email_verification']);

export const isEmailTemplate = (k: unknown): k is EmailTemplateKey => typeof k === 'string' && (EMAIL_TEMPLATES as readonly string[]).includes(k);

const str = (v: EmailVarValue, lang: EmailLang): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return v[lang] || v.en || v.ar || '';
  return String(v);
};

/** Date/time in Baghdad time, localized. Invalid / empty input returns ''. */
export function formatDate(v: EmailVarValue, lang: EmailLang, withTime = false): string {
  const s = str(v, 'en');
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-IQ' : 'en-GB', {
      timeZone: 'Asia/Baghdad',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(d);
  } catch {
    return d.toISOString().slice(0, withTime ? 16 : 10).replace('T', ' ');
  }
}

export function formatMoney(amount: EmailVarValue, currency: EmailVarValue, lang: EmailLang): string {
  const n = Number(str(amount, 'en'));
  if (!Number.isFinite(n)) return str(amount, lang);
  const cur = str(currency, 'en') || 'IQD';
  const num = n.toLocaleString('en-US', { maximumFractionDigits: cur === 'USD' ? 2 : 0 });
  if (cur === 'IQD') return lang === 'ar' ? `${num} د.ع` : `${num} IQD`;
  return lang === 'ar' ? `${num} ${cur}` : `${cur} ${num}`;
}

type Builder = (v: (k: string) => { en: string; ar: string }, raw: EmailVars) => EmailContent;
const both = (vars: EmailVars) => (k: string) => ({ en: str(vars[k], 'en'), ar: str(vars[k], 'ar') });
const hi = (name: L): L => ({ en: name.en ? `Hi ${name.en},` : 'Hello,', ar: name.ar ? `مرحباً ${name.ar}،` : 'مرحباً،' });
const notYou: L = {
  en: "If this wasn't you, reset your password immediately and contact your EDUWAY administrator.",
  ar: 'إذا لم تقم بذلك، أعد تعيين كلمة المرور فوراً وتواصل مع مسؤول EDUWAY.',
};

const BUILDERS: Record<EmailTemplateKey, Builder> = {
  admin_password_reset: (v, raw) => {
    const name = v('name');
    const mins = str(raw.minutes, 'en') || '30';
    return {
      tone: 'brand',
      subject: { en: 'Reset your EDUWAY admin password', ar: 'إعادة تعيين كلمة مرور لوحة إدارة EDUWAY' },
      preheader: { en: `Use this link within ${mins} minutes to choose a new password.`, ar: `استخدم هذا الرابط خلال ${mins} دقيقة لاختيار كلمة مرور جديدة.` },
      en: {
        heading: 'Reset your password',
        greeting: hi(name).en,
        paragraphs: ['We received a request to reset the password of your EDUWAY admin account. Click the button below to choose a new password.'],
        cta: { label: 'Reset password', url: v('link').en },
        note: `This link expires in ${mins} minutes and can be used only once. If you didn't request a reset, you can safely ignore this email — your password won't change.`,
      },
      ar: {
        heading: 'إعادة تعيين كلمة المرور',
        greeting: hi(name).ar,
        paragraphs: ['تلقّينا طلباً لإعادة تعيين كلمة مرور حسابك في لوحة إدارة EDUWAY. اضغط على الزر أدناه لاختيار كلمة مرور جديدة.'],
        cta: { label: 'إعادة تعيين كلمة المرور', url: v('link').ar },
        note: `تنتهي صلاحية هذا الرابط خلال ${mins} دقيقة ويمكن استخدامه مرة واحدة فقط. إذا لم تطلب إعادة التعيين، تجاهل هذه الرسالة — لن تتغير كلمة مرورك.`,
      },
    };
  },

  admin_invite: (v, raw) => {
    const name = v('name');
    const role = v('roleName');
    const hours = Number(str(raw.hours, 'en') || 168);
    const span: L = hours % 24 === 0 ? { en: `${hours / 24} day(s)`, ar: `${hours / 24} يوم` } : { en: `${hours} hours`, ar: `${hours} ساعة` };
    const inviter = v('inviter');
    return {
      tone: 'brand',
      subject: { en: "You're invited to the EDUWAY admin portal", ar: 'دعوة للانضمام إلى لوحة إدارة EDUWAY' },
      preheader: { en: 'Accept the invitation and set your password to get started.', ar: 'اقبل الدعوة وعيّن كلمة المرور للبدء.' },
      en: {
        heading: 'Welcome to the EDUWAY team',
        greeting: hi(name).en,
        paragraphs: [`${inviter.en ? `${inviter.en} has invited you` : 'You have been invited'} to join the EDUWAY admin portal. Accept the invitation and set your password to activate your account.`],
        details: [{ label: 'Email', value: str(raw.email, 'en') }, ...(role.en ? [{ label: 'Role', value: role.en }] : [])],
        cta: { label: 'Accept invitation', url: v('link').en },
        note: `This invitation expires in ${span.en}. For your security, enable two-factor authentication after signing in.`,
      },
      ar: {
        heading: 'مرحباً بك في فريق EDUWAY',
        greeting: hi(name).ar,
        paragraphs: [`${inviter.ar ? `قام ${inviter.ar} بدعوتك` : 'تمت دعوتك'} للانضمام إلى لوحة إدارة EDUWAY. اقبل الدعوة وعيّن كلمة المرور لتفعيل حسابك.`],
        details: [{ label: 'البريد الإلكتروني', value: str(raw.email, 'en') }, ...(role.ar ? [{ label: 'الدور', value: role.ar }] : [])],
        cta: { label: 'قبول الدعوة', url: v('link').ar },
        note: `تنتهي صلاحية هذه الدعوة خلال ${span.ar}. لحماية حسابك، فعّل المصادقة الثنائية بعد تسجيل الدخول.`,
      },
    };
  },

  admin_password_changed: (v, raw) => {
    const name = v('name');
    const viaReset = raw.via === 'reset';
    return {
      tone: 'warning',
      subject: { en: 'Your EDUWAY admin password was changed', ar: 'تم تغيير كلمة مرور حسابك في EDUWAY' },
      preheader: { en: 'Security alert: your password was just changed.', ar: 'تنبيه أمني: تم تغيير كلمة المرور للتو.' },
      en: {
        heading: 'Your password was changed',
        greeting: hi(name).en,
        paragraphs: [`The password of your EDUWAY admin account was ${viaReset ? 'reset using a password-reset link' : 'changed from your profile'}. ${viaReset ? 'All signed-in sessions were signed out.' : 'Your other sessions were signed out.'}`],
        details: [
          { label: 'When', value: formatDate(raw.at, 'en', true) },
          ...(raw.ip ? [{ label: 'IP address', value: str(raw.ip, 'en') }] : []),
        ],
        cta: { label: 'Review account security', url: v('securityLink').en },
        note: notYou.en,
      },
      ar: {
        heading: 'تم تغيير كلمة المرور',
        greeting: hi(name).ar,
        paragraphs: [`تم ${viaReset ? 'إعادة تعيين كلمة مرور حسابك عبر رابط إعادة التعيين' : 'تغيير كلمة مرور حسابك من صفحة الملف الشخصي'}. ${viaReset ? 'تم تسجيل الخروج من جميع الجلسات.' : 'تم تسجيل الخروج من جلساتك الأخرى.'}`],
        details: [
          { label: 'الوقت', value: formatDate(raw.at, 'ar', true) },
          ...(raw.ip ? [{ label: 'عنوان IP', value: str(raw.ip, 'en') }] : []),
        ],
        cta: { label: 'مراجعة أمان الحساب', url: v('securityLink').ar },
        note: notYou.ar,
      },
    };
  },

  admin_mfa_enabled: (v, raw) => {
    const name = v('name');
    return {
      tone: 'success',
      subject: { en: 'Two-factor authentication enabled', ar: 'تم تفعيل المصادقة الثنائية' },
      preheader: { en: 'Your EDUWAY admin account is now protected with 2FA.', ar: 'حسابك في EDUWAY محمي الآن بالمصادقة الثنائية.' },
      en: {
        heading: 'Two-factor authentication is on',
        greeting: hi(name).en,
        paragraphs: ['Two-factor authentication (2FA) was enabled on your EDUWAY admin account. From now on you will need a code from your authenticator app to sign in.', 'Keep your recovery codes in a safe place — each one can be used once if you lose access to your device.'],
        details: [{ label: 'When', value: formatDate(raw.at, 'en', true) }],
        cta: { label: 'Review account security', url: v('securityLink').en },
        note: notYou.en,
      },
      ar: {
        heading: 'تم تفعيل المصادقة الثنائية',
        greeting: hi(name).ar,
        paragraphs: ['تم تفعيل المصادقة الثنائية على حسابك في لوحة إدارة EDUWAY. ستحتاج من الآن إلى رمز من تطبيق المصادقة لتسجيل الدخول.', 'احتفظ برموز الاسترداد في مكان آمن — يمكن استخدام كل رمز مرة واحدة إذا فقدت الوصول إلى جهازك.'],
        details: [{ label: 'الوقت', value: formatDate(raw.at, 'ar', true) }],
        cta: { label: 'مراجعة أمان الحساب', url: v('securityLink').ar },
        note: notYou.ar,
      },
    };
  },

  admin_mfa_disabled: (v, raw) => {
    const name = v('name');
    const byAdmin = v('byAdmin');
    return {
      tone: 'danger',
      subject: { en: 'Two-factor authentication disabled', ar: 'تم إيقاف المصادقة الثنائية' },
      preheader: { en: 'Security alert: 2FA was turned off on your admin account.', ar: 'تنبيه أمني: تم إيقاف المصادقة الثنائية على حسابك.' },
      en: {
        heading: 'Two-factor authentication was turned off',
        greeting: hi(name).en,
        paragraphs: [`Two-factor authentication was disabled on your EDUWAY admin account${byAdmin.en ? ` by ${byAdmin.en}` : ''}. Your account is now protected by your password only — we recommend turning 2FA back on.`],
        details: [{ label: 'When', value: formatDate(raw.at, 'en', true) }],
        cta: { label: 'Turn 2FA back on', url: v('securityLink').en },
        note: notYou.en,
      },
      ar: {
        heading: 'تم إيقاف المصادقة الثنائية',
        greeting: hi(name).ar,
        paragraphs: [`تم إيقاف المصادقة الثنائية على حسابك في لوحة إدارة EDUWAY${byAdmin.ar ? ` بواسطة ${byAdmin.ar}` : ''}. أصبح حسابك محمياً بكلمة المرور فقط — ننصح بإعادة تفعيلها.`],
        details: [{ label: 'الوقت', value: formatDate(raw.at, 'ar', true) }],
        cta: { label: 'إعادة تفعيل المصادقة الثنائية', url: v('securityLink').ar },
        note: notYou.ar,
      },
    };
  },

  admin_new_device_login: (v, raw) => {
    const name = v('name');
    const rows = (lang: EmailLang) => [
      { label: lang === 'ar' ? 'الوقت' : 'When', value: formatDate(raw.at, lang, true) },
      ...(raw.device ? [{ label: lang === 'ar' ? 'الجهاز' : 'Device', value: str(raw.device, lang) }] : []),
      ...(raw.ip ? [{ label: lang === 'ar' ? 'عنوان IP' : 'IP address', value: str(raw.ip, 'en') }] : []),
    ];
    return {
      tone: 'warning',
      subject: { en: 'New sign-in to your EDUWAY admin account', ar: 'تسجيل دخول جديد إلى حسابك في EDUWAY' },
      preheader: { en: 'We noticed a sign-in from a device we have not seen before.', ar: 'لاحظنا تسجيل دخول من جهاز لم نره من قبل.' },
      en: {
        heading: 'New device sign-in',
        greeting: hi(name).en,
        paragraphs: ['Your EDUWAY admin account was just signed in to from a new device or browser.'],
        details: rows('en'),
        cta: { label: 'Review active sessions', url: v('sessionsLink').en },
        note: `If this was you, no action is needed. ${notYou.en}`,
      },
      ar: {
        heading: 'تسجيل دخول من جهاز جديد',
        greeting: hi(name).ar,
        paragraphs: ['تم للتو تسجيل الدخول إلى حسابك في لوحة إدارة EDUWAY من جهاز أو متصفح جديد.'],
        details: rows('ar'),
        cta: { label: 'مراجعة الجلسات النشطة', url: v('sessionsLink').ar },
        note: `إذا كنت أنت، فلا داعي لأي إجراء. ${notYou.ar}`,
      },
    };
  },

  admin_alert: (v, raw) => {
    const name = v('name');
    const title = v('title');
    const body = v('body');
    const tone = raw.kind === 'danger' ? 'danger' : raw.kind === 'warning' ? 'warning' : raw.kind === 'success' ? 'success' : 'brand';
    return {
      tone,
      subject: { en: `EDUWAY admin: ${title.en}`, ar: `تنبيه EDUWAY: ${title.ar}` },
      preheader: { en: body.en || title.en, ar: body.ar || title.ar },
      en: { heading: title.en, greeting: hi(name).en, paragraphs: body.en ? [body.en] : [], cta: raw.link ? { label: 'Open in admin portal', url: v('link').en } : undefined, note: 'You can turn off admin email alerts in your profile preferences.' },
      ar: { heading: title.ar, greeting: hi(name).ar, paragraphs: body.ar ? [body.ar] : [], cta: raw.link ? { label: 'فتح في لوحة الإدارة', url: v('link').ar } : undefined, note: 'يمكنك إيقاف تنبيهات البريد الإلكتروني من تفضيلات ملفك الشخصي.' },
    };
  },

  admin_export_ready: (v, raw) => {
    const name = v('name');
    const report = v('report');
    const fmt = str(raw.format, 'en').toUpperCase();
    const rows = Number(str(raw.rows, 'en') || 0).toLocaleString('en-US');
    return {
      tone: 'success',
      subject: { en: `Your ${report.en} export is ready`, ar: `ملف التصدير (${report.ar}) جاهز` },
      preheader: { en: `${rows} rows · ${fmt}`, ar: `${rows} صف · ${fmt}` },
      en: {
        heading: 'Your export is ready',
        greeting: hi(name).en,
        paragraphs: ['The export you requested has finished and is ready to download.'],
        details: [{ label: 'Report', value: report.en }, { label: 'Format', value: fmt }, { label: 'Rows', value: rows }, ...(raw.expiresAt ? [{ label: 'Available until', value: formatDate(raw.expiresAt, 'en') }] : [])],
        cta: { label: 'Download export', url: v('link').en },
        note: 'Sign in to the admin portal is required to download the file.',
      },
      ar: {
        heading: 'ملف التصدير جاهز',
        greeting: hi(name).ar,
        paragraphs: ['اكتمل التصدير الذي طلبته وأصبح جاهزاً للتنزيل.'],
        details: [{ label: 'التقرير', value: report.ar }, { label: 'الصيغة', value: fmt }, { label: 'عدد الصفوف', value: rows }, ...(raw.expiresAt ? [{ label: 'متاح حتى', value: formatDate(raw.expiresAt, 'ar') }] : [])],
        cta: { label: 'تنزيل الملف', url: v('link').ar },
        note: 'يلزم تسجيل الدخول إلى لوحة الإدارة لتنزيل الملف.',
      },
    };
  },

  email_verification: (v, raw) => {
    const name = v('name');
    const hours = str(raw.hours, 'en') || '24';
    return {
      tone: 'brand',
      subject: { en: 'Confirm your email address', ar: 'تأكيد بريدك الإلكتروني' },
      preheader: { en: 'One click to confirm your email for EDUWAY.', ar: 'نقرة واحدة لتأكيد بريدك الإلكتروني في EDUWAY.' },
      en: {
        heading: 'Confirm your email',
        greeting: hi(name).en,
        paragraphs: ['Please confirm that this is your email address. Once confirmed, we can send you payment receipts, subscription updates and replies from our support team.'],
        cta: { label: 'Confirm email', url: v('link').en },
        note: `This link expires in ${hours} hours. If you didn't add this email to an EDUWAY account, ignore this message.`,
      },
      ar: {
        heading: 'تأكيد البريد الإلكتروني',
        greeting: hi(name).ar,
        paragraphs: ['يرجى تأكيد أن هذا هو بريدك الإلكتروني. بعد التأكيد يمكننا إرسال إيصالات الدفع وتحديثات الاشتراك وردود فريق الدعم إليك.'],
        cta: { label: 'تأكيد البريد الإلكتروني', url: v('link').ar },
        note: `تنتهي صلاحية هذا الرابط خلال ${hours} ساعة. إذا لم تُضف هذا البريد إلى حساب في EDUWAY، تجاهل هذه الرسالة.`,
      },
    };
  },

  payment_receipt: (v, raw) => {
    const name = v('name');
    const pkg = v('package');
    const rows = (lang: EmailLang) => [
      { label: lang === 'ar' ? 'رقم الإيصال' : 'Receipt no.', value: str(raw.receiptNumber, 'en') },
      { label: lang === 'ar' ? 'المرجع' : 'Reference', value: str(raw.ref, 'en') },
      { label: lang === 'ar' ? 'الباقة' : 'Package', value: pkg[lang] },
      { label: lang === 'ar' ? 'المبلغ المدفوع' : 'Amount paid', value: formatMoney(raw.amount, raw.currency, lang) },
      ...(raw.gateway ? [{ label: lang === 'ar' ? 'طريقة الدفع' : 'Paid with', value: str(raw.gateway, lang) }] : []),
      { label: lang === 'ar' ? 'تاريخ الدفع' : 'Paid on', value: formatDate(raw.paidAt, lang, true) },
      ...(raw.until ? [{ label: lang === 'ar' ? 'الاشتراك فعّال حتى' : 'Active until', value: formatDate(raw.until, lang) }] : []),
    ];
    return {
      tone: 'success',
      subject: { en: `Payment receipt ${str(raw.receiptNumber, 'en')}`, ar: `إيصال الدفع ${str(raw.receiptNumber, 'en')}` },
      preheader: { en: `Thanks for your payment of ${formatMoney(raw.amount, raw.currency, 'en')}.`, ar: `شكراً لدفعك مبلغ ${formatMoney(raw.amount, raw.currency, 'ar')}.` },
      en: {
        heading: 'Thank you for your payment',
        greeting: hi(name).en,
        paragraphs: ['Your payment was received successfully and your subscription is active. Your receipt is attached to this email as a PDF.'],
        details: rows('en'),
        cta: { label: 'View my subscription', url: v('link').en },
      },
      ar: {
        heading: 'شكراً لك على الدفع',
        greeting: hi(name).ar,
        paragraphs: ['تم استلام دفعتك بنجاح واشتراكك فعّال الآن. ستجد إيصال الدفع مرفقاً بهذه الرسالة بصيغة PDF.'],
        details: rows('ar'),
        cta: { label: 'عرض اشتراكي', url: v('link').ar },
      },
    };
  },

  subscription_activated: (v, raw) => {
    const name = v('name');
    const pkg = v('package');
    return {
      tone: 'success',
      subject: { en: 'Your EDUWAY subscription is active', ar: 'اشتراكك في EDUWAY فعّال الآن' },
      preheader: { en: `${pkg.en} is now active.`, ar: `باقة ${pkg.ar} فعّالة الآن.` },
      en: {
        heading: 'Your subscription is active',
        greeting: hi(name).en,
        paragraphs: [`Your ${pkg.en} subscription is now active. All included lessons, question banks and exams are unlocked — happy learning!`],
        details: [{ label: 'Package', value: pkg.en }, ...(raw.until ? [{ label: 'Active until', value: formatDate(raw.until, 'en') }] : [])],
        cta: { label: 'Start learning', url: v('link').en },
      },
      ar: {
        heading: 'اشتراكك فعّال',
        greeting: hi(name).ar,
        paragraphs: [`تم تفعيل اشتراكك في باقة ${pkg.ar}. جميع الدروس وبنوك الأسئلة والامتحانات المشمولة متاحة لك الآن — تعلّماً ممتعاً!`],
        details: [{ label: 'الباقة', value: pkg.ar }, ...(raw.until ? [{ label: 'فعّال حتى', value: formatDate(raw.until, 'ar') }] : [])],
        cta: { label: 'ابدأ التعلّم', url: v('link').ar },
      },
    };
  },

  subscription_expiring: (v, raw) => {
    const name = v('name');
    const pkg = v('package');
    const days = Number(str(raw.days, 'en') || 0);
    return {
      tone: 'warning',
      subject: { en: `Your subscription ends in ${days} day${days === 1 ? '' : 's'}`, ar: `ينتهي اشتراكك خلال ${days} يوم` },
      preheader: { en: 'Renew now to keep access to your lessons and exams.', ar: 'جدّد الآن للحفاظ على وصولك إلى الدروس والامتحانات.' },
      en: {
        heading: 'Your subscription is ending soon',
        greeting: hi(name).en,
        paragraphs: [`Your ${pkg.en} subscription ends in ${days} day${days === 1 ? '' : 's'}. Renew now so your progress, lessons and exam practice continue without interruption.`],
        details: [{ label: 'Package', value: pkg.en }, { label: 'Ends on', value: formatDate(raw.until, 'en') }],
        cta: { label: 'Renew subscription', url: v('link').en },
      },
      ar: {
        heading: 'اشتراكك على وشك الانتهاء',
        greeting: hi(name).ar,
        paragraphs: [`ينتهي اشتراكك في باقة ${pkg.ar} خلال ${days} يوم. جدّد الآن لتستمر دروسك وتقدّمك وتدريبات الامتحانات دون انقطاع.`],
        details: [{ label: 'الباقة', value: pkg.ar }, { label: 'تاريخ الانتهاء', value: formatDate(raw.until, 'ar') }],
        cta: { label: 'تجديد الاشتراك', url: v('link').ar },
      },
    };
  },

  subscription_expired: (v) => {
    const name = v('name');
    const pkg = v('package');
    return {
      tone: 'danger',
      subject: { en: 'Your EDUWAY subscription has expired', ar: 'انتهى اشتراكك في EDUWAY' },
      preheader: { en: 'Renew to unlock your lessons and exams again.', ar: 'جدّد لفتح دروسك وامتحاناتك مجدداً.' },
      en: {
        heading: 'Your subscription has expired',
        greeting: hi(name).en,
        paragraphs: [`Your ${pkg.en} subscription has ended. Your progress is saved — renew any time to pick up exactly where you left off.`],
        cta: { label: 'Renew subscription', url: v('link').en },
      },
      ar: {
        heading: 'انتهى اشتراكك',
        greeting: hi(name).ar,
        paragraphs: [`انتهى اشتراكك في باقة ${pkg.ar}. تقدّمك محفوظ — جدّد في أي وقت لتكمل من حيث توقفت.`],
        cta: { label: 'تجديد الاشتراك', url: v('link').ar },
      },
    };
  },

  support_reply: (v, raw) => {
    const name = v('name');
    const ticket = str(raw.ticket, 'en');
    const subj = v('subject');
    const link = raw.link ? v('link') : null;
    return {
      tone: 'brand',
      subject: { en: `Re: ${subj.en || 'Your support request'} [${ticket}]`, ar: `رد: ${subj.ar || 'طلب الدعم الخاص بك'} [${ticket}]` },
      preheader: { en: 'Our support team replied to your request.', ar: 'ردّ فريق الدعم على طلبك.' },
      en: {
        heading: 'Our support team replied',
        greeting: hi(name).en,
        paragraphs: [`Here is the latest reply on your ticket ${ticket}${subj.en ? ` — “${subj.en}”` : ''}:`],
        quote: str(raw.message, 'en'),
        cta: link ? { label: 'View conversation', url: link.en } : undefined,
        note: link ? undefined : 'To reply, send us a new message through the contact form on our website and mention your ticket number.',
      },
      ar: {
        heading: 'ردّ فريق الدعم',
        greeting: hi(name).ar,
        paragraphs: [`إليك آخر رد على تذكرتك ${ticket}${subj.ar ? ` — «${subj.ar}»` : ''}:`],
        quote: str(raw.message, 'ar'),
        cta: link ? { label: 'عرض المحادثة', url: link.ar } : undefined,
        note: link ? undefined : 'للرد، أرسل لنا رسالة جديدة عبر نموذج التواصل في موقعنا واذكر رقم تذكرتك.',
      },
    };
  },

  notification: (v, raw) => {
    const title = v('title');
    const body = v('body');
    const link = raw.link ? v('link') : null;
    return {
      tone: 'brand',
      monolingual: raw.monolingual !== false && title.en === title.ar && body.en === body.ar,
      subject: { en: title.en || 'EDUWAY', ar: title.ar || 'EDUWAY' },
      preheader: { en: body.en.slice(0, 120), ar: body.ar.slice(0, 120) },
      en: { heading: title.en, paragraphs: body.en ? [body.en] : [], cta: link ? { label: 'Open EDUWAY', url: link.en } : undefined },
      ar: { heading: title.ar, paragraphs: body.ar ? [body.ar] : [], cta: link ? { label: 'فتح EDUWAY', url: link.ar } : undefined },
    };
  },
};

/** Builds the bilingual content of a template (exported for tests / previews). */
export function buildEmailContent(key: EmailTemplateKey, vars: EmailVars): EmailContent {
  return BUILDERS[key](both(vars), vars);
}

/** Renders a template to subject + HTML + text. `lang` is the primary language (default Arabic). */
export function renderTemplateEmail(key: EmailTemplateKey, vars: EmailVars, opts: { lang?: EmailLang; siteUrl?: string } = {}): RenderedEmail {
  const content = buildEmailContent(key, vars);
  const reason = key.startsWith('admin_')
    ? {
        en: 'You are receiving this email because you have an account on the EDUWAY admin portal. This is an automated message — please do not reply.',
        ar: 'تصلك هذه الرسالة لأن لديك حساباً في لوحة إدارة EDUWAY. هذه رسالة آلية — يرجى عدم الرد عليها.',
      }
    : undefined;
  return renderEmail(content, { lang: opts.lang, siteUrl: opts.siteUrl, footerReason: reason });
}
