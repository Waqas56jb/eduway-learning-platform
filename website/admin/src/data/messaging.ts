import type { Campaign, DeliveryLogEntry, NotifChannel, NotificationTemplate, NotifType } from '@/types';
import { createRng, daysAgo, daysAhead } from '@/utils/random';
import { students } from './students';

/** All supported template variables with sample values used for previews. */
export const TEMPLATE_VARIABLES: Record<string, { en: string; ar: string }> = {
  student_name: { en: 'Zahraa Kareem', ar: 'زهراء كريم' },
  lesson_title: { en: 'The Definite Integral', ar: 'التكامل المحدد' },
  subject_name: { en: 'Mathematics', ar: 'الرياضيات' },
  expiry_date: { en: '31 Oct 2026', ar: '31 تشرين الأول 2026' },
  otp_code: { en: '482913', ar: '482913' },
  amount: { en: '150,000 IQD', ar: '150,000 د.ع' },
  package_name: { en: 'Full Year — All Subjects', ar: 'الباقة السنوية الشاملة' },
  exam_date: { en: 'Saturday 14 Nov, 10:00', ar: 'السبت 14 تشرين الثاني، 10:00' },
  progress: { en: '68%', ar: '68%' },
  ticket_id: { en: 'SUP-20418', ar: 'SUP-20418' },
  support_message: { en: 'Your video playback issue has been resolved.', ar: 'تم حل مشكلة تشغيل الفيديو لديك.' },
};

export const NOTIF_TYPES: NotifType[] = [
  'otp',
  'payment_confirmation',
  'subscription_expiry',
  'new_lesson',
  'unfinished_lesson',
  'exam_reminder',
  'progress_reminder',
  'support_message',
];

export const NOTIF_CHANNELS: NotifChannel[] = ['push', 'in_app', 'sms', 'whatsapp', 'email'];

export const PROVIDER_BY_CHANNEL: Record<NotifChannel, string> = {
  push: 'Firebase FCM',
  in_app: 'EDUWAY In-App',
  sms: 'Korek SMS',
  whatsapp: 'Meta WhatsApp Cloud',
  email: 'Amazon SES',
};

export const PROVIDERS = ['Firebase FCM', 'Twilio', 'Korek SMS', 'Meta WhatsApp Cloud', 'Amazon SES', 'EDUWAY In-App'];

