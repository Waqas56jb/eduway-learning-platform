import { ACTIONS, MODULES, type AdminUser, type AuditLog, type ModuleKey, type PermAction, type PermissionMatrix, type Role } from '@/types';
import { AVATARS } from '@/utils/images';
import { createRng, daysAgo } from '@/utils/random';

/** Build a permission matrix from a compact spec: module → allowed actions ('*' = all). */
export function matrix(spec: Partial<Record<ModuleKey, PermAction[] | '*'>>): PermissionMatrix {
  return Object.fromEntries(
    MODULES.map((m) => {
      const allowed = spec[m];
      return [m, Object.fromEntries(ACTIONS.map((a) => [a, allowed === '*' || (allowed?.includes(a) ?? false)]))];
    }),
  ) as PermissionMatrix;
}

export const emptyMatrix = () => matrix({});

export const roles: Role[] = [
  {
    id: 'role_super',
    key: 'super_admin',
    name_en: 'Super Admin',
    name_ar: 'مدير عام',
    description_en: 'Unrestricted access to every module, including security and role management.',
    description_ar: 'وصول كامل إلى جميع الأقسام بما في ذلك الأمان وإدارة الأدوار.',
    system: true,
    permissions: matrix(Object.fromEntries(MODULES.map((m) => [m, '*'])) as Record<ModuleKey, '*'>),
    createdAt: daysAgo(420),
  },
  {
    id: 'role_finance',
    key: 'finance_admin',
    name_en: 'Finance Admin',
    name_ar: 'مدير مالي',
    description_en: 'Payments, refunds, reconciliation, packages, partner settlements and business analytics.',
    description_ar: 'المدفوعات والمبالغ المستردة والتسوية والباقات وتسويات الشركاء وتحليلات الأعمال.',
    system: true,
    permissions: matrix({
      dashboard: ['view'],
      users: ['view', 'export'],
      packages: '*',
      payments: '*',
      schools: ['view', 'edit', 'approve', 'export'],
      marketers: ['view', 'edit', 'approve', 'export'],
      analytics: ['view', 'export'],
      security: ['view'],
    }),
    createdAt: daysAgo(420),
  },
  {
    id: 'role_academic',
    key: 'academic_supervisor',
    name_en: 'Academic Supervisor',
    name_ar: 'مشرف أكاديمي',
    description_en: 'Owns curriculum quality: reviews and approves content, questions and assessments.',
    description_ar: 'مسؤول عن جودة المنهج: مراجعة واعتماد المحتوى والأسئلة والتقييمات.',
    system: true,
    permissions: matrix({
      dashboard: ['view'],
      users: ['view'],
      content: '*',
      questions: '*',
      assessments: '*',
      aitutor: ['view', 'edit'],
      analytics: ['view', 'export'],
      notifications: ['view', 'create', 'edit'],
    }),
    createdAt: daysAgo(420),
  },
  {
    id: 'role_teacher',
    key: 'content_teacher',
    name_en: 'Content Teacher',
    name_ar: 'مدرّس محتوى',
    description_en: 'Creates and edits lessons and questions, and submits them for review. Cannot publish.',
    description_ar: 'ينشئ ويعدّل الدروس والأسئلة ويرسلها للمراجعة. لا يمكنه النشر.',
    system: true,
    permissions: matrix({
      dashboard: ['view'],
      content: ['view', 'create', 'edit'],
      questions: ['view', 'create', 'edit'],
      assessments: ['view'],
      analytics: ['view'],
    }),
    createdAt: daysAgo(420),
  },
  {
    id: 'role_support',
    key: 'support',
    name_en: 'Support',
    name_ar: 'الدعم الفني',
    description_en: 'Helps students: profiles, sessions, notes, access grants and notification delivery.',
    description_ar: 'يساعد الطلاب: الملفات والجلسات والملاحظات ومنح الوصول وتسليم الإشعارات.',
    system: true,
    permissions: matrix({
      dashboard: ['view'],
      users: ['view', 'edit'],
      payments: ['view'],
      packages: ['view'],
      aitutor: ['view'],
      notifications: ['view', 'create'],
    }),
    createdAt: daysAgo(420),
  },
];

