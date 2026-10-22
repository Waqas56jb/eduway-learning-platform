/** Public / CMS endpoints (PUB-01..11) — no auth, cacheable. */
import { T, type StudentPlatform } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { storage } from '../../common/services/storage.js';
import { resolveReferralCode } from '../../common/services/referrals.js';
import { TtlCache } from '../../common/utils/cache.js';
import { compareSemver } from '../../common/utils/semver.js';
import { cmsService } from '../settings/cms.js';
import { supportService } from '../students/support.js';

const cache = new TtlCache<unknown>(30_000);
type R = Record<string, unknown>;
const L = (r: R, f: string) => ({ en: String(r[`${f}_en`] ?? ''), ar: String(r[`${f}_ar`] ?? '') });

/** Gateway catalogue texts (display only; enabled flags + fees live in settings.payments). */
const GATEWAY_META: Record<string, { kind: 'wallet' | 'card'; hint: { en: string; ar: string }; flow: 'redirect' | 'deeplink' | 'mock'; requiresPhone: boolean }> = {
  zaincash: { kind: 'wallet', hint: { en: 'Pay with your ZainCash wallet', ar: 'ادفع عبر محفظة زين كاش' }, flow: 'deeplink', requiresPhone: true },
  fastpay: { kind: 'wallet', hint: { en: 'Pay with FastPay', ar: 'ادفع عبر فاست باي' }, flow: 'deeplink', requiresPhone: true },
  qicard: { kind: 'card', hint: { en: 'Qi Card / Master Card', ar: 'كي كارد / ماستر كارد' }, flow: 'redirect', requiresPhone: false },
  asiahawala: { kind: 'wallet', hint: { en: 'Pay with AsiaHawala', ar: 'ادفع عبر آسيا حوالة' }, flow: 'deeplink', requiresPhone: true },
  visa: { kind: 'card', hint: { en: 'Visa / Mastercard', ar: 'فيزا / ماستر كارد' }, flow: 'redirect', requiresPhone: false },
  mock: { kind: 'wallet', hint: { en: 'Development test gateway', ar: 'بوابة اختبار للتطوير' }, flow: 'mock', requiresPhone: false },
};

