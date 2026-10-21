import type { FeatureFlag, LegalVersion } from '@/types';
import { daysAgo } from '@/utils/random';

export interface GeneralSettings {
  platformName: string;
  platformName_ar: string;
  logo: string | null;
  defaultLanguage: 'ar' | 'en';
  currency: 'IQD' | 'USD';
  timezone: string;
  dateFormat: 'd MMM yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd';
  academicYear: string;
}

export interface OtpSettings {
  expirySeconds: number;
  codeLength: 4 | 6;
  resendLimit: number;
  resendCooldownSeconds: number;
  maxAttempts: number;
  lockoutMinutes: number;
  provider: 'korek' | 'twilio' | 'whatsapp';
  fallbackProvider: 'none' | 'korek' | 'twilio' | 'whatsapp';
}

export interface AppSettings {
  minVersionIos: string;
  minVersionAndroid: string;
  latestVersion: string;
  forceUpdate: boolean;
  maintenanceMode: boolean;
  maintenanceMessage_en: string;
  maintenanceMessage_ar: string;
  deviceLimit: number;
  sessionTimeoutMinutes: number;
}

export interface SupportContacts {
  phone: string;
  whatsapp: string;
  email: string;
  hours_en: string;
  hours_ar: string;
  address_en: string;
  address_ar: string;
  facebook: string;
  instagram: string;
  telegram: string;
  youtube: string;
}

export const generalSettings: GeneralSettings = {
  platformName: 'EDUWAY',
  platformName_ar: 'إيدوواي',
  logo: null,
  defaultLanguage: 'ar',
  currency: 'IQD',
  timezone: 'Asia/Baghdad',
  dateFormat: 'd MMM yyyy',
  academicYear: '2026–2027',
};

export const otpSettings: OtpSettings = {
  expirySeconds: 120,
  codeLength: 6,
  resendLimit: 3,
  resendCooldownSeconds: 60,
  maxAttempts: 5,
  lockoutMinutes: 30,
  provider: 'korek',
  fallbackProvider: 'whatsapp',
};

export const appSettings: AppSettings = {
  minVersionIos: '2.4.0',
  minVersionAndroid: '2.4.0',
  latestVersion: '2.6.1',
  forceUpdate: false,
  maintenanceMode: false,
  maintenanceMessage_en: 'EDUWAY is getting an upgrade. We will be back within 30 minutes — your progress is safe.',
  maintenanceMessage_ar: 'نقوم بتحديث إيدوواي. سنعود خلال 30 دقيقة — تقدمك محفوظ بأمان.',
  deviceLimit: 2,
  sessionTimeoutMinutes: 43200,
};

export const supportContacts: SupportContacts = {
  phone: '+964 770 000 4040',
  whatsapp: '+964 780 000 4040',
  email: 'support@eduway.iq',
  hours_en: 'Saturday–Thursday, 9:00 AM – 10:00 PM',
  hours_ar: 'السبت–الخميس، 9:00 صباحاً – 10:00 مساءً',
  address_en: 'Al-Mansour, Street 14, Baghdad, Iraq',
  address_ar: 'المنصور، شارع 14، بغداد، العراق',
  facebook: 'https://facebook.com/eduway.iq',
  instagram: 'https://instagram.com/eduway.iq',
  telegram: 'https://t.me/eduway_iq',
  youtube: 'https://youtube.com/@eduway',
};

const F = (
  id: string,
  key: string,
  name_en: string,
  name_ar: string,
  description_en: string,
  description_ar: string,
  enabled: boolean,
  environment: FeatureFlag['environment'],
  updated: number,
): FeatureFlag => ({ id, key, name_en, name_ar, description_en, description_ar, enabled, environment, updatedAt: daysAgo(updated) });

