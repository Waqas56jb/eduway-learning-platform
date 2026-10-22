/** Promotions: admin CRUD / stats / codes / redemptions (ADM-PRM-*) + student validation (PAY-05). */
import { T } from '../../config/constants.js';
import { db, tx, type Executor } from '../../config/db.js';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/index.js';
import { translate } from '../../common/i18n/index.js';
import { randomCode } from '../../common/utils/crypto.js';
import { iso, L, pageOf, parseSort, sortRows, type Row } from '../commerce/lib.js';
import { checkPromotion, loadCurrentSubscription, loadQuotePackage } from '../payments/quote.service.js';
import { computeQuote, QuoteUnavailableError, type BillingCycle } from '../payments/pricing.js';
import { discountFor, promoPhase, type PromoPhase } from './engine.js';
import { PROMO_SELECT, toPromoRecord, type PromoRow } from './repository.js';
import type { PromotionListQuery, PromotionPatch, PromotionWrite } from './schemas.js';

export interface PromotionDto {
  id: string;
  code: string;
  type: PromoRow['type'];
  discountType: 'percent' | 'fixed';
  discountValue: number;
  packageIds: string[];
  packages: { id: string; name: { en: string; ar: string } }[];
  eligibility: PromoRow['eligibility'];
  usageLimit: number;
  perUserLimit: number;
  used: number;
  validFrom: string;
  validTo: string;
  enabled: boolean;
  ownerType: 'school' | 'marketer' | null;
  ownerId: string | null;
  owner: { id: string; name: { en: string; ar: string }; code?: string; avatarUrl?: string | null } | null;
  phase: PromoPhase;
  createdAt: string;
  updatedAt: string;
}

const FAR_FUTURE = '2099-12-31T23:59:59.000Z';

async function decorate(rows: PromoRow[], ex?: Executor): Promise<PromotionDto[]> {
  if (!rows.length) return [];
  const pkgIds = [...new Set(rows.flatMap((r) => r.package_ids ?? []))];
  const pkgs = pkgIds.length ? await db.many<Row>(`SELECT id, name_en, name_ar FROM ${T.packages} WHERE id = ANY($1::uuid[])`, [pkgIds], ex) : [];
  const schools = await db.many<Row>(`SELECT id, name_en, name_ar, code FROM ${T.schools} WHERE id = ANY($1::uuid[])`, [rows.map((r) => r.school_id).filter(Boolean)], ex);
  const mkts = await db.many<Row>(`SELECT id, name_en, name_ar, avatar_url FROM ${T.marketers} WHERE id = ANY($1::uuid[])`, [rows.map((r) => r.marketer_id).filter(Boolean)], ex);
  const now = new Date();
  return rows.map((r) => {
    const rec = toPromoRecord(r);
    const sch = r.school_id ? schools.find((s) => s.id === r.school_id) : null;
    const mkt = r.marketer_id ? mkts.find((m) => m.id === r.marketer_id) : null;
    return {
      id: r.id,
      code: r.code,
      type: r.type,
      discountType: r.discount_type,
      discountValue: r.discount_value,
      packageIds: r.package_ids ?? [],
      packages: (r.package_ids ?? []).map((id) => pkgs.find((p) => p.id === id)).filter((p): p is Row => !!p).map((p) => ({ id: String(p.id), name: L(p, 'name') })),
      eligibility: r.eligibility,
      usageLimit: r.usage_limit ?? 0,
      perUserLimit: r.per_user_limit,
      used: r.used_count,
      validFrom: iso(r.valid_from),
      validTo: r.valid_to ? iso(r.valid_to) : FAR_FUTURE,
      enabled: r.enabled,
      ownerType: rec.ownerType,
      ownerId: rec.ownerId,
      owner: sch ? { id: String(sch.id), name: L(sch, 'name'), code: String(sch.code) } : mkt ? { id: String(mkt.id), name: L(mkt, 'name'), avatarUrl: (mkt.avatar_url as string | null) ?? null } : null,
      phase: promoPhase(rec, now),
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    };
  });
}

async function assertOwner(ownerType: 'school' | 'marketer' | null | undefined, ownerId: string | null | undefined, ex: Executor) {
  if (!ownerType) {
    if (ownerId) throw new ValidationError([{ path: 'ownerId', message: 'ownerId requires ownerType' }]);
    return;
  }
  if (!ownerId) throw new ValidationError([{ path: 'ownerId', message: 'ownerId is required for ownerType' }]);
  const table = ownerType === 'school' ? T.schools : T.marketers;
  const ok = await db.scalar<boolean>(`SELECT true FROM ${table} WHERE id = $1 AND deleted_at IS NULL`, [ownerId], ex);
  if (!ok) throw new NotFoundError(ownerType);
}

async function replacePackages(id: string, packageIds: string[], ex: Executor) {
  await db.query(`DELETE FROM ${T.promotion_packages} WHERE promotion_id = $1`, [id], ex);
  if (packageIds.length) {
    await db.query(
      `INSERT INTO ${T.promotion_packages} (promotion_id, package_id) SELECT $1, p.id FROM ${T.packages} p WHERE p.id = ANY($2::uuid[]) ON CONFLICT DO NOTHING`,
      [id, packageIds],
      ex,
    );
  }
}