export const publicService = {
  async appConfig(platform: StudentPlatform | null, appVersion: string | undefined) {
    const [general, otp, support, learning, marketing, payments, app, flags, tags] = await Promise.all([
      settingsStore.get('general'),
      settingsStore.get('otp'),
      settingsStore.get('support'),
      settingsStore.get('learning'),
      settingsStore.get('marketing'),
      settingsStore.get('payments'),
      settingsStore.app(),
      cache.getOrLoad('prodFlags', () => db.many<{ key: string; enabled: boolean; platforms: string[] }>(`SELECT key, enabled, platforms FROM ${T.feature_flags} WHERE environment = 'production'`)) as Promise<{ key: string; enabled: boolean; platforms: string[] }[]>,
      cache.getOrLoad('tags', () => db.many<{ slug: string; name_en: string; name_ar: string }>(`SELECT slug, name_en, name_ar FROM ${T.tags} ORDER BY slug`)) as Promise<{ slug: string; name_en: string; name_ar: string }[]>,
    ]);
    const plat = platform ?? 'web';
    const min = plat === 'ios' ? app.minVersionIos : app.minVersionAndroid;
    const isApp = plat === 'ios' || plat === 'android';
    return {
      platformName: general.platformName,
      logoUrl: await storage.resolveUrl(general.logoUrl),
      defaultLanguage: general.defaultLanguage,
      currency: general.currency,
      timezone: general.timezone,
      dateFormat: general.dateFormat,
      academicYear: general.academicYear,
      maintenance: { enabled: app.maintenanceMode && (app.maintenancePlatforms as string[]).includes(plat), message: app.maintenanceMessage },
      update: {
        minVersion: { ios: app.minVersionIos, android: app.minVersionAndroid },
        latestVersion: app.latestVersion,
        forceUpdate: app.forceUpdate,
        required: isApp && !!appVersion && app.forceUpdate && compareSemver(appVersion, min) < 0,
        recommended: isApp && !!appVersion && compareSemver(appVersion, app.latestVersion) < 0,
        storeUrls: { ios: app.storeUrlIos, android: app.storeUrlAndroid },
      },
      deviceLimit: app.deviceLimit,
      sessionTimeoutMinutes: app.sessionTimeoutMinutes,
      otp: { codeLength: otp.codeLength, resendCooldownSeconds: otp.resendCooldownSeconds, expirySeconds: otp.expirySeconds },
      featureFlags: Object.fromEntries(flags.map((f) => [f.key, f.enabled && (f.platforms ?? []).includes(plat)])),
      support: { phone: support.phone, whatsapp: support.whatsapp, email: support.email, hours: support.hours, address: support.address, facebook: support.facebook, instagram: support.instagram, telegram: support.telegram, youtube: support.youtube, tiktok: support.tiktok },
      social: { facebook: support.facebook, instagram: support.instagram, telegram: support.telegram, youtube: support.youtube, tiktok: support.tiktok || null },
      appLinks: marketing.appLinks,
      learning: {
        quizQuestionCount: learning.quizQuestionCount,
        quizPassMark: learning.quizPassMark,
        examDefaultPassMark: learning.examDefaultPassMark,
        practiceSessionSizes: learning.practiceSessionSizes,
        practiceMaxSize: learning.practiceMaxSize,
        dailyGoalMinutes: learning.dailyGoalMinutes,
        watchHeartbeatSeconds: learning.watchHeartbeatSeconds,
        examAutosaveSeconds: learning.examAutosaveSeconds,
        gradeBands: learning.gradeBands,
      },
      promoCodesEnabled: flags.find((f) => f.key === 'promo_codes')?.enabled ?? true,
      avatarPresets: learning.avatarPresets,
      tagLabels: Object.fromEntries(tags.map((t) => [t.slug, { en: t.name_en, ar: t.name_ar || t.name_en }])),
      paymentGateways: payments.gateways.filter((g) => g.enabled).map((g) => g.id),
      serverTime: new Date().toISOString(),
    };
  },

  async governorates(locale: 'en' | 'ar') {
    const rows = await db.many<R>(`SELECT code, name_en, name_ar FROM ${T.governorates}`);
    return rows.map((g) => ({ id: String(g.code), name: L(g, 'name') })).sort((a, b) => a.name[locale].localeCompare(b.name[locale], locale));
  },

  async schools(q: { governorateId?: string; q?: string; limit: number }) {
    const p: unknown[] = [q.governorateId ?? null];
    let where = `s.status = 'active' AND s.deleted_at IS NULL`;
    if (q.q) {
      p.push(`%${q.q.toLowerCase()}%`);
      where += ` AND (lower(s.name_en) LIKE $${p.length} OR s.name_ar LIKE $${p.length})`;
    }
    p.push(q.limit);
    const rows = await db.many<R>(
      `SELECT s.id, s.name_en, s.name_ar, g.code AS gov FROM ${T.schools} s LEFT JOIN ${T.governorates} g ON g.id = s.governorate_id
        WHERE ${where} ORDER BY (g.code IS NOT DISTINCT FROM $1) DESC, s.name_en LIMIT $${p.length}`,
      p,
    );
    return rows.map((s) => ({ id: String(s.id), name: L(s, 'name'), governorate: String(s.gov ?? ''), code: null }));
  },

  async referralCode(code: string) {
    const r = await resolveReferralCode(code);
    return r ? { valid: true, kind: r.kind, label: r.label } : { valid: false, kind: null, label: null };
  },

  async stats() {
    return cache.getOrLoad('stats', async () => {
      const c = await db.one<{ students: number; lessons: number; questions: number; subjects: number; governorates: number }>(
        `SELECT (SELECT count(*) FROM ${T.users} WHERE kind = 'student' AND deleted_at IS NULL)::int AS students,
                (SELECT count(*) FROM ${T.lessons} WHERE status = 'published' AND deleted_at IS NULL)::int AS lessons,
                (SELECT count(*) FROM ${T.questions} WHERE status = 'published' AND deleted_at IS NULL)::int AS questions,
                (SELECT count(*) FROM ${T.subjects} WHERE status = 'active' AND deleted_at IS NULL)::int AS subjects,
                (SELECT count(*) FROM ${T.governorates})::int AS governorates`,
      );
      const m = await settingsStore.get('marketing');
      return { ...c, ...m.stats, displayOverrides: m.displayOverrides };
    });
  },

  async testimonials(placement?: string) {
    const items = await cmsService.testimonials(placement ?? 'landing', true);
    return items.map(({ active: _a, placements: _p, ...t }) => t);
  },

  async faq(placement?: string) {
    const items = await cmsService.faqs(placement ?? 'landing', true);
    return items.map(({ active: _a, placements: _p, ...f }) => f);
  },

  async teachers() {
    const rows = await db.many<R>(
      `SELECT t.*, s.slug AS subject_slug FROM ${T.teachers} t LEFT JOIN ${T.subjects} s ON s.id = t.subject_id WHERE t.active ORDER BY t.sort_order, t.name_en`,
    );
    const avatars = await storage.resolveMany(rows.map((r) => r.avatar_url as string | null));
    return rows.map((t, i) => ({
      id: String(t.id),
      name: L(t, 'name'),
      bio: L(t, 'bio'),
      avatarUrl: avatars[i] ?? null,
      subjectId: (t.subject_id as string | null) ?? '',
      subjectSlug: String(t.subject_slug ?? ''),
      yearsExperience: (t.years_experience as number | null) ?? null,
      studentsCount: (t.students_count as number | null) ?? null,
      rating: t.rating === null || t.rating === undefined ? null : Number(t.rating),
      active: Boolean(t.active),
    }));
  },

  async paymentMethods() {
    const p = await settingsStore.get('payments');
    return [...p.gateways]
      .filter((g) => g.id !== 'mock' || (p.mockGatewayEnabled && process.env.NODE_ENV !== 'production'))
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((g) => {
        const meta = GATEWAY_META[g.id] ?? { kind: 'wallet' as const, hint: { en: '', ar: '' }, flow: 'redirect' as const, requiresPhone: false };
        return { id: g.id, kind: meta.kind, name: g.name, hint: meta.hint, color: g.color, logoUrl: null, enabled: g.enabled, requiresPhone: meta.requiresPhone, flow: meta.flow };
      });
  },

  async contact(input: { name: string; contact: string; subject: string; message: string; locale?: 'en' | 'ar' }) {
    const category = input.subject === 'billing' ? 'payment' : input.subject === 'support' ? 'access' : 'account';
    const subjectText = `${input.subject[0]?.toUpperCase()}${input.subject.slice(1)} — ${input.name}`;
    return supportService.create({ contactName: input.name, contactValue: input.contact, subject: subjectText, message: input.message, category, source: 'contact_form', locale: input.locale });
  },
};
