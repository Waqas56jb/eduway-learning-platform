/** Versioned incentive rules (ADM-INC-*). Permission module = schools | marketers by partnerType. */
import { T, type PermissionKey } from '../../config/constants.js';
import { db, tx, type Executor } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/index.js';
import { assertPermission } from '../../common/middleware/rbac.js';
import { auditService } from '../../common/services/audit.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { addDays, BUSINESS_TZ, dayjs } from '../../common/utils/dates.js';
import { iso, isoOrNull, L, type Row } from '../commerce/lib.js';
import { calcIncentive, validateTiers, type PeriodRange, type PeriodType, type Tier, type TierInput } from './calculator.js';

export type PartnerType = 'school' | 'marketer';
type RuleStatus = 'active' | 'scheduled' | 'superseded' | 'draft';
type AdminRefDto = { id: string; name: { en: string; ar: string }; avatarUrl: string | null };

export interface IncentiveRuleDto {
  id: string;
  version: number;
  name: { en: string; ar: string };
  partnerType: PartnerType;
  qualificationThreshold: number;
  tiers: Tier[];
  period: PeriodType;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: RuleStatus;
  createdBy: AdminRefDto;
  createdAt: string;
  activatedBy: AdminRefDto | null;
  activatedAt: string | null;
}

export const modulePerm = (partnerType: PartnerType, action: 'view' | 'edit' | 'delete' | 'approve' | 'export'): PermissionKey =>
  `${partnerType === 'school' ? 'schools' : 'marketers'}.${action}` as PermissionKey;

const SELECT = `
  SELECT r.*, cb.id AS cb_id, cb.name_en AS cb_name_en, cb.name_ar AS cb_name_ar, cb.avatar_url AS cb_avatar_url,
         ab.id AS ab_id, ab.name_en AS ab_name_en, ab.name_ar AS ab_name_ar, ab.avatar_url AS ab_avatar_url
    FROM ${T.incentive_rules} r
    LEFT JOIN ${T.users} cb ON cb.id = r.created_by
    LEFT JOIN ${T.users} ab ON ab.id = r.activated_by`;

async function hydrate(rows: Row[], ex?: Executor): Promise<IncentiveRuleDto[]> {
  if (!rows.length) return [];
  const tiers = await db.many<Row>(`SELECT * FROM ${T.incentive_rule_tiers} WHERE rule_id = ANY($1::uuid[]) ORDER BY from_count, sort_order`, [rows.map((r) => r.id)], ex);
  return rows.map((r) => ({
    id: String(r.id),
    version: Number(r.version),
    name: L(r, 'name'),
    partnerType: r.partner_type as PartnerType,
    qualificationThreshold: Number(r.qualification_threshold),
    tiers: tiers
      .filter((t) => t.rule_id === r.id)
      .map((t) => ({ id: String(t.id), from: Number(t.from_count), to: t.to_count === null ? null : Number(t.to_count), rewardType: t.reward_type as Tier['rewardType'], amount: Number(t.amount), label: String(t.label_en || t.label_ar || '') })),
    period: r.period as PeriodType,
    effectiveFrom: iso(r.effective_from),
    effectiveTo: isoOrNull(r.effective_to),
    status: r.status as RuleStatus,
    createdBy: r.cb_id ? { id: String(r.cb_id), name: L(r, 'cb_name'), avatarUrl: (r.cb_avatar_url as string | null) ?? null } : { id: '', name: { en: String(r.created_by_name ?? ''), ar: String(r.created_by_name ?? '') }, avatarUrl: null },
    createdAt: iso(r.created_at),
    activatedBy: r.ab_id ? { id: String(r.ab_id), name: L(r, 'ab_name'), avatarUrl: (r.ab_avatar_url as string | null) ?? null } : null,
    activatedAt: isoOrNull(r.activated_at),
  }));
}

async function replaceTiers(ruleId: string, tiers: TierInput[], ex: Executor) {
  await db.query(`DELETE FROM ${T.incentive_rule_tiers} WHERE rule_id = $1`, [ruleId], ex);
  for (const [i, t] of [...tiers].sort((a, b) => a.from - b.from).entries()) {
    await db.query(
      `INSERT INTO ${T.incentive_rule_tiers} (rule_id, from_count, to_count, reward_type, amount, label_en, label_ar, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$6,$7)`,
      [ruleId, t.from, t.to, t.rewardType, t.amount, t.label, i + 1],
      ex,
    );
  }
}