export const templates: NotificationTemplate[] = [
  {
    id: 'tpl_otp_sms',
    name: 'OTP verification code',
    type: 'otp',
    channel: 'sms',
    subject_en: '',
    subject_ar: '',
    body_en: 'EDUWAY: Your verification code is {otp_code}. It expires in 2 minutes. Never share this code with anyone.',
    body_ar: 'إيدوواي: رمز التحقق الخاص بك هو {otp_code}. ينتهي خلال دقيقتين. لا تشارك هذا الرمز مع أي شخص.',
    variables: ['otp_code'],
    active: true,
    updatedAt: daysAgo(12),
  },
  {
    id: 'tpl_pay_email',
    name: 'Payment confirmation',
    type: 'payment_confirmation',
    channel: 'email',
    subject_en: 'Payment received — welcome to {package_name}',
    subject_ar: 'تم استلام الدفعة — أهلاً بك في {package_name}',
    body_en:
      'Hi {student_name},\n\nWe received your payment of {amount} for {package_name}. Your subscription is now active and all included subjects are unlocked.\n\nYour access is valid until {expiry_date}.\n\nStudy well,\nThe EDUWAY Team',
    body_ar:
      'مرحباً {student_name}،\n\nاستلمنا دفعتك بقيمة {amount} لـ {package_name}. أصبح اشتراكك فعّالاً وتم فتح جميع المواد المشمولة.\n\nصلاحية الوصول حتى {expiry_date}.\n\nبالتوفيق،\nفريق إيدوواي',
    variables: ['student_name', 'amount', 'package_name', 'expiry_date'],
    active: true,
    updatedAt: daysAgo(30),
  },
  {
    id: 'tpl_expiry_wa',
    name: 'Subscription expiry reminder',
    type: 'subscription_expiry',
    channel: 'whatsapp',
    subject_en: '',
    subject_ar: '',
    body_en:
      'Hello {student_name} 👋 Your {package_name} subscription ends on {expiry_date}. Renew now to keep your progress, quizzes and AI Tutor access without interruption.',
    body_ar:
      'مرحباً {student_name} 👋 ينتهي اشتراكك في {package_name} بتاريخ {expiry_date}. جدّد الآن للحفاظ على تقدمك والاختبارات والمعلّم الذكي دون انقطاع.',
    variables: ['student_name', 'package_name', 'expiry_date'],
    active: true,
    updatedAt: daysAgo(8),
  },
  {
    id: 'tpl_newlesson_push',
    name: 'New lesson published',
    type: 'new_lesson',
    channel: 'push',
    subject_en: 'New in {subject_name} 🎓',
    subject_ar: 'جديد في {subject_name} 🎓',
    body_en: '"{lesson_title}" is now available. Watch it today and take the practice quiz.',
    body_ar: 'درس «{lesson_title}» متاح الآن. شاهده اليوم وأجب على الاختبار القصير.',
    variables: ['subject_name', 'lesson_title'],
    active: true,
    updatedAt: daysAgo(3),
  },
  {
    id: 'tpl_unfinished_inapp',
    name: 'Unfinished lesson nudge',
    type: 'unfinished_lesson',
    channel: 'in_app',
    subject_en: 'Pick up where you left off',
    subject_ar: 'تابع من حيث توقفت',
    body_en: '{student_name}, you are halfway through "{lesson_title}". Finish it to unlock the next lesson.',
    body_ar: '{student_name}، لقد أنجزت نصف درس «{lesson_title}». أكمله لفتح الدرس التالي.',
    variables: ['student_name', 'lesson_title'],
    active: true,
    updatedAt: daysAgo(19),
  },
  {
    id: 'tpl_exam_push',
    name: 'Mock exam reminder',
    type: 'exam_reminder',
    channel: 'push',
    subject_en: 'Mock exam tomorrow ⏰',
    subject_ar: 'امتحان تجريبي غداً ⏰',
    body_en: 'Your ministerial mock exam starts {exam_date}. Make sure your device is charged and you have a stable connection.',
    body_ar: 'يبدأ امتحانك الوزاري التجريبي {exam_date}. تأكد من شحن جهازك واستقرار الاتصال.',
    variables: ['exam_date'],
    active: true,
    updatedAt: daysAgo(5),
  },
  {
    id: 'tpl_progress_email',
    name: 'Weekly progress report',
    type: 'progress_reminder',
    channel: 'email',
    subject_en: 'Your weekly progress: {progress} complete',
    subject_ar: 'تقدمك الأسبوعي: أنجزت {progress}',
    body_en:
      'Hi {student_name},\n\nGreat work this week! You have completed {progress} of your study plan. Your weakest area right now is {subject_name} — a short review session today will make a big difference.\n\nKeep going,\nThe EDUWAY Team',
    body_ar:
      'مرحباً {student_name}،\n\nعمل رائع هذا الأسبوع! أنجزت {progress} من خطتك الدراسية. أضعف مادة لديك حالياً هي {subject_name} — جلسة مراجعة قصيرة اليوم ستحدث فرقاً كبيراً.\n\nاستمر،\nفريق إيدوواي',
    variables: ['student_name', 'progress', 'subject_name'],
    active: false,
    updatedAt: daysAgo(44),
  },
  {
    id: 'tpl_support_wa',
    name: 'Support ticket update',
    type: 'support_message',
    channel: 'whatsapp',
    subject_en: '',
    subject_ar: '',
    body_en: 'EDUWAY Support — ticket {ticket_id}: {support_message} Reply here if you need anything else.',
    body_ar: 'دعم إيدوواي — التذكرة {ticket_id}: {support_message} ردّ هنا إذا احتجت أي مساعدة أخرى.',
    variables: ['ticket_id', 'support_message'],
    active: true,
    updatedAt: daysAgo(2),
  },
];