export const adminUsers: AdminUser[] = [
  { id: 'adm_1', name: 'Ahmed Al-Rikabi', name_ar: 'أحمد الركابي', email: 'admin@eduway.iq', mobile: '+964 770 100 2030', roleId: 'role_super', avatar: AVATARS[2], mfaEnabled: true, status: 'active', lastLogin: daysAgo(0, 1), createdAt: daysAgo(420) },
  { id: 'adm_2', name: 'Huda Kareem', name_ar: 'هدى كريم', email: 'huda.kareem@eduway.iq', mobile: '+964 781 330 4410', roleId: 'role_finance', avatar: AVATARS[1], mfaEnabled: true, status: 'active', lastLogin: daysAgo(0, 4), createdAt: daysAgo(380) },
  { id: 'adm_3', name: 'Dr. Sami Al-Hashimi', name_ar: 'د. سامي الهاشمي', email: 'sami.hashimi@eduway.iq', mobile: '+964 790 552 1187', roleId: 'role_academic', avatar: AVATARS[6], mfaEnabled: true, status: 'active', lastLogin: daysAgo(1, 2), createdAt: daysAgo(365) },
  { id: 'adm_4', name: 'Haider Al-Jubouri', name_ar: 'حيدر الجبوري', email: 'haider.jubouri@eduway.iq', mobile: '+964 772 640 9921', roleId: 'role_teacher', avatar: AVATARS[0], mfaEnabled: false, status: 'active', lastLogin: daysAgo(0, 7), createdAt: daysAgo(300) },
  { id: 'adm_5', name: 'Mariam Abbas', name_ar: 'مريم عباس', email: 'mariam.abbas@eduway.iq', mobile: '+964 751 228 7364', roleId: 'role_support', avatar: AVATARS[3], mfaEnabled: true, status: 'active', lastLogin: daysAgo(0, 2), createdAt: daysAgo(210) },
  { id: 'adm_6', name: 'Rana Al-Tamimi', name_ar: 'رنا التميمي', email: 'rana.tamimi@eduway.iq', mobile: '+964 773 819 0045', roleId: 'role_teacher', avatar: AVATARS[7], mfaEnabled: false, status: 'invited', lastLogin: null, createdAt: daysAgo(3) },
];

const rng = createRng(777);