/** Switch a rule to active (superseding the current active one of the same partner type). */
async function activateNow(rule: IncentiveRuleDto, actorId: string | null, ex: Executor): Promise<IncentiveRuleDto | null> {
  const prev = await db.maybeOne<Row>(`SELECT id FROM ${T.incentive_rules} WHERE partner_type = $1 AND status = 'active' AND id <> $2 FOR UPDATE`, [rule.partnerType, rule.id], ex);
  if (prev) {
    await db.query(`UPDATE ${T.incentive_rules} SET status = 'superseded', effective_to = $2 WHERE id = $1`, [prev.id, addDays(new Date(rule.effectiveFrom), -1)], ex);
  }
  await db.query(`UPDATE ${T.incentive_rules} SET status = 'active', activated_by = COALESCE($2, activated_by), activated_at = COALESCE(activated_at, now()) WHERE id = $1`, [rule.id, actorId], ex);
  return prev ? ((await hydrate(await db.many<Row>(`${SELECT} WHERE r.id = $1`, [prev.id], ex), ex))[0] ?? null) : null;
}

export const incentiveRules = {
  async list(partnerType: PartnerType, status?: string): Promise<IncentiveRuleDto[]> {
    const rows = await db.many<Row>(`${SELECT} WHERE r.partner_type = $1 AND ($2::text IS NULL OR r.status = $2) ORDER BY r.version DESC, r.created_at DESC`, [partnerType, status ?? null]);
    return hydrate(rows);
  },

  async get(id: string, ex?: Executor): Promise<IncentiveRuleDto> {
    const r = await db.maybeOne<Row>(`${SELECT} WHERE r.id = $1`, [id], ex);
    if (!r) throw new NotFoundError('incentiveRule');
    return (await hydrate([r], ex))[0] as IncentiveRuleDto;
  },

  /** Load + check the module permission for this rule's partner type. */
  async getChecked(id: string, admin: AdminPrincipal, action: 'view' | 'edit' | 'delete' | 'approve'): Promise<IncentiveRuleDto> {
    const rule = await this.get(id);
    assertPermission(admin, modulePerm(rule.partnerType, action));
    return rule;
  },

  async active(partnerType: PartnerType, ex?: Executor): Promise<IncentiveRuleDto | null> {
    const r = await db.maybeOne<Row>(`${SELECT} WHERE r.partner_type = $1 AND r.status = 'active' ORDER BY r.effective_from DESC LIMIT 1`, [partnerType], ex);
    return r ? ((await hydrate([r], ex))[0] ?? null) : null;
  },

  /** Rule effective for a settlement period (latest effective_from overlapping the period). */
  async forPeriod(partnerType: PartnerType, range: PeriodRange, ex?: Executor): Promise<IncentiveRuleDto | null> {
    const r = await db.maybeOne<Row>(
      `${SELECT} WHERE r.partner_type = $1 AND r.status IN ('active', 'superseded') AND r.effective_from < $3 AND (r.effective_to IS NULL OR r.effective_to >= $2)
        ORDER BY r.effective_from DESC, r.version DESC LIMIT 1`,
      [partnerType, range.from, range.to],
      ex,
    );
    return r ? ((await hydrate([r], ex))[0] ?? null) : null;
  },

  async createDraft(partnerType: PartnerType, cloneFromId: string | undefined, admin: AdminPrincipal): Promise<IncentiveRuleDto> {
    return tx(async (c) => {
      const draft = await db.scalar<string>(`SELECT id FROM ${T.incentive_rules} WHERE partner_type = $1 AND status = 'draft' LIMIT 1`, [partnerType], c);
      if (draft) throw new ConflictError('DRAFT_EXISTS', { draftId: draft });
      const src = cloneFromId
        ? await this.get(cloneFromId, c)
        : ((await this.active(partnerType, c)) ?? (await hydrate(await db.many<Row>(`${SELECT} WHERE r.partner_type = $1 ORDER BY r.version DESC LIMIT 1`, [partnerType], c), c))[0] ?? null);
      if (src && src.partnerType !== partnerType) throw new BusinessRuleError('INVALID_TRANSITION', { from: src.partnerType, to: partnerType });
      const group = (await db.scalar<string>(`SELECT rule_group FROM ${T.incentive_rules} WHERE partner_type = $1 ORDER BY version DESC LIMIT 1`, [partnerType], c)) ?? `${partnerType}_default`;
      const version = ((await db.scalar<number>(`SELECT max(version) FROM ${T.incentive_rules} WHERE rule_group = $1`, [group], c)) ?? 0) + 1;
      const tomorrow = dayjs().tz(BUSINESS_TZ).add(1, 'day').startOf('day').toDate();
      const id = await db.scalar<string>(
        `INSERT INTO ${T.incentive_rules} (rule_group, version, name_en, name_ar, partner_type, qualification_threshold, period, effective_from, status, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10) RETURNING id`,
        [group, version, src?.name.en ?? (partnerType === 'school' ? 'School incentive' : 'Marketer incentive'), src?.name.ar ?? (partnerType === 'school' ? 'حوافز المدارس' : 'حوافز المسوقين'),
          partnerType, src?.qualificationThreshold ?? 0, src?.period ?? 'monthly', tomorrow, admin.userId, admin.name],
        c,
      );
      await replaceTiers(id as string, src?.tiers ?? [], c);
      return this.get(id as string, c);
    });
  },

  async updateDraft(id: string, body: { name?: { en: string; ar: string }; qualificationThreshold?: number; period?: PeriodType; effectiveFrom?: string; effectiveTo?: string | null; tiers?: TierInput[] }): Promise<IncentiveRuleDto> {
    return tx(async (c) => {
      const cur = await this.get(id, c);
      if (cur.status !== 'draft') throw new BusinessRuleError('NOT_DRAFT', { status: cur.status });
      const map: Record<string, unknown> = {
        name_en: body.name?.en,
        name_ar: body.name?.ar,
        qualification_threshold: body.qualificationThreshold,
        period: body.period,
        effective_from: body.effectiveFrom,
        effective_to: body.effectiveTo,
      };
      const sets: string[] = [];
      const params: unknown[] = [id];
      for (const [k, v] of Object.entries(map)) {
        if (v === undefined) continue;
        params.push(v);
        sets.push(`${k} = $${params.length}`);
      }
      if (sets.length) await db.query(`UPDATE ${T.incentive_rules} SET ${sets.join(', ')} WHERE id = $1`, params, c);
      if (body.tiers) await replaceTiers(id, body.tiers, c);
      return this.get(id, c);
    });
  },

  async deleteDraft(id: string): Promise<void> {
    const cur = await this.get(id);
    if (cur.status !== 'draft') throw new BusinessRuleError('NOT_DRAFT', { status: cur.status });
    await db.query(`DELETE FROM ${T.incentive_rules} WHERE id = $1`, [id]);
  },

  /** ADM-INC-06. effectiveFrom ≤ now → active (previous superseded); future → scheduled (job switches later). */
  async activate(id: string, admin: AdminPrincipal): Promise<{ activated: IncentiveRuleDto; superseded: IncentiveRuleDto | null }> {
    return tx(async (c) => {
      const rule = await this.get(id, c);
      if (rule.status !== 'draft' && rule.status !== 'scheduled') throw new BusinessRuleError('INVALID_TRANSITION', { from: rule.status, to: 'active' });
      const issues = validateTiers(rule.qualificationThreshold, rule.tiers);
      if (issues.length) throw new BusinessRuleError('TIERS_INVALID', { issues });
      if (new Date(rule.effectiveFrom).getTime() > Date.now()) {
        await db.query(`UPDATE ${T.incentive_rules} SET status = 'superseded' WHERE partner_type = $1 AND status = 'scheduled' AND id <> $2`, [rule.partnerType, id], c);
        await db.query(`UPDATE ${T.incentive_rules} SET status = 'scheduled', activated_by = $2, activated_at = now() WHERE id = $1`, [id, admin.userId], c);
        return { activated: await this.get(id, c), superseded: null };
      }
      const superseded = await activateNow(rule, admin.userId, c);
      return { activated: await this.get(id, c), superseded };
    });
  },

  /** Job entry point (incentive-rule-activate): switch scheduled versions whose effectiveFrom has arrived. */
  async activateScheduledRules(now = new Date()): Promise<number> {
    const due = await db.many<Row>(`SELECT id FROM ${T.incentive_rules} WHERE status = 'scheduled' AND effective_from <= $1 ORDER BY effective_from`, [now]);
    for (const d of due) {
      await tx(async (c) => {
        const rule = await this.get(String(d.id), c);
        const superseded = await activateNow(rule, null, c);
        await auditService.record({ actorName: 'system', action: 'incentive_rule.activate', entity: 'incentive_rule', entityId: rule.id, summary: `Scheduled v${rule.version} (${rule.partnerType}) activated${superseded ? `; v${superseded.version} superseded` : ''}`, after: { status: 'active' } }, c);
      });
    }
    if (due.length) logger.info({ count: due.length }, 'scheduled incentive rules activated');
    return due.length;
  },

  preview(body: { qualificationThreshold: number; tiers: TierInput[]; students: number }) {
    return calcIncentive({ qualificationThreshold: body.qualificationThreshold, tiers: body.tiers.map((t, i) => ({ ...t, id: `preview-${i + 1}` })) }, body.students);
  },
};

export const activateScheduledRules = (now?: Date) => incentiveRules.activateScheduledRules(now);
