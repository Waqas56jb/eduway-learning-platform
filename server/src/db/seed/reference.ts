/**
 * Reference data: governorates, RBAC (permissions/roles), admin users, settings, app settings, feature flags,
 * legal documents, CMS, AI settings, notification templates, achievements.
 * Admin-editable rows are inserted only when missing (re-seeding never overwrites admin changes).
 */
import { ALL_PERMISSIONS, RBAC_ACTIONS, RBAC_MODULES, T, type RbacAction, type RbacModule } from '../../config/constants.js';
import type { TxClient } from '../../config/db.js';
import { isProd } from '../../config/env.js';
import { generateStrongPassword } from '../../common/utils/crypto.js';
import { hashPassword } from '../../modules/admins/service.js';
import { insertMany, loadJson, rebase, sid, updateSet } from './helpers.js';
import type { AdminMock } from './types.js';

type Spec = Partial<Record<RbacModule, RbacAction[] | '*'>>;
const expand = (spec: Spec): string[] =>
  RBAC_MODULES.flatMap((m) => {
    const a = spec[m];
    if (!a) return [];
    return (a === '*' ? [...RBAC_ACTIONS] : a).map((act) => `${m}.${act}`);
  });

export const ROLE_SPECS: { key: string; mockId?: string; name: [string, string]; desc: [string, string]; perms: Spec | 'all' }[] = [
  { key: 'super_admin', mockId: 'role_super', name: ['Super Admin', 'مدير عام'], desc: ['Unrestricted access to every module, including security and role management.', 'وصول كامل إلى جميع الأقسام بما في ذلك الأمان وإدارة الأدوار.'], perms: 'all' },
  {
    key: 'finance_admin',
    mockId: 'role_finance',
    name: ['Finance Admin', 'مدير مالي'],
    desc: ['Payments, refunds, reconciliation, packages, partner settlements and business analytics.', 'المدفوعات والمبالغ المستردة والتسوية والباقات وتسويات الشركاء وتحليلات الأعمال.'],
    perms: { dashboard: ['view'], users: ['view', 'export'], packages: '*', payments: '*', schools: ['view', 'edit', 'approve', 'export'], marketers: ['view', 'edit', 'approve', 'export'], analytics: ['view', 'export'], security: ['view'] },
  },
  {
    key: 'academic_supervisor',
    mockId: 'role_academic',
    name: ['Academic Supervisor', 'مشرف أكاديمي'],
    desc: ['Owns curriculum quality: reviews and approves content, questions and assessments.', 'مسؤول عن جودة المنهج: مراجعة واعتماد المحتوى والأسئلة والتقييمات.'],
    perms: { dashboard: ['view'], users: ['view'], content: '*', questions: '*', assessments: '*', aitutor: ['view', 'edit'], analytics: ['view', 'export'], notifications: ['view', 'create', 'edit'] },
  },
  {
    key: 'content_manager',
    name: ['Content Manager', 'مدير المحتوى'],
    desc: ['Manages lessons, videos, resources, questions and exam blueprints end to end.', 'يدير الدروس والفيديوهات والملفات والأسئلة ومخططات الامتحانات بالكامل.'],
    perms: { dashboard: ['view'], content: '*', questions: '*', assessments: '*', analytics: ['view'], notifications: ['view', 'create'] },
  },
  {
    key: 'content_teacher',
    mockId: 'role_teacher',
    name: ['Content Teacher', 'مدرّس محتوى'],
    desc: ['Creates and edits lessons and questions, and submits them for review. Cannot publish.', 'ينشئ ويعدّل الدروس والأسئلة ويرسلها للمراجعة. لا يمكنه النشر.'],
    perms: { dashboard: ['view'], content: ['view', 'create', 'edit'], questions: ['view', 'create', 'edit'], assessments: ['view'], analytics: ['view'] },
  },
  {
    key: 'support',
    mockId: 'role_support',
    name: ['Support', 'الدعم الفني'],
    desc: ['Helps students: profiles, sessions, notes, access grants and notification delivery.', 'يساعد الطلاب: الملفات والجلسات والملاحظات ومنح الوصول وتسليم الإشعارات.'],
    perms: { dashboard: ['view'], users: ['view', 'edit'], payments: ['view'], packages: ['view'], aitutor: ['view'], notifications: ['view', 'create'] },
  },
  {
    key: 'marketing',
    name: ['Marketing', 'التسويق'],
    desc: ['Schools, marketers, promotions, campaigns and acquisition analytics.', 'المدارس والمسوّقون والعروض والحملات وتحليلات الاستقطاب.'],
    perms: { dashboard: ['view'], users: ['view', 'export'], packages: ['view', 'create', 'edit'], schools: '*', marketers: '*', notifications: '*', analytics: ['view', 'export'] },
  },
  {
    key: 'analyst',
    name: ['Analyst', 'محلل بيانات'],
    desc: ['Read-only access to every module plus analytics exports.', 'وصول للقراءة فقط لجميع الأقسام مع تصدير التحليلات.'],
    perms: { ...Object.fromEntries(RBAC_MODULES.map((m) => [m, ['view'] as RbacAction[]])), analytics: ['view', 'export'] },
  },
];