export const campaigns: Campaign[] = [
  {
    id: 'cmp_1',
    name: 'Mid-year mock exam reminder',
    channel: 'push',
    templateId: 'tpl_exam_push',
    audienceCount: 84,
    filters: { package: 'pkg_full', subject: null, governorate: null, school: null, inactiveDays: null },
    status: 'sent',
    scheduledAt: null,
    sentAt: daysAgo(3, 5),
    createdBy: 'Dr. Sami Al-Hashimi',
  },
  {
    id: 'cmp_2',
    name: 'Win-back: inactive 14 days',
    channel: 'whatsapp',
    templateId: 'tpl_expiry_wa',
    audienceCount: 23,
    filters: { package: null, subject: null, governorate: null, school: null, inactiveDays: 14 },
    status: 'sent',
    scheduledAt: null,
    sentAt: daysAgo(9, 2),
    createdBy: 'Mariam Abbas',
  },
  {
    id: 'cmp_3',
    name: 'New Integration lessons — Baghdad',
    channel: 'push',
    templateId: 'tpl_newlesson_push',
    audienceCount: 41,
    filters: { package: null, subject: 'sub_math', governorate: 'gov_bgd', school: null, inactiveDays: null },
    status: 'sent',
    scheduledAt: null,
    sentAt: daysAgo(15, 7),
    createdBy: 'Dr. Sami Al-Hashimi',
  },
  {
    id: 'cmp_4',
    name: 'Renewal offer — expiring this month',
    channel: 'email',
    templateId: 'tpl_pay_email',
    audienceCount: 17,
    filters: { package: null, subject: null, governorate: null, school: null, inactiveDays: null },
    status: 'scheduled',
    scheduledAt: daysAhead(2),
    sentAt: null,
    createdBy: 'Huda Kareem',
  },
  {
    id: 'cmp_5',
    name: 'Basra Distinguished — welcome',
    channel: 'sms',
    templateId: null,
    audienceCount: 9,
    filters: { package: null, subject: null, governorate: 'gov_bsr', school: 'sch_06', inactiveDays: null },
    status: 'sent',
    scheduledAt: null,
    sentAt: daysAgo(27, 1),
    createdBy: 'Mariam Abbas',
  },
  {
    id: 'cmp_6',
    name: 'Chemistry weak-topic review',
    channel: 'in_app',
    templateId: 'tpl_unfinished_inapp',
    audienceCount: 0,
    filters: { package: 'pkg_sci', subject: 'sub_chem', governorate: null, school: null, inactiveDays: null },
    status: 'draft',
    scheduledAt: null,
    sentAt: null,
    createdBy: 'Dr. Sami Al-Hashimi',
  },
];

const rng = createRng(3131);

const ERRORS: Record<NotifChannel, string[]> = {
  sms: ['Carrier rejected: number unreachable', 'Rate limited by SMS gateway (429)', 'Invalid destination number'],
  whatsapp: ['Recipient not on WhatsApp', 'Template not approved for this locale', 'Message expired — 24h window closed'],
  push: ['Device token expired (UNREGISTERED)', 'APNs: BadDeviceToken'],
  email: ['Mailbox full (552)', 'Hard bounce: address does not exist'],
  in_app: ['User session not found'],
};

const sendTemplates = templates.filter((t) => t.active);

export const deliveryLog: DeliveryLogEntry[] = Array.from({ length: 60 }, (_, i) => {
  const n = i + 1;
  const tpl = n === 31 ? templates[0] : rng.pick(sendTemplates);
  const channel = tpl.channel;
  const status: DeliveryLogEntry['status'] =
    n === 31 ? 'failed' : rng.weighted<DeliveryLogEntry['status']>([['delivered', 62], ['sent', 18], ['failed', 13], ['queued', 7]]);
  const provider = channel === 'sms' && rng.bool(0.35) ? 'Twilio' : PROVIDER_BY_CHANNEL[channel];
  const campaign = tpl.id === 'tpl_exam_push' ? 'cmp_1' : tpl.id === 'tpl_expiry_wa' ? 'cmp_2' : tpl.id === 'tpl_newlesson_push' ? 'cmp_3' : null;
  return {
    id: `dl_${String(n).padStart(4, '0')}`,
    campaignId: campaign,
    templateId: tpl.id,
    studentId: students[(i * 7) % students.length].id,
    channel,
    provider,
    status,
    error: status === 'failed' ? (n === 31 ? 'Carrier rejected: number unreachable' : rng.pick(ERRORS[channel])) : null,
    attempts: status === 'failed' ? rng.int(1, 3) : 1,
    createdAt: daysAgo(Math.floor(i / 4), rng.int(0, 20)),
  };
});
