/** Partners: partner schools + school directory, marketers + assignments, incentive rules (versioned), milestone sets. */
import { T } from '../../config/constants.js';
import type { TxClient } from '../../config/db.js';
import { e164, insertMany, loadJson, rebase, sid } from './helpers.js';
import type { AdminMock, L } from './types.js';

/** Admin portal governorate ids → canonical slugs (contract §34.1 #13). */
export const GOV_BY_ADMIN: Record<string, string> = {
  gov_bgd: 'baghdad', gov_bsr: 'basra', gov_nin: 'nineveh', gov_erb: 'erbil', gov_njf: 'najaf', gov_krb: 'karbala', gov_bab: 'babylon',
  gov_diy: 'diyala', gov_anb: 'anbar', gov_krk: 'kirkuk', gov_dhq: 'dhi-qar', gov_mys: 'maysan', gov_was: 'wasit', gov_qad: 'qadisiyyah',
  gov_mut: 'muthanna', gov_sal: 'saladin', gov_sul: 'sulaymaniyah', gov_duh: 'duhok',
};
export const govId = (slug: string | undefined | null) => (slug ? sid('gov', slug) : null);
export const govFromAdmin = (adminId: string | null | undefined) => govId(adminId ? GOV_BY_ADMIN[adminId] : null);
export const schoolId = (key: string) => sid('school', key);
export const marketerId = (key: string) => sid('marketer', key);

export async function seedPartners(c: TxClient, mock: AdminMock, superAdminId: string): Promise<void> {
  // ── marketers ──
  await insertMany(
    c,
    T.marketers,
    ['id', 'code', 'referral_code', 'name_en', 'name_ar', 'mobile', 'email', 'avatar_url', 'governorate_id', 'status', 'joined_at'],
    mock.marketers.map((m, i) => {
      const code = `MKT-${m.name_en.split(' ')[0]?.toUpperCase().slice(0, 4)}${String(i + 1).padStart(2, '0')}`;
      return [marketerId(m.id), code, code.replace('MKT-', 'REF-'), m.name_en, m.name_ar, e164(m.mobile), m.email, m.avatar, govFromAdmin(m.governorateId), m.status, rebase(m.joinedAt)];
    }),
    '(id) DO NOTHING',
  );

  // ── partner schools (admin portal) ──
  await insertMany(
    c,
    T.schools,
    ['id', 'code', 'slug', 'referral_code', 'name_en', 'name_ar', 'city_en', 'city_ar', 'governorate_id', 'contact_name', 'contact_mobile', 'contract_start', 'contract_end', 'status', 'is_partner'],
    mock.schools.map((s) => [schoolId(s.id), s.code, s.id, s.code, s.name_en, s.name_ar, s.city_en, s.city_ar, govFromAdmin(s.governorateId), s.contactName, e164(s.contactMobile), rebase(s.contractStart), rebase(s.contractEnd), s.status, true]),
    '(id) DO NOTHING',
  );

  // ── school directory used by the student app's SchoolPicker (not partners unless matched) ──
  const appSchools = loadJson<{ id: string; name: L; governorate: string }[]>('app-schools.json');
  const partnerNames = new Set(mock.schools.map((s) => s.name_en.toLowerCase()));
  await insertMany(
    c,
    T.schools,
    ['id', 'code', 'slug', 'referral_code', 'name_en', 'name_ar', 'governorate_id', 'status', 'is_partner'],
    appSchools
      .filter((s) => !partnerNames.has(s.name.en.toLowerCase()))
      .map((s, i) => {
        const code = `DIR-${String(i + 1).padStart(3, '0')}`;
        return [schoolId(s.id), code, s.id, `${code}-R`, s.name.en, s.name.ar, govId(s.governorate), 'active', false];
      }),
    '(id) DO NOTHING',
  );

  // ── marketer ↔ school assignments (one active marketer per school) ──
  const assignments = mock.marketers.flatMap((m) => m.schoolIds.map((sId) => [sid('mkt-school', `${m.id}:${sId}`), marketerId(m.id), schoolId(sId), rebase(m.joinedAt), superAdminId]));
  for (const a of assignments) {
    await c.query(
      `INSERT INTO ${T.marketer_schools} (id, marketer_id, school_id, assigned_at, assigned_by)
       SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS (SELECT 1 FROM ${T.marketer_schools} WHERE school_id = $3 AND unassigned_at IS NULL)
       ON CONFLICT (id) DO NOTHING`,
      a,
    );
  }

  // ── incentive rules + tiers ──
  for (const r of mock.incentiveRules) {
    const group = r.partnerType === 'school' ? 'school_default' : 'marketer_default';
    await c.query(
      `INSERT INTO ${T.incentive_rules} (id, rule_group, version, name_en, name_ar, partner_type, qualification_threshold, period, effective_from, effective_to, status, created_by, created_by_name, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (rule_group, version) DO NOTHING`,
      [sid('incentive', r.id), group, r.version, r.name_en, r.name_ar, r.partnerType, r.qualificationThreshold, r.period, rebase(r.effectiveFrom), rebase(r.effectiveTo), r.status, superAdminId, r.createdBy, rebase(r.createdAt)],
    );
    await insertMany(
      c,
      T.incentive_rule_tiers,
      ['id', 'rule_id', 'from_count', 'to_count', 'reward_type', 'amount', 'label_en', 'label_ar', 'sort_order'],
      r.tiers.map((t, i) => [sid('tier', t.id), sid('incentive', r.id), t.from, t.to, t.rewardType, t.amount, t.label, t.label, i + 1]),
      '(id) DO NOTHING',
    );
  }

  // ── milestone sets (versions) + items ──
  const versions = [...new Set(mock.milestoneRules.map((m) => m.version))];
  for (const v of versions) {
    const items = mock.milestoneRules.filter((m) => m.version === v);
    const status = items[0]?.status ?? 'draft';
    await c.query(
      `INSERT INTO ${T.milestone_sets} (id, version, status, effective_from, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,'Huda Kareem') ON CONFLICT (version) DO NOTHING`,
      [sid('milestone-set', v), v, status, rebase(items[0]?.effectiveFrom ?? null) ?? new Date(), superAdminId],
    );
    await insertMany(
      c,
      T.milestone_items,
      ['id', 'set_id', 'threshold', 'reward', 'label_en', 'label_ar', 'sort_order'],
      items.map((m, i) => [sid('milestone-item', m.id), sid('milestone-set', v), m.threshold, m.reward, m.label_en, m.label_ar, i + 1]),
      '(id) DO NOTHING',
    );
  }
}