export const roleId = (key: string) => sid('role', key);

export async function seedGovernorates(c: TxClient): Promise<void> {
  const govs = loadJson<{ id: string; name: { en: string; ar: string } }[]>('governorates.json');
  await insertMany(c, T.governorates, ['id', 'code', 'name_en', 'name_ar', 'sort_order'], govs.map((g, i) => [sid('gov', g.id), g.id, g.name.en, g.name.ar, i + 1]), updateSet('(code)', ['name_en', 'name_ar', 'sort_order']));
}

export async function seedRbac(c: TxClient): Promise<void> {
  await insertMany(
    c,
    T.permissions,
    ['id', 'key', 'module', 'action', 'description'],
    ALL_PERMISSIONS.map((k) => {
      const [m, a] = k.split('.') as [string, string];
      return [sid('perm', k), k, m, a, `${a} ${m}`];
    }),
    '(key) DO NOTHING',
  );
  for (const r of ROLE_SPECS) {
    const inserted = await c.query(
      `INSERT INTO ${T.roles} (id, key, name_en, name_ar, description_en, description_ar, is_system) VALUES ($1,$2,$3,$4,$5,$6,true)
       ON CONFLICT (key) DO NOTHING RETURNING id`,
      [roleId(r.key), r.key, r.name[0], r.name[1], r.desc[0], r.desc[1]],
    );
    // Permissions are only seeded for newly created roles — admins' later edits are preserved.
    if (inserted.rowCount) {
      const keys = r.perms === 'all' ? [...ALL_PERMISSIONS] : expand(r.perms);
      await c.query(
        `INSERT INTO ${T.role_permissions} (role_id, permission_id) SELECT $1, id FROM ${T.permissions} WHERE key = ANY($2::text[]) ON CONFLICT DO NOTHING`,
        [roleId(r.key), keys],
      );
    }
  }
}

