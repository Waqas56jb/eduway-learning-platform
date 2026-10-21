import { createRng, daysAgo } from '@/utils/random';
import { students } from './students';

export interface SupportTicket {
  id: string;
  studentId: string;
  subject_en: string;
  subject_ar: string;
  category: 'payment' | 'access' | 'video' | 'content' | 'account';
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'pending' | 'resolved';
  assignee: string;
  createdAt: string;
}

const TOPICS: Omit<SupportTicket, 'id' | 'studentId' | 'status' | 'assignee' | 'createdAt'>[] = [
  { subject_en: 'ZainCash payment charged but package not activated', subject_ar: 'تم خصم المبلغ عبر زين كاش ولم تُفعّل الباقة', category: 'payment', priority: 'high' },
  { subject_en: 'Cannot log in — OTP not received', subject_ar: 'لا أستطيع تسجيل الدخول — لم يصل رمز التحقق', category: 'account', priority: 'high' },
  { subject_en: 'Physics video keeps buffering on mobile data', subject_ar: 'فيديو الفيزياء يتوقف باستمرار على بيانات الهاتف', category: 'video', priority: 'medium' },
  { subject_en: 'Wrong answer key in Ionic Equilibrium quiz', subject_ar: 'خطأ في مفتاح الإجابة لاختبار الاتزان الأيوني', category: 'content', priority: 'medium' },
  { subject_en: 'Requesting invoice for annual package', subject_ar: 'طلب فاتورة للباقة السنوية', category: 'payment', priority: 'low' },
  { subject_en: 'Next lesson still locked after completing quiz', subject_ar: 'الدرس التالي ما زال مقفلاً بعد إكمال الاختبار', category: 'access', priority: 'medium' },
  { subject_en: 'Device limit reached — new phone', subject_ar: 'تم الوصول إلى حد الأجهزة — هاتف جديد', category: 'account', priority: 'medium' },
  { subject_en: 'School code not applied at checkout', subject_ar: 'لم يتم تطبيق رمز المدرسة عند الدفع', category: 'payment', priority: 'medium' },
  { subject_en: 'Arabic captions out of sync on Integration lesson', subject_ar: 'الترجمة العربية غير متزامنة في درس التكامل', category: 'video', priority: 'low' },
  { subject_en: 'AI Tutor monthly allowance used up early', subject_ar: 'نفد رصيد المعلّم الذكي الشهري مبكراً', category: 'access', priority: 'low' },
  { subject_en: 'Refund request — duplicate FastPay payment', subject_ar: 'طلب استرداد — دفع مكرر عبر فاست باي', category: 'payment', priority: 'high' },
  { subject_en: 'Change registered mobile number', subject_ar: 'تغيير رقم الهاتف المسجّل', category: 'account', priority: 'low' },
  { subject_en: 'Exam simulator timer froze mid-exam', subject_ar: 'توقف مؤقت محاكي الامتحان في منتصف الامتحان', category: 'content', priority: 'high' },
  { subject_en: 'English unit PDF notes missing', subject_ar: 'ملخصات PDF لوحدة اللغة الإنجليزية مفقودة', category: 'content', priority: 'low' },
];

const rng = createRng(1414);
const STATUSES: SupportTicket['status'][] = ['open', 'open', 'pending', 'open', 'resolved', 'open', 'pending', 'resolved', 'open', 'resolved', 'open', 'resolved', 'pending', 'open'];

export const supportTickets: SupportTicket[] = TOPICS.map((t, i) => ({
  ...t,
  id: `tkt_${String(1040 + i)}`,
  studentId: students[(i * 7 + 3) % students.length].id,
  status: STATUSES[i],
  assignee: rng.pick(['Mariam Abbas', 'Huda Kareem', 'Mariam Abbas']),
  createdAt: daysAgo(rng.int(0, 12), rng.int(0, 20)),
}));