async function codeAvailable(code: string, excludeId?: string, ex?: Executor): Promise<boolean> {
  const taken = await db.scalar<boolean>(
    `SELECT true FROM ${T.promotions} WHERE upper(code) = upper($1) AND deleted_at IS NULL AND ($2::uuid IS NULL OR id <> $2::uuid) LIMIT 1`,
    [code, excludeId ?? null],
    ex,
  );
  return !taken;
}

export const promotionsService = {
  async all(): Promise<PromotionDto[]> {
    return decorate(await db.many<PromoRow>(`${PROMO_SELECT} WHERE pr.deleted_at IS NULL ORDER BY pr.valid_from DESC`));
  },

  async list(q: Partial<PromotionListQuery>): Promise<PromotionDto[]> {
    let rows = await this.all();
    if (q.type) rows = rows.filter((r) => r.type === q.type);
    if (q.phase) rows = rows.filter((r) => r.phase === q.phase);
    if (q.packageId) rows = rows.filter((r) => r.packageIds.length === 0 || r.packageIds.includes(q.packageId as string));
    if (q.q) {
      const words = q.q.toLowerCase().split(/\s+/).filter(Boolean);
      rows = rows.filter((r) => words.every((w) => `${r.code} ${r.type} ${r.owner?.name.en ?? ''} ${r.owner?.name.ar ?? ''}`.toLowerCase().includes(w)));
    }
    const sort = parseSort(q.sort, ['code', 'discountValue', 'used', 'validFrom', 'validTo', 'type', 'phase', 'usageLimit', 'createdAt'], '-validFrom');
    return sortRows(rows, sort, (r, k) => (r as unknown as Record<string, unknown>)[k]);
  },

  async page(q: PromotionListQuery) {
    return pageOf(await this.list(q), q.page, q.pageSize);
  },

  async stats() {
    const rows = await this.all();
    const live = rows.filter((r) => r.phase === 'live');
    return {
      live: live.length,
      total: rows.length,
      redemptions: rows.reduce((s, r) => s + r.used, 0),
      nearLimit: live.filter((r) => r.usageLimit > 0 && r.used / r.usageLimit >= 0.8).length,
    };
  },

  async get(id: string, ex?: Executor): Promise<PromotionDto> {
    const r = await db.maybeOne<PromoRow>(`${PROMO_SELECT} WHERE pr.id = $1 AND pr.deleted_at IS NULL`, [id], ex);
    if (!r) throw new NotFoundError('promotion');
    return (await decorate([r], ex))[0] as PromotionDto;
  },

  async create(body: PromotionWrite, actorId: string): Promise<PromotionDto> {
    return tx(async (c) => {
      const code = body.code.toUpperCase();
      if (!(await codeAvailable(code, undefined, c))) throw new ConflictError('ALREADY_EXISTS', { field: 'code' });
      await assertOwner(body.ownerType, body.ownerId, c);
      const id = await db.scalar<string>(
        `INSERT INTO ${T.promotions} (code, type, discount_type, discount_value, eligibility, usage_limit, per_user_limit, valid_from, valid_to, enabled, school_id, marketer_id, description, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [code, body.type, body.discountType, body.discountValue, body.eligibility, body.usageLimit || null, body.perUserLimit, body.validFrom, body.validTo, body.enabled,
          body.ownerType === 'school' ? body.ownerId : null, body.ownerType === 'marketer' ? body.ownerId : null,
          `${code} — ${body.discountType === 'percent' ? `${body.discountValue}%` : `${body.discountValue} IQD`} off`, actorId],
        c,
      );
      await replacePackages(id as string, body.packageIds, c);
      return this.get(id as string, c);
    });
  },

  async update(id: string, body: PromotionPatch): Promise<PromotionDto> {
    return tx(async (c) => {
      const cur = await this.get(id, c);
      const next = { ...cur, ...body };
      if (next.discountType === 'percent' && next.discountValue > 100) throw new ValidationError([{ path: 'discountValue', message: 'percent ≤ 100' }]);
      if (new Date(next.validTo).getTime() < new Date(next.validFrom).getTime()) throw new ValidationError([{ path: 'validTo', message: 'validTo must be ≥ validFrom' }]);
      if (body.code && !(await codeAvailable(body.code, id, c))) throw new ConflictError('ALREADY_EXISTS', { field: 'code' });
      if (body.ownerType !== undefined || body.ownerId !== undefined) await assertOwner(next.ownerType, next.ownerId, c);
      const map: Record<string, unknown> = {
        code: body.code?.toUpperCase(),
        type: body.type,
        discount_type: body.discountType,
        discount_value: body.discountValue,
        eligibility: body.eligibility,
        usage_limit: body.usageLimit === undefined ? undefined : body.usageLimit || null,
        per_user_limit: body.perUserLimit,
        valid_from: body.validFrom,
        valid_to: body.validTo,
        enabled: body.enabled,
        school_id: body.ownerType !== undefined || body.ownerId !== undefined ? (next.ownerType === 'school' ? next.ownerId : null) : undefined,
        marketer_id: body.ownerType !== undefined || body.ownerId !== undefined ? (next.ownerType === 'marketer' ? next.ownerId : null) : undefined,
      };
      const sets: string[] = [];
      const params: unknown[] = [id];
      for (const [k, v] of Object.entries(map)) {
        if (v === undefined) continue;
        params.push(v);
        sets.push(`${k} = $${params.length}`);
      }
      if (sets.length) await db.query(`UPDATE ${T.promotions} SET ${sets.join(', ')} WHERE id = $1`, params, c);
      if (body.packageIds) await replacePackages(id, body.packageIds, c);
      return this.get(id, c);
    });
  },

  /** Soft delete when redeemed (history kept), else hard delete. */
  async remove(id: string): Promise<'soft' | 'hard'> {
    await this.get(id);
    const n = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.promotion_redemptions} WHERE promotion_id = $1`, [id])) ?? 0;
    const paid = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.payments} WHERE promotion_id = $1`, [id])) ?? 0;
    if (n > 0 || paid > 0) {
      await db.query(`UPDATE ${T.promotions} SET deleted_at = now(), enabled = false WHERE id = $1`, [id]);
      return 'soft';
    }
    await db.query(`DELETE FROM ${T.promotions} WHERE id = $1`, [id]);
    return 'hard';
  },

  checkCode: async (code: string, excludeId?: string) => ({ available: await codeAvailable(code, excludeId) }),

  async generateCode(prefix = 'EDU-'): Promise<{ code: string }> {
    const clean = prefix.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10);
    for (let i = 0; i < 20; i++) {
      const code = `${clean}${randomCode(Math.max(4, Math.min(8, 12 - clean.length)))}`.slice(0, 20);
      if (await codeAvailable(code)) return { code };
    }
    return { code: `${clean}${randomCode(8)}`.slice(0, 20) };
  },

  async redemptionRows(id: string, sortKey?: string) {
    await this.get(id);
    const sort = parseSort(sortKey, ['at', 'discount', 'ref', 'student'], '-at');
    const col = { at: 'r.created_at', discount: 'r.discount_amount', ref: 'p.ref', student: 'u.name_en' }[sort.key];
    const rows = await db.many<Row>(
      `SELECT r.id, r.payment_id, r.discount_amount, r.created_at, r.status, p.ref,
              u.id AS u_id, u.name_en AS u_name_en, u.name_ar AS u_name_ar, u.phone AS u_phone, u.avatar_url AS u_avatar_url
         FROM ${T.promotion_redemptions} r
         JOIN ${T.users} u ON u.id = r.user_id
         LEFT JOIN ${T.payments} p ON p.id = r.payment_id
        WHERE r.promotion_id = $1 AND r.status = 'redeemed'
        ORDER BY ${col} ${sort.desc ? 'DESC' : 'ASC'} NULLS LAST, r.id`,
      [id],
    );
    return rows.map((r) => ({
      id: String(r.id),
      student: { id: String(r.u_id), name: L(r, 'u_name'), mobile: String(r.u_phone ?? ''), avatarUrl: (r.u_avatar_url as string | null) ?? null },
      paymentId: (r.payment_id as string | null) ?? '',
      ref: String(r.ref ?? ''),
      discount: Number(r.discount_amount),
      at: iso(r.created_at),
    }));
  },

  /** PAY-05 — 200 with valid:false for invalid codes (localized reason message). */
  async validate(userId: string, body: { code: string; packageId: string; cycle: BillingCycle }, locale: 'en' | 'ar') {
    const code = body.code.trim().toUpperCase();
    const chk = await checkPromotion(code, userId, body.packageId);
    const pkg = await loadQuotePackage(body.packageId);
    const subtotal = body.cycle === 'yearly' ? (pkg.yearlyPrice ?? 0) : pkg.price;
    if (chk.reason || !chk.promo) {
      const reason = chk.reason ?? 'PROMO_INVALID';
      return { valid: false, reason, message: translate('BUSINESS_RULE', locale, undefined, reason), code, type: chk.promo?.discountType ?? 'percent', value: chk.promo?.discountValue ?? 0, discountAmount: 0, total: subtotal, quote: null };
    }
    let quote = null;
    try {
      quote = computeQuote({ pkg, cycle: body.cycle, current: await loadCurrentSubscription(userId), promo: chk.promo });
    } catch (e) {
      if (!(e instanceof QuoteUnavailableError)) throw e;
    }
    const discountAmount = quote?.discount ?? discountFor(chk.promo, subtotal);
    return { valid: true, reason: null, message: null, code, type: chk.promo.discountType, value: chk.promo.discountValue, discountAmount, total: quote?.total ?? Math.max(0, subtotal - discountAmount), quote };
  },
};