/** Returns the generated super-admin password when one had to be generated (printed once by the caller). */
export async function seedAdmins(c: TxClient, mock: AdminMock, superEmail: string, superPassword: string | undefined): Promise<{ generatedPassword: string | null; superAdminId: string }> {
  const roleKeyByMock = Object.fromEntries(ROLE_SPECS.filter((r) => r.mockId).map((r) => [r.mockId as string, r.key]));
  let generatedPassword: string | null = null;
  let superAdminId = sid('admin', 'adm_1');
  for (const a of mock.adminUsers) {
    const isSuper = a.id === 'adm_1';
    const email = isSuper ? superEmail.toLowerCase() : a.email.toLowerCase();
    const id = sid('admin', a.id);
    const existing = await c.query<{ id: string }>(`SELECT id FROM ${T.users} WHERE lower(email) = $1`, [email]);
    const userId = existing.rows[0]?.id ?? id;
    if (isSuper) superAdminId = userId;
    if (!existing.rowCount) {
      await c.query(
        `INSERT INTO ${T.users} (id, kind, email, phone, name_en, name_ar, avatar_url, status, locale, created_at, last_active_at)
         VALUES ($1,'admin',$2,$3,$4,$5,$6,$7,'en',$8,$9)`,
        [userId, email, `+${a.mobile.replace(/\D/g, '')}`, a.name, a.name_ar, a.avatar, a.status === 'invited' ? 'invited' : 'active', rebase(a.createdAt), rebase(a.lastLogin)],
      );
    }
    let passwordHash: string | null = null;
    if (isSuper) {
      const pw = superPassword ?? (existing.rowCount ? null : generateStrongPassword());
      if (!superPassword && pw) generatedPassword = pw;
      if (pw) passwordHash = await hashPassword(pw);
    } else if (a.status === 'active' && !existing.rowCount) {
      // Demo staff accounts get an unusable random password: use invite / reset-password to activate them.
      passwordHash = await hashPassword(generateStrongPassword(32));
    }
    await c.query(
      `INSERT INTO ${T.admin_users} (user_id, password_hash, last_login_at, password_changed_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE SET password_hash = COALESCE(EXCLUDED.password_hash, ${T.admin_users}.password_hash)`,
      [userId, passwordHash, rebase(a.lastLogin)],
    );
    if (isSuper) await c.query(`UPDATE ${T.users} SET status = 'active' WHERE id = $1`, [userId]);
    const key = roleKeyByMock[a.roleId] ?? 'support';
    await c.query(`INSERT INTO ${T.admin_roles} (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, roleId(key)]);
  }
  return { generatedPassword, superAdminId };
}

export async function seedSettings(c: TxClient, mock: AdminMock): Promise<void> {
  const g = mock.generalSettings;
  const o = mock.otpSettings;
  const s = mock.supportContacts;
  const avatar = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=200&q=80`;
  const groups: Record<string, unknown> = {
    general: { platformName: { en: g.platformName, ar: g.platformName_ar }, logoUrl: null, defaultLanguage: g.defaultLanguage, currency: g.currency, timezone: g.timezone, dateFormat: g.dateFormat, academicYear: g.academicYear },
    otp: {
      expirySeconds: o.expirySeconds,
      codeLength: o.codeLength,
      resendLimit: o.resendLimit,
      resendWindowMinutes: 30,
      resendCooldownSeconds: o.resendCooldownSeconds,
      maxAttempts: o.maxAttempts,
      lockoutMinutes: o.lockoutMinutes,
      lockoutThreshold: 10,
      provider: o.provider,
      fallbackProvider: o.fallbackProvider,
      devBypassCode: isProd ? null : '123456',
      devBypassPhones: ['+9647701234567'],
      devBypassAllPhones: false,
    },
    support: { phone: s.phone, whatsapp: s.whatsapp, email: s.email, hours: { en: s.hours_en, ar: s.hours_ar }, address: { en: s.address_en, ar: s.address_ar }, facebook: s.facebook, instagram: s.instagram, telegram: s.telegram, youtube: s.youtube, tiktok: '' },
    payments: {
      gateways: [
        { id: 'zaincash', enabled: true, feeRatePct: 1.5, name: { en: 'ZainCash', ar: 'زين كاش' }, color: '#E4007C', displayOrder: 1 },
        { id: 'fastpay', enabled: true, feeRatePct: 1.5, name: { en: 'FastPay', ar: 'فاست باي' }, color: '#1F2A44', displayOrder: 2 },
        { id: 'qicard', enabled: true, feeRatePct: 2, name: { en: 'Qi Card', ar: 'كي كارد' }, color: '#F7B500', displayOrder: 3 },
        { id: 'asiahawala', enabled: true, feeRatePct: 1.75, name: { en: 'AsiaHawala', ar: 'آسيا حوالة' }, color: '#D71920', displayOrder: 4 },
        { id: 'visa', enabled: true, feeRatePct: 2.5, name: { en: 'Visa / Mastercard', ar: 'فيزا / ماستر كارد' }, color: '#1A1F71', displayOrder: 5 },
        { id: 'mock', enabled: !isProd, feeRatePct: 0, name: { en: 'Test gateway', ar: 'بوابة الاختبار' }, color: '#64748B', displayOrder: 99 },
      ],
      mockGatewayEnabled: !isProd,
      receiptCompany: { name: { en: 'EDUWAY Learning Platform', ar: 'منصة إيدوواي التعليمية' }, address: { en: s.address_en, ar: s.address_ar }, email: 'billing@eduway.iq' },
      taxNote: { en: 'Prices include all applicable taxes and fees.', ar: 'الأسعار تشمل جميع الضرائب والرسوم المطبقة.' },
    },
    learning: {
      quizQuestionCount: 5,
      quizPassMark: 60,
      examDefaultPassMark: 50,
      practiceSessionSizes: [10, 20, 50],
      practiceMaxSize: 100,
      dailyGoalMinutes: 120,
      watchHeartbeatSeconds: 10,
      examAutosaveSeconds: 15,
      examGraceSeconds: 30,
      gradeBands: [
        { key: 'excellent', min: 90 },
        { key: 'veryGood', min: 80 },
        { key: 'good', min: 70 },
        { key: 'pass', min: 50 },
        { key: 'needsWork', min: 0 },
      ],
      heatmapLevels: [0, 25, 50, 80, 120],
      avatarPresets: ['photo-1506794778202-cad84cf45f1d', 'photo-1500648767791-00dcc994a43e', 'photo-1507003211169-0a1dd7228f2d', 'photo-1534528741775-53994a69daeb'].map(avatar),
    },
    marketing: { stats: { satisfactionPct: 97, passRatePct: 94, rating: 4.9, ratingCount: 12480 }, displayOverrides: { students: '48K+', lessons: '850+', questions: '35K+' }, appLinks: { appStore: null, googlePlay: null } },
    security: { adminMfaMandatory: false, adminSessionHours: 12, passwordMinLength: 10 },
    auth: { adminLockoutAttempts: 5, adminLockoutMinutes: 15, inviteExpiryHours: 168, passwordResetExpiryMinutes: 60, requireLegalAcceptance: true, rememberRefreshDays: 30, shortRefreshHours: 12 },
  };
  await insertMany(c, T.settings, ['key', 'value', 'description'], Object.entries(groups).map(([k, v]) => [k, v, `${k} settings`]), '(key) DO NOTHING');
  // Dev convenience: make sure the bypass code exists in non-production even when the row pre-existed.
  if (!isProd) {
    await c.query(
      `UPDATE ${T.settings} SET value = jsonb_set(jsonb_set(value, '{devBypassCode}', '"123456"'), '{devBypassPhones}', COALESCE(value->'devBypassPhones', '["+9647701234567"]'::jsonb))
        WHERE key = 'otp' AND (value->>'devBypassCode') IS NULL`,
    );
  }

  const a = mock.appSettings;
  await c.query(
    `INSERT INTO ${T.app_settings} (id, min_version_ios, min_version_android, latest_version, force_update, maintenance_mode, maintenance_message_en, maintenance_message_ar, device_limit, session_timeout_minutes, store_url_ios, store_url_android)
     VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
    [a.minVersionIos === '2.4.0' ? '1.0.0' : a.minVersionIos, a.minVersionAndroid === '2.4.0' ? '1.0.0' : a.minVersionAndroid, a.latestVersion === '2.6.1' ? '1.0.0' : a.latestVersion, a.forceUpdate, a.maintenanceMode, a.maintenanceMessage_en, a.maintenanceMessage_ar, a.deviceLimit, a.sessionTimeoutMinutes, 'https://apps.apple.com/app/eduway', 'https://play.google.com/store/apps/details?id=iq.eduway.app'],
  );

  await insertMany(
    c,
    T.feature_flags,
    ['id', 'key', 'name_en', 'name_ar', 'description_en', 'description_ar', 'enabled', 'environment', 'updated_at'],
    [
      ...mock.featureFlags.map((f) => [sid('flag', f.key), f.key, f.name_en, f.name_ar, f.description_en, f.description_ar, f.enabled, f.environment, rebase(f.updatedAt)]),
      [sid('flag', 'ai_tutor_attachments'), 'ai_tutor_attachments', 'AI Tutor image attachments', 'صور المعلّم الذكي', 'Students can attach a photo of a question to the AI Tutor.', 'يمكن للطلاب إرفاق صورة السؤال للمعلّم الذكي.', true, 'production', new Date()],
    ],
    '(key) DO NOTHING',
  );

  const ai = mock.aiSettings;
  await c.query(
    `INSERT INTO ${T.ai_settings} (id, enabled, monthly_allowance, reset_cycle, provider, model, temperature, max_tokens, retrieval_transcripts, retrieval_explanations, retrieval_lesson_notes, safety_rules, rate_limit_per_minute, rate_limit_per_hour, blocked_keywords)
     VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
    [ai.enabled, ai.monthlyAllowance, ai.resetCycle, ai.provider, ai.model, ai.temperature, ai.maxTokens, ai.retrieval.transcripts, ai.retrieval.explanations, ai.retrieval.lessonNotes, ai.safetyRules, ai.rateLimitPerMinute, ai.rateLimitPerHour, ai.blockedKeywords],
  );
}

interface LegalLocale {
  terms: { title: string; subtitle: string; intro: string; sections: Record<string, { title: string; body: string }> };
  privacy: { title: string; subtitle: string; intro: string; sections: Record<string, { title: string; body: string }> };
}

const toMarkdown = (d: LegalLocale['terms']) => [d.intro, ...Object.values(d.sections).map((s) => `## ${s.title}\n${s.body}`)].join('\n\n');

export async function seedLegal(c: TxClient, mock: AdminMock, superAdminId: string): Promise<void> {
  const legal = loadJson<{ en: LegalLocale; ar: LegalLocale }>('legal.json');
  // Current published versions = the rich texts from the apps; history + draft from the admin portal mock.
  const current: Record<string, string> = { terms: '3.0', privacy: '2.0' };
  for (const v of mock.legalVersions) {
    const doc = v.doc;
    const isCurrent = current[doc] === v.version && v.status === 'published';
    const en = legal.en[doc];
    const ar = legal.ar[doc];
    await c.query(
      `INSERT INTO ${T.legal_documents} (id, doc_type, version, title_en, title_ar, subtitle_en, subtitle_ar, body_en, body_ar, status, published_at, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (doc_type, version) DO NOTHING`,
      [
        sid('legal', v.id),
        doc,
        v.version,
        en.title,
        ar.title,
        en.subtitle,
        ar.subtitle,
        isCurrent ? toMarkdown(en) : v.body_en,
        isCurrent ? toMarkdown(ar) : v.body_ar,
        v.status,
        rebase(v.publishedAt),
        superAdminId,
        rebase(v.publishedAt) ?? new Date(),
      ],
    );
  }
}

export async function seedCms(c: TxClient): Promise<void> {
  const testimonials = loadJson<{ id: string; name: { en: string; ar: string }; city: { en: string; ar: string }; role: { en: string; ar: string }; quote: { en: string; ar: string }; avatar: string; rating: number }[]>('testimonials.json');
  await insertMany(
    c,
    T.cms_testimonials,
    ['id', 'slug', 'name_en', 'name_ar', 'city_en', 'city_ar', 'role_en', 'role_ar', 'quote_en', 'quote_ar', 'avatar_url', 'rating', 'placements', 'sort_order', 'active'],
    testimonials.map((t, i) => [sid('testimonial', t.id), t.id, t.name.en, t.name.ar, t.city.en, t.city.ar, t.role.en, t.role.ar, t.quote.en, t.quote.ar, t.avatar, t.rating, ['landing', 'auth', 'app'], i + 1, true]),
    '(slug) DO NOTHING',
  );
  const faq = loadJson<{ q: { en: string; ar: string }; a: { en: string; ar: string } }[]>('faq.json');
  await insertMany(
    c,
    T.cms_faq,
    ['id', 'slug', 'question_en', 'question_ar', 'answer_en', 'answer_ar', 'placements', 'sort_order', 'active'],
    faq.map((f, i) => [sid('faq', i), `faq-${i + 1}`, f.q.en, f.q.ar, f.a.en, f.a.ar, ['landing', 'pricing', 'subscription_app', 'contact'], i + 1, true]),
    '(slug) DO NOTHING',
  );
}

export async function seedTemplates(c: TxClient, mock: AdminMock): Promise<void> {
  await insertMany(
    c,
    T.notification_templates,
    ['id', 'key', 'name', 'type', 'channel', 'subject_en', 'subject_ar', 'body_en', 'body_ar', 'variables', 'active', 'updated_at'],
    mock.templates.map((t) => [sid('template', t.id), t.id.replace(/^tpl_/, ''), t.name, t.type, t.channel, t.subject_en, t.subject_ar, t.body_en, t.body_ar, t.variables, t.active, rebase(t.updatedAt)]),
    '(key) DO NOTHING',
  );
}

export async function seedAchievements(c: TxClient): Promise<void> {
  const app = loadJson<{ achievements: { id: string; icon: string; title: { en: string; ar: string }; description: { en: string; ar: string }; hint: { en: string; ar: string }; target: number }[] }>('app-extras.json');
  const metric: Record<string, string> = {
    'streak-7': 'streak_days',
    'streak-30': 'streak_days',
    'perfect-quiz': 'perfect_quizzes',
    'questions-100': 'questions_answered',
    'night-owl': 'night_sessions',
    'early-bird': 'morning_sessions',
    'exam-ready': 'exams_passed',
    'mistake-slayer': 'mistakes_mastered',
    'all-rounder': 'subjects_started',
  };
  await insertMany(
    c,
    T.achievements,
    ['id', 'key', 'icon', 'title_en', 'title_ar', 'description_en', 'description_ar', 'hint_en', 'hint_ar', 'metric', 'target', 'sort_order'],
    app.achievements.map((a, i) => [sid('achievement', a.id), a.id, a.icon, a.title.en, a.title.ar, a.description.en, a.description.ar, a.hint.en, a.hint.ar, metric[a.id] ?? a.id, a.target, i + 1]),
    updateSet('(key)', ['icon', 'title_en', 'title_ar', 'description_en', 'description_ar', 'hint_en', 'hint_ar', 'metric', 'target', 'sort_order']),
  );
}