export const featureFlags: FeatureFlag[] = [
  F('ff_ai_tutor', 'ai_tutor', 'AI Tutor', 'المعلّم الذكي', 'Students can ask the AI Tutor questions within their monthly allowance.', 'يمكن للطلاب طرح الأسئلة على المعلّم الذكي ضمن الحصة الشهرية.', true, 'production', 40),
  F('ff_exam_sim', 'exam_simulator', 'Exam Simulator', 'محاكي الامتحان', 'Timed ministerial-style mock exams built from published blueprints.', 'امتحانات تجريبية موقوتة بنمط الامتحان الوزاري مبنية من المخططات المنشورة.', true, 'production', 10),
  F('ff_parent', 'parent_portal', 'Parent portal', 'بوابة أولياء الأمور', 'Parents can follow progress, scores and payments from a linked account.', 'يتابع أولياء الأمور التقدم والدرجات والمدفوعات من حساب مرتبط.', false, 'beta', 6),
  F('ff_bookmarks', 'bookmarks', 'Bookmarks', 'الإشارات المرجعية', 'Save lesson timestamps and questions for later review.', 'حفظ مواضع الدروس والأسئلة للمراجعة لاحقاً.', true, 'production', 90),
  F('ff_seq_unlock', 'sequential_unlock', 'Sequential unlock', 'الفتح التسلسلي', 'Lessons unlock only after the previous quiz is passed (per subject setting).', 'تُفتح الدروس فقط بعد اجتياز اختبار الدرس السابق (حسب إعداد المادة).', true, 'production', 120),
  F('ff_promo', 'promo_codes', 'Promo codes', 'رموز الخصم', 'Accept promo, school and referral codes at checkout.', 'قبول رموز الخصم والمدارس والإحالة عند الدفع.', true, 'production', 60),
  F('ff_offline', 'offline_downloads', 'Offline downloads', 'التنزيل دون اتصال', 'Encrypted lesson downloads for offline viewing on mobile.', 'تنزيل الدروس بشكل مشفّر للمشاهدة دون اتصال على الهاتف.', false, 'staging', 4),
  F('ff_student_dark', 'student_dark_mode', 'Dark mode for students', 'الوضع الداكن للطلاب', 'Dark theme option in the student app and website.', 'خيار المظهر الداكن في تطبيق وموقع الطلاب.', true, 'beta', 15),
  F('ff_leaderboard', 'leaderboards', 'Leaderboards', 'لوحات المتصدرين', 'Weekly school and governorate leaderboards based on quiz points.', 'لوحات متصدرين أسبوعية للمدارس والمحافظات بناءً على نقاط الاختبارات.', false, 'staging', 21),
  F('ff_live', 'live_sessions', 'Live revision sessions', 'جلسات المراجعة المباشرة', 'Scheduled live streams with teachers before ministerial exams.', 'بث مباشر مجدول مع المدرّسين قبل الامتحانات الوزارية.', false, 'beta', 2),
];