const AUDIT_TEMPLATES: Omit<AuditLog, 'id' | 'at' | 'ip' | 'device'>[] = [
  { actor: 'Dr. Sami Al-Hashimi', actorRole: 'Academic Supervisor', action: 'lesson.approve', entity: 'lesson', entityId: 'les_021', summary: 'Approved lesson “The Definite Integral”', before: { status: 'in_review' }, after: { status: 'approved' } },
  { actor: 'Haider Al-Jubouri', actorRole: 'Content Teacher', action: 'lesson.update', entity: 'lesson', entityId: 'les_022', summary: 'Updated description and completion threshold', before: { completionThreshold: 70 }, after: { completionThreshold: 80 } },
  { actor: 'Huda Kareem', actorRole: 'Finance Admin', action: 'refund.approve', entity: 'refund', entityId: 'rfd_1', summary: 'Approved full refund of 150,000 IQD', before: { status: 'pending' }, after: { status: 'approved' } },
  { actor: 'Ahmed Al-Rikabi', actorRole: 'Super Admin', action: 'role.update', entity: 'role', entityId: 'role_support', summary: 'Granted notifications.create to Support', before: { 'notifications.create': false }, after: { 'notifications.create': true } },
  { actor: 'Mariam Abbas', actorRole: 'Support', action: 'student.force_logout', entity: 'student', entityId: 'stu_0042', summary: 'Forced logout on all devices', before: { sessions: 3 }, after: { sessions: 0 } },
  { actor: 'Mariam Abbas', actorRole: 'Support', action: 'student.grant_access', entity: 'student', entityId: 'stu_0017', summary: 'Manual access to English for 45 days — compensation for outage', before: null, after: { subject: 'English', days: 45 } },
  { actor: 'Huda Kareem', actorRole: 'Finance Admin', action: 'settlement.mark_paid', entity: 'settlement', entityId: 'set_s_03', summary: 'Marked school settlement as paid', before: { status: 'approved' }, after: { status: 'paid' } },
  { actor: 'Ahmed Al-Rikabi', actorRole: 'Super Admin', action: 'feature_flag.toggle', entity: 'feature_flag', entityId: 'ff_exam_sim', summary: 'Enabled Exam Simulator in production', before: { enabled: false }, after: { enabled: true } },
  { actor: 'Dr. Sami Al-Hashimi', actorRole: 'Academic Supervisor', action: 'question.reject', entity: 'question', entityId: 'q_0087', summary: 'Rejected question — ambiguous distractor in option C', before: { status: 'in_review' }, after: { status: 'draft' } },
  { actor: 'Haider Al-Jubouri', actorRole: 'Content Teacher', action: 'question.create', entity: 'question', entityId: 'q_0149', summary: 'Created MCQ on De Moivre’s theorem', before: null, after: { status: 'draft', difficulty: 'hard' } },
  { actor: 'Ahmed Al-Rikabi', actorRole: 'Super Admin', action: 'admin.invite', entity: 'admin_user', entityId: 'adm_6', summary: 'Invited rana.tamimi@eduway.iq as Content Teacher', before: null, after: { role: 'Content Teacher' } },
  { actor: 'Huda Kareem', actorRole: 'Finance Admin', action: 'package.update', entity: 'package', entityId: 'pkg_sci', summary: 'Changed Science Trio price', before: { price: 120000 }, after: { price: 110000 } },
  { actor: 'Ahmed Al-Rikabi', actorRole: 'Super Admin', action: 'incentive_rule.create_version', entity: 'incentive_rule', entityId: 'inc_school_v2', summary: 'Created school incentive rule v2', before: { version: 1 }, after: { version: 2 } },
  { actor: 'Mariam Abbas', actorRole: 'Support', action: 'student.unlock', entity: 'student', entityId: 'stu_0063', summary: 'Unlocked account after identity verification', before: { locked: true }, after: { locked: false } },
  { actor: 'Dr. Sami Al-Hashimi', actorRole: 'Academic Supervisor', action: 'blueprint.publish', entity: 'exam_blueprint', entityId: 'bp_1', summary: 'Published “Ministerial Mock Exam — Mid-Year”', before: { status: 'draft' }, after: { status: 'published' } },
  { actor: 'Ahmed Al-Rikabi', actorRole: 'Super Admin', action: 'settings.update', entity: 'settings', entityId: 'otp', summary: 'Changed OTP expiry from 180s to 120s', before: { expirySeconds: 180 }, after: { expirySeconds: 120 } },
  { actor: 'Ahmed Al-Rikabi', actorRole: 'Super Admin', action: 'auth.login', entity: 'session', entityId: 'adm_1', summary: 'Signed in with 2FA', before: null, after: null },
  { actor: 'Huda Kareem', actorRole: 'Finance Admin', action: 'promotion.disable', entity: 'promotion', entityId: 'promo_3', summary: 'Disabled promo code EARLYBIRD15', before: { enabled: true }, after: { enabled: false } },
  { actor: 'Dr. Sami Al-Hashimi', actorRole: 'Academic Supervisor', action: 'lesson.publish', entity: 'lesson', entityId: 'les_005', summary: 'Published lesson “The Parabola: Standard Equation”', before: { status: 'approved' }, after: { status: 'published' } },
  { actor: 'Mariam Abbas', actorRole: 'Support', action: 'notification.retry', entity: 'delivery', entityId: 'dl_0031', summary: 'Retried failed SMS delivery', before: { status: 'failed' }, after: { status: 'queued' } },
];

const IPS = ['185.81.140.22', '37.236.18.4', '149.255.200.17', '5.62.61.92', '178.238.4.130'];
const AGENTS = ['Chrome 129 · Windows 11', 'Safari 18 · macOS', 'Edge 129 · Windows 11', 'Chrome 129 · macOS', 'Firefox 131 · Ubuntu'];

export const auditLogs: AuditLog[] = Array.from({ length: 50 }, (_, i) => {
  const tpl = AUDIT_TEMPLATES[i % AUDIT_TEMPLATES.length];
  return {
    ...tpl,
    id: `aud_${String(50 - i).padStart(4, '0')}`,
    at: daysAgo(Math.floor(i / 3), rng.int(0, 9) + (i % 3) * 3),
    ip: rng.pick(IPS),
    device: rng.pick(AGENTS),
  };
});
