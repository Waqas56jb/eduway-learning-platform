import { create } from 'zustand';
import type { AppNotification } from '@/types';
import { daysAgo } from '@/utils/random';

/** Admin bell notifications (not student notification templates — see store/messaging.ts). */
const initial: AppNotification[] = [
  {
    id: 'n1',
    title_en: '6 lessons waiting for review',
    title_ar: '6 دروس بانتظار المراجعة',
    body_en: 'Chemistry and Biology lessons were submitted by teachers this week.',
    body_ar: 'أرسل المدرّسون دروساً في الكيمياء والأحياء هذا الأسبوع.',
    at: daysAgo(0, 1),
    read: false,
    href: '/content/workflow',
    kind: 'info',
  },
  {
    id: 'n2',
    title_en: '4 refund requests pending',
    title_ar: '4 طلبات استرداد معلّقة',
    body_en: 'Finance approval is needed before end of day.',
    body_ar: 'تحتاج إلى موافقة الإدارة المالية قبل نهاية اليوم.',
    at: daysAgo(0, 3),
    read: false,
    href: '/payments/refunds',
    kind: 'warning',
  },
  {
    id: 'n3',
    title_en: 'OTP brute-force attempt blocked',
    title_ar: 'تم حظر محاولة تخمين رمز التحقق',
    body_en: '14 failed OTP attempts on +964 781 ••• 4410 from 3 IPs.',
    body_ar: '14 محاولة فاشلة لرمز التحقق على الرقم +964 781 ••• 4410 من 3 عناوين.',
    at: daysAgo(0, 6),
    read: false,
    href: '/security/alerts',
    kind: 'danger',
  },
  {
    id: 'n4',
    title_en: 'Nightly backup completed',
    title_ar: 'اكتمل النسخ الاحتياطي الليلي',
    body_en: 'Database snapshot 2.4 GB stored in two regions.',
    body_ar: 'تم حفظ لقطة قاعدة البيانات بحجم 2.4 GB في منطقتين.',
    at: daysAgo(0, 7),
    read: true,
    href: '/',
    kind: 'success',
  },
  {
    id: 'n5',
    title_en: 'Baghdad College reached Silver tier',
    title_ar: 'ثانوية كلية بغداد وصلت إلى الفئة الفضية',
    body_en: 'Settlement for September is ready for approval.',
    body_ar: 'تسوية شهر أيلول جاهزة للموافقة.',
    at: daysAgo(1, 2),
    read: true,
    href: '/schools/settlements',
    kind: 'info',
  },
];

interface NotifState {
  items: AppNotification[];
  markRead: (id: string) => void;
  markAllRead: () => void;
  push: (n: Omit<AppNotification, 'id' | 'at' | 'read'>) => void;
}

export const useAppNotifications = create<NotifState>()((set) => ({
  items: initial,
  markRead: (id) => set((s) => ({ items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
  markAllRead: () => set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
  push: (n) =>
    set((s) => ({ items: [{ ...n, id: `n_${Date.now()}`, at: new Date().toISOString(), read: false }, ...s.items] })),
}));