export const legalVersions: LegalVersion[] = [
  {
    id: 'lg_terms_3',
    doc: 'terms',
    version: '3.0',
    body_en:
      '1. Acceptance\nBy creating an EDUWAY account you agree to these Terms of Service.\n\n2. Accounts\nEach account is personal and may be used on up to two devices. Sharing accounts may lead to suspension.\n\n3. Subscriptions & payments\nPackages are prepaid. Refunds are available within 7 days of purchase if less than 20% of the content was viewed.\n\n4. Acceptable use\nYou may not record, redistribute or resell EDUWAY lessons or questions.\n\n5. AI Tutor\nAI answers are educational guidance and may contain mistakes. Always verify with your teacher.',
    body_ar:
      '1. القبول\nبإنشاء حساب في إيدوواي فإنك توافق على شروط الخدمة هذه.\n\n2. الحسابات\nكل حساب شخصي ويمكن استخدامه على جهازين كحد أقصى. قد تؤدي مشاركة الحساب إلى إيقافه.\n\n3. الاشتراكات والمدفوعات\nالباقات مدفوعة مسبقاً. يمكن استرداد المبلغ خلال 7 أيام من الشراء إذا كانت نسبة المشاهدة أقل من 20%.\n\n4. الاستخدام المقبول\nلا يجوز تسجيل دروس أو أسئلة إيدوواي أو إعادة توزيعها أو بيعها.\n\n5. المعلّم الذكي\nإجابات الذكاء الاصطناعي إرشاد تعليمي وقد تحتوي على أخطاء. تحقق دائماً مع مدرّسك.',
    status: 'published',
    publishedAt: daysAgo(48),
    acceptances: 96,
  },
  {
    id: 'lg_terms_2',
    doc: 'terms',
    version: '2.1',
    body_en: '1. Acceptance\nBy creating an EDUWAY account you agree to these Terms of Service.\n\n2. Accounts\nEach account is personal and may be used on up to three devices.\n\n3. Subscriptions & payments\nPackages are prepaid and non-refundable after activation.',
    body_ar: '1. القبول\nبإنشاء حساب في إيدوواي فإنك توافق على شروط الخدمة هذه.\n\n2. الحسابات\nكل حساب شخصي ويمكن استخدامه على ثلاثة أجهزة كحد أقصى.\n\n3. الاشتراكات والمدفوعات\nالباقات مدفوعة مسبقاً وغير قابلة للاسترداد بعد التفعيل.',
    status: 'retired',
    publishedAt: daysAgo(210),
    acceptances: 71,
  },
  {
    id: 'lg_terms_1',
    doc: 'terms',
    version: '1.0',
    body_en: 'Initial terms of service for the EDUWAY beta.',
    body_ar: 'شروط الخدمة الأولية للنسخة التجريبية من إيدوواي.',
    status: 'retired',
    publishedAt: daysAgo(380),
    acceptances: 24,
  },
  {
    id: 'lg_privacy_2',
    doc: 'privacy',
    version: '2.0',
    body_en:
      '1. What we collect\nName, mobile number, school, governorate, learning activity and payment references. We never store full card numbers.\n\n2. How we use it\nTo deliver lessons, personalise practice, process payments and send the notifications you opt into.\n\n3. Sharing\nPartner schools see only enrolment counts and verified payment status of students who used their code.\n\n4. Your rights\nYou can request a copy or deletion of your data at support@eduway.iq.',
    body_ar:
      '1. ما نجمعه\nالاسم ورقم الهاتف والمدرسة والمحافظة ونشاط التعلّم ومراجع الدفع. لا نخزّن أرقام البطاقات كاملة أبداً.\n\n2. كيف نستخدمها\nلتقديم الدروس وتخصيص التدريب ومعالجة المدفوعات وإرسال الإشعارات التي تختارها.\n\n3. المشاركة\nترى المدارس الشريكة فقط أعداد التسجيل وحالة الدفع المؤكدة للطلاب الذين استخدموا رمزها.\n\n4. حقوقك\nيمكنك طلب نسخة من بياناتك أو حذفها عبر support@eduway.iq.',
    status: 'published',
    publishedAt: daysAgo(48),
    acceptances: 94,
  },
  {
    id: 'lg_privacy_1',
    doc: 'privacy',
    version: '1.2',
    body_en: '1. What we collect\nName, mobile number and learning activity.\n\n2. How we use it\nTo deliver lessons and process payments.',
    body_ar: '1. ما نجمعه\nالاسم ورقم الهاتف ونشاط التعلّم.\n\n2. كيف نستخدمها\nلتقديم الدروس ومعالجة المدفوعات.',
    status: 'retired',
    publishedAt: daysAgo(240),
    acceptances: 88,
  },
  {
    id: 'lg_privacy_3d',
    doc: 'privacy',
    version: '2.1',
    body_en:
      '1. What we collect\nName, mobile number, school, governorate, learning activity, AI Tutor conversations and payment references.\n\n2. AI Tutor\nConversations are stored for 90 days to improve answer quality and detect misuse, then anonymised.',
    body_ar:
      '1. ما نجمعه\nالاسم ورقم الهاتف والمدرسة والمحافظة ونشاط التعلّم ومحادثات المعلّم الذكي ومراجع الدفع.\n\n2. المعلّم الذكي\nتُحفظ المحادثات لمدة 90 يوماً لتحسين جودة الإجابات واكتشاف إساءة الاستخدام ثم تُجعل مجهولة الهوية.',
    status: 'draft',
    publishedAt: null,
    acceptances: 0,
  },
];
