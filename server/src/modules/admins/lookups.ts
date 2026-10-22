/** ADM-ME-09 — one cached call for every admin filter dropdown / name resolution. */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { TtlCache } from '../../common/utils/cache.js';

export const AI_MODELS = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  ],
  anthropic: [
    { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    { value: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  ],
  azure: [{ value: 'gpt-4o-azure', label: 'GPT-4o (Azure deployment)' }],
};

const cache = new TtlCache<unknown>(30_000);
type R = Record<string, unknown>;
const L = (r: R, f: string) => ({ en: String(r[`${f}_en`] ?? ''), ar: String(r[`${f}_ar`] ?? '') });

export async function adminLookups() {
  return cache.getOrLoad('lookups', async () => {
    const [govs, subjects, units, topics, packages, schools, marketers, teachers, admins, roles] = await Promise.all([
      db.many<R>(`SELECT code, name_en, name_ar FROM ${T.governorates} ORDER BY sort_order, name_en`),
      db.many<R>(`SELECT id, slug, name_en, name_ar, color FROM ${T.subjects} WHERE deleted_at IS NULL ORDER BY sort_order`),
      db.many<R>(`SELECT id, subject_id, title_en, title_ar, sort_order FROM ${T.units} WHERE deleted_at IS NULL ORDER BY sort_order`),
      db.many<R>(`SELECT id, unit_id, title_en, title_ar, sort_order FROM ${T.topics} WHERE deleted_at IS NULL ORDER BY sort_order`),
      db.many<R>(`SELECT id, name_en, name_ar, status FROM ${T.packages} WHERE deleted_at IS NULL ORDER BY sort_order`),
      db.many<R>(
        `SELECT s.id, s.name_en, s.name_ar, s.code, s.status, ms.marketer_id FROM ${T.schools} s
           LEFT JOIN ${T.marketer_schools} ms ON ms.school_id = s.id AND ms.unassigned_at IS NULL
          WHERE s.deleted_at IS NULL ORDER BY s.name_en`,
      ),
      db.many<R>(`SELECT id, name_en, name_ar, avatar_url, status FROM ${T.marketers} WHERE deleted_at IS NULL ORDER BY name_en`),
      db.many<R>(`SELECT id, name_en, name_ar, avatar_url, subject_id FROM ${T.teachers} ORDER BY sort_order, name_en`),
      db.many<R>(`SELECT u.id, u.name_en, u.name_ar, u.avatar_url FROM ${T.users} u WHERE u.kind = 'admin' AND u.deleted_at IS NULL ORDER BY u.name_en`),
      db.many<R>(`SELECT id, key, name_en, name_ar FROM ${T.roles} ORDER BY is_system DESC, name_en`),
    ]);
    const payments = await settingsStore.get('payments');
    return {
      governorates: govs.map((g) => ({ id: g.code, name: L(g, 'name') })),
      subjects: subjects.map((s) => ({ id: s.id, slug: s.slug, name: L(s, 'name'), color: s.color })),
      units: units.map((u) => ({ id: u.id, subjectId: u.subject_id, name: L(u, 'title'), order: u.sort_order })),
      topics: topics.map((t) => ({ id: t.id, unitId: t.unit_id, name: L(t, 'title'), order: t.sort_order })),
      packages: packages.map((p) => ({ id: p.id, name: L(p, 'name'), status: p.status })),
      schools: schools.map((s) => ({ id: s.id, name: L(s, 'name'), code: s.code, marketerId: s.marketer_id ?? null, status: s.status })),
      marketers: marketers.map((m) => ({ id: m.id, name: L(m, 'name'), avatarUrl: m.avatar_url ?? null, status: m.status })),
      teachers: teachers.map((t) => ({ id: t.id, name: L(t, 'name'), avatarUrl: t.avatar_url ?? null, subjectId: t.subject_id })),
      admins: admins.map((a) => ({ id: a.id, name: { en: String(a.name_en), ar: String(a.name_ar || a.name_en) }, avatarUrl: a.avatar_url ?? null })),
      roles: roles.map((r) => ({ id: r.id, key: r.key, name: L(r, 'name') })),
      gateways: [...payments.gateways].sort((a, b) => a.displayOrder - b.displayOrder).map((g) => ({ id: g.id, name: g.name, color: g.color })),
      aiModels: AI_MODELS,
    };
  });
}

export function invalidateLookups(): void {
  cache.clear();
}
