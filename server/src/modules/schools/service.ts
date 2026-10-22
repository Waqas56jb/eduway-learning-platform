/** Partner schools (ADM-SCH-*): CRUD, referral code/link, attribution guard, incentive progress, notes. */
import { T } from '../../config/constants.js';
import { db, tx, type Executor } from '../../config/db.js';
import { env } from '../../config/env.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/index.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { addDays } from '../../common/utils/dates.js';
import { governorateUuid, iso, L, pageOf, parseSort, sortRows, type Row } from '../commerce/lib.js';
import { calcIncentive, parsePeriodKey, periodFor, progressPct, type PeriodRange } from '../incentives/calculator.js';
import { incentiveRules, type IncentiveRuleDto } from '../incentives/service.js';
import { decideAttribution } from '../marketers/attribution.js';

export interface SchoolDto {
  id: string;
  name: { en: string; ar: string };
  code: string;
  referralLink: string;
  city: { en: string; ar: string };
  governorateId: string;
  governorate: { id: string; name: { en: string; ar: string } };
  contactName: string;
  contactMobile: string;
  marketerId: string | null;
  marketer: { id: string; name: { en: string; ar: string }; avatarUrl: string | null } | null;
  contractStart: string;
  contractEnd: string;
  status: 'active' | 'pending' | 'suspended';
  verifiedPaidStudents: number;
  periodPaidStudents: number;
  tier: string;
  pendingSettlement: number;
  estimatedReward: number;
  notesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolWrite {
  name: { en: string; ar: string };
  code: string;
  city: { en: string; ar: string };
  governorateId: string;
  contactName: string;
  contactMobile: string;
  contractStart: string;
  contractEnd: string;
  status: SchoolDto['status'];
}

const SELECT = (periodFromIdx: number, periodToIdx: number) => `
  SELECT s.*, g.code AS g_code, g.name_en AS g_name_en, g.name_ar AS g_name_ar,
         m.id AS m_id, m.name_en AS m_name_en, m.name_ar AS m_name_ar, m.avatar_url AS m_avatar_url,
         (SELECT count(DISTINCT p.user_id)::int FROM ${T.payments} p WHERE p.school_id = s.id AND p.status IN ('paid', 'partially_refunded') AND p.paid_at IS NOT NULL) AS verified,
         (SELECT count(DISTINCT p.user_id)::int FROM ${T.payments} p WHERE p.school_id = s.id AND p.status IN ('paid', 'partially_refunded') AND p.paid_at >= $${periodFromIdx} AND p.paid_at < $${periodToIdx}) AS period_paid,
         (SELECT COALESCE(sum(st.amount), 0)::bigint FROM ${T.settlements} st WHERE st.school_id = s.id AND st.status IN ('pending', 'approved')) AS pending_settlement,
         (SELECT count(*)::int FROM ${T.entity_notes} n WHERE n.entity_type = 'school' AND n.entity_id = s.id) AS notes_count
    FROM ${T.schools} s
    LEFT JOIN ${T.governorates} g ON g.id = s.governorate_id
    LEFT JOIN ${T.marketer_schools} ms ON ms.school_id = s.id AND ms.unassigned_at IS NULL
    LEFT JOIN ${T.marketers} m ON m.id = ms.marketer_id
   WHERE s.deleted_at IS NULL AND s.is_partner`;

const referralLink = (code: string) => `${env.USER_APP_URL.replace(/\/+$/, '')}/join?code=${encodeURIComponent(code)}`;
const day = (v: unknown) => (v ? new Date(v as string).toISOString() : '');

function toDto(r: Row, rule: IncentiveRuleDto | null): SchoolDto {
  const periodPaid = Number(r.period_paid ?? 0);
  const res = rule ? calcIncentive(rule, periodPaid) : null;
  return {
    id: String(r.id),
    name: L(r, 'name'),
    code: String(r.code),
    referralLink: referralLink(String(r.code)),
    city: L(r, 'city'),
    governorateId: String(r.g_code ?? ''),
    governorate: { id: String(r.g_code ?? ''), name: L(r, 'g_name') },
    contactName: String(r.contact_name ?? ''),
    contactMobile: String(r.contact_mobile ?? ''),
    marketerId: (r.m_id as string | null) ?? null,
    marketer: r.m_id ? { id: String(r.m_id), name: L(r, 'm_name'), avatarUrl: (r.m_avatar_url as string | null) ?? null } : null,
    contractStart: day(r.contract_start),
    contractEnd: day(r.contract_end),
    status: r.status as SchoolDto['status'],
    verifiedPaidStudents: Number(r.verified ?? 0),
    periodPaidStudents: periodPaid,
    tier: res?.tier?.label ?? '',
    pendingSettlement: Number(r.pending_settlement ?? 0),
    estimatedReward: res?.amount ?? 0,
    notesCount: Number(r.notes_count ?? 0),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

async function context(ex?: Executor): Promise<{ rule: IncentiveRuleDto | null; range: PeriodRange }> {
  const rule = await incentiveRules.active('school', ex);
  return { rule, range: periodFor(rule?.period ?? 'monthly') };
}

export interface SchoolListFilter {
  q?: string;
  status?: string;
  governorateId?: string;
  marketerId?: string;
  tier?: string;
  ids?: string[];
  sort?: string;
}

export const schoolsService = {
  async all(f: SchoolListFilter = {}, ex?: Executor): Promise<SchoolDto[]> {
    const { rule, range } = await context(ex);
    const rows = await db.many<Row>(`${SELECT(1, 2)} ORDER BY s.name_en`, [range.from, range.to], ex);
    let list = rows.map((r) => toDto(r, rule));
    if (f.status) list = list.filter((s) => s.status === f.status);
    if (f.governorateId) list = list.filter((s) => s.governorateId === f.governorateId);
    if (f.marketerId === '__none') list = list.filter((s) => !s.marketerId);
    else if (f.marketerId) list = list.filter((s) => s.marketerId === f.marketerId);
    if (f.tier) list = list.filter((s) => s.tier === f.tier);
    if (f.ids?.length) list = list.filter((s) => f.ids?.includes(s.id));
    if (f.q) {
      const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter((s) => words.every((w) => `${s.name.en} ${s.name.ar} ${s.code} ${s.city.en} ${s.city.ar} ${s.contactName} ${s.contactMobile}`.toLowerCase().includes(w)));
    }
    const sort = parseSort(f.sort, ['name', 'code', 'verifiedPaidStudents', 'pendingSettlement', 'contractEnd', 'status', 'periodPaidStudents', 'createdAt', 'tier'], '-verifiedPaidStudents');
    return sortRows(list, sort, (s, k) => (k === 'name' ? s.name.en : (s as unknown as Record<string, unknown>)[k]));
  },

  async page(f: SchoolListFilter & { page: number; pageSize: number }) {
    return pageOf(await this.all(f), f.page, f.pageSize);
  },

  async stats() {
    const [list, rule] = await Promise.all([this.all(), incentiveRules.active('school')]);
    return {
      total: list.length,
      active: list.filter((s) => s.status === 'active').length,
      pending: list.filter((s) => s.status === 'pending').length,
      suspended: list.filter((s) => s.status === 'suspended').length,
      verifiedPaidStudents: list.reduce((a, s) => a + s.verifiedPaidStudents, 0),
      pendingSettlement: list.reduce((a, s) => a + s.pendingSettlement, 0),
      tiers: (rule?.tiers ?? []).map((t) => t.label).filter(Boolean),
    };
  },

  async get(id: string, ex?: Executor): Promise<SchoolDto> {
    const { rule, range } = await context(ex);
    const r = await db.maybeOne<Row>(`${SELECT(2, 3)} AND s.id = $1`, [id, range.from, range.to], ex);
    if (!r) throw new NotFoundError('school');
    return toDto(r, rule);
  },

  async create(body: SchoolWrite & { marketerId?: string | null }, admin: AdminPrincipal): Promise<SchoolDto> {
    return tx(async (c) => {
      const code = body.code.toUpperCase();
      const taken = await db.scalar<boolean>(`SELECT true FROM ${T.schools} WHERE upper(code) = $1 OR upper(referral_code) = $1 LIMIT 1`, [code], c);
      if (taken) throw new ConflictError('ALREADY_EXISTS', { field: 'code' });
      const gov = await governorateUuid(body.governorateId, c);
      const id = await db.scalar<string>(
        `INSERT INTO ${T.schools} (code, slug, referral_code, name_en, name_ar, city_en, city_ar, governorate_id, contact_name, contact_mobile, contract_start, contract_end, status, is_partner)
         VALUES ($1, lower($1), $1, $2,$3,$4,$5,$6,$7,$8,$9::date,$10::date,$11,true) RETURNING id`,
        [code, body.name.en, body.name.ar, body.city.en, body.city.ar, gov, body.contactName, body.contactMobile, body.contractStart.slice(0, 10), body.contractEnd.slice(0, 10), body.status],
        c,
      );
      if (body.marketerId) {
        const ok = await db.scalar<boolean>(`SELECT true FROM ${T.marketers} WHERE id = $1 AND deleted_at IS NULL`, [body.marketerId], c);
        if (!ok) throw new NotFoundError('marketer');
        await db.query(`INSERT INTO ${T.marketer_schools} (marketer_id, school_id, assigned_by) VALUES ($1,$2,$3)`, [body.marketerId, id, admin.userId], c);
      }
      return this.get(id as string, c);
    });
  },

  /** Code change keeps the old code usable as referral alias for 90 days (cleared by the expiry job). */
  async update(id: string, body: Partial<SchoolWrite>): Promise<SchoolDto> {
    return tx(async (c) => {
      const cur = await db.maybeOne<Row>(`SELECT * FROM ${T.schools} WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id], c);
      if (!cur) throw new NotFoundError('school');
      const sets: string[] = [];
      const params: unknown[] = [id];
      const set = (col: string, v: unknown, cast = '') => {
        if (v === undefined) return;
        params.push(v);
        sets.push(`${col} = $${params.length}${cast}`);
      };
      if (body.code && body.code.toUpperCase() !== String(cur.code).toUpperCase()) {
        const code = body.code.toUpperCase();
        const taken = await db.scalar<boolean>(`SELECT true FROM ${T.schools} WHERE id <> $2 AND (upper(code) = $1 OR upper(referral_code) = $1) LIMIT 1`, [code, id], c);
        if (taken) throw new ConflictError('ALREADY_EXISTS', { field: 'code' });
        set('code', code);
        set('referral_code', String(cur.code));
        set('code_alias_until', addDays(new Date(), 90));
      }
      set('name_en', body.name?.en);
      set('name_ar', body.name?.ar);
      set('city_en', body.city?.en);
      set('city_ar', body.city?.ar);
      if (body.governorateId) set('governorate_id', await governorateUuid(body.governorateId, c));
      set('contact_name', body.contactName);
      set('contact_mobile', body.contactMobile);
      set('contract_start', body.contractStart?.slice(0, 10), '::date');
      set('contract_end', body.contractEnd?.slice(0, 10), '::date');
      set('status', body.status);
      const start = body.contractStart ?? cur.contract_start;
      const end = body.contractEnd ?? cur.contract_end;
      if (start && end && new Date(end as string).getTime() <= new Date(start as string).getTime()) throw new BusinessRuleError('INVALID_TRANSITION', { field: 'contractEnd' });
      if (sets.length) await db.query(`UPDATE ${T.schools} SET ${sets.join(', ')} WHERE id = $1`, params, c);
      return this.get(id, c);
    });
  },

  /** Removes the code/attribution link (students keep history); settlements are kept. */
  async remove(id: string): Promise<SchoolDto> {
    return tx(async (c) => {
      const before = await this.get(id, c);
      await db.query(`UPDATE ${T.marketer_schools} SET unassigned_at = now(), override_reason = COALESCE(override_reason, 'school deleted') WHERE school_id = $1 AND unassigned_at IS NULL`, [id], c);
      await db.query(
        `UPDATE ${T.schools} SET deleted_at = now(), status = 'suspended', code = code || '-DEL-' || substr(md5(random()::text), 1, 6),
                referral_code = referral_code || '-DEL-' || substr(md5(random()::text), 1, 6), code_alias_until = NULL WHERE id = $1`,
        [id],
        c,
      );
      return before;
    });
  },

  async bulkStatus(ids: string[], status: 'active' | 'suspended') {
    const succeeded: string[] = [];
    const failed: { id: string; code: string; message: string }[] = [];
    for (const id of ids) {
      const n = await db.exec(`UPDATE ${T.schools} SET status = $2 WHERE id = $1 AND deleted_at IS NULL`, [id, status]);
      if (n) succeeded.push(id);
      else failed.push({ id, code: 'NOT_FOUND', message: 'school not found' });
    }
    return { succeeded, failed };
  },

  /**
   * Double-attribution guard (ADM-SCH-09, ADM-MKT-09/10). Throws 409 DOUBLE_ATTRIBUTION with
   * details.currentMarketer when re-assigning without an override reason. Returns the audit action.
   */
  async setMarketer(schoolId: string, marketerId: string | null, overrideReason: string | undefined, admin: AdminPrincipal): Promise<{ action: string | null; before: { marketerId: string | null }; school: SchoolDto }> {
    return tx(async (c) => {
      const school = await db.maybeOne<Row>(`SELECT id FROM ${T.schools} WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [schoolId], c);
      if (!school) throw new NotFoundError('school');
      const cur = await db.maybeOne<Row>(
        `SELECT ms.id, m.id AS m_id, m.name_en AS m_name_en, m.name_ar AS m_name_ar, m.avatar_url AS m_avatar_url
           FROM ${T.marketer_schools} ms JOIN ${T.marketers} m ON m.id = ms.marketer_id WHERE ms.school_id = $1 AND ms.unassigned_at IS NULL`,
        [schoolId],
        c,
      );
      if (marketerId) {
        const ok = await db.scalar<boolean>(`SELECT true FROM ${T.marketers} WHERE id = $1 AND deleted_at IS NULL`, [marketerId], c);
        if (!ok) throw new NotFoundError('marketer');
      }
      const currentId = (cur?.m_id as string | undefined) ?? null;
      const d = decideAttribution(currentId, marketerId, overrideReason);
      if (d.error) {
        throw new ConflictError('DOUBLE_ATTRIBUTION', { currentMarketer: { id: currentId, name: L(cur as Row, 'm_name'), avatarUrl: (cur?.m_avatar_url as string | null) ?? null } });
      }
      if (d.action !== 'noop') {
        if (cur) await db.query(`UPDATE ${T.marketer_schools} SET unassigned_at = now() WHERE id = $1`, [cur.id], c);
        if (marketerId) {
          await db.query(`INSERT INTO ${T.marketer_schools} (marketer_id, school_id, assigned_by, override_reason) VALUES ($1,$2,$3,$4)`, [marketerId, schoolId, admin.userId, d.action === 'override' ? (overrideReason ?? '').trim() : null], c);
        }
      }
      return { action: d.auditAction, before: { marketerId: currentId }, school: await this.get(schoolId, c) };
    });
  },

  async incentiveProgress(id: string, periodKey?: string) {
    await this.get(id);
    const rule = await incentiveRules.active('school');
    const range = periodKey ? parsePeriodKey(periodKey) : periodFor(rule?.period ?? 'monthly');
    if (!range) throw new BusinessRuleError('PERIOD_INVALID', { period: periodKey });
    const effective = periodKey ? ((await incentiveRules.forPeriod('school', range)) ?? rule) : rule;
    const paid =
      (await db.scalar<number>(
        `SELECT count(DISTINCT user_id)::int FROM ${T.payments} WHERE school_id = $1 AND status IN ('paid', 'partially_refunded') AND paid_at >= $2 AND paid_at < $3`,
        [id, range.from, range.to],
      )) ?? 0;
    const result = effective ? calcIncentive(effective, paid) : { qualified: false, tier: null, amount: 0, nextTier: null, studentsToNext: null, breakdown: 'not_qualified' as const };
    return { rule: effective, period: { key: range.key, from: range.from.toISOString(), to: range.to.toISOString() }, paid, result, progressPct: effective ? progressPct(paid, result, effective.qualificationThreshold) : 0 };
  },

  async notes(id: string) {
    await this.get(id);
    const rows = await db.many<Row>(
      `SELECT n.*, u.id AS a_id, u.name_en AS a_name_en, u.name_ar AS a_name_ar, u.avatar_url AS a_avatar_url
         FROM ${T.entity_notes} n LEFT JOIN ${T.users} u ON u.id = n.author_id
        WHERE n.entity_type = 'school' AND n.entity_id = $1 ORDER BY n.created_at DESC`,
      [id],
    );
    return rows.map((n) => ({
      id: String(n.id),
      author: n.a_id ? { id: String(n.a_id), name: L(n, 'a_name'), avatarUrl: (n.a_avatar_url as string | null) ?? null } : { id: '', name: { en: String(n.author_name), ar: String(n.author_name) }, avatarUrl: null },
      body: String(n.body),
      createdAt: iso(n.created_at),
    }));
  },

  async addNote(id: string, body: string, admin: AdminPrincipal) {
    await this.get(id);
    const nid = await db.scalar<string>(`INSERT INTO ${T.entity_notes} (entity_type, entity_id, author_id, author_name, body) VALUES ('school', $1, $2, $3, $4) RETURNING id`, [id, admin.userId, admin.name, body]);
    return (await this.notes(id)).find((n) => n.id === nid);
  },
};
