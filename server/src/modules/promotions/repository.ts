import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import type { PromoRecord } from './engine.js';

export interface PromoRow {
  id: string;
  code: string;
  type: PromoRecord['type'];
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  eligibility: PromoRecord['eligibility'];
  usage_limit: number | null;
  per_user_limit: number;
  used_count: number;
  valid_from: Date;
  valid_to: Date | null;
  enabled: boolean;
  school_id: string | null;
  marketer_id: string | null;
  description: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  package_ids: string[];
}

export const PROMO_SELECT = `
  SELECT pr.*, COALESCE((SELECT array_agg(pp.package_id) FROM ${T.promotion_packages} pp WHERE pp.promotion_id = pr.id), '{}') AS package_ids
    FROM ${T.promotions} pr`;

export function toPromoRecord(r: PromoRow): PromoRecord {
  return {
    id: r.id,
    code: r.code,
    type: r.type,
    discountType: r.discount_type,
    discountValue: r.discount_value,
    packageIds: r.package_ids ?? [],
    eligibility: r.eligibility,
    usageLimit: r.usage_limit,
    perUserLimit: r.per_user_limit,
    used: r.used_count,
    validFrom: r.valid_from,
    validTo: r.valid_to,
    enabled: r.enabled,
    ownerType: r.school_id ? 'school' : r.marketer_id ? 'marketer' : null,
    ownerId: r.school_id ?? r.marketer_id ?? null,
    deleted: !!r.deleted_at,
  };
}

export const promotionsRepo = {
  byCode(code: string, ex?: Executor) {
    return db.maybeOne<PromoRow>(`${PROMO_SELECT} WHERE upper(pr.code) = upper($1) AND pr.deleted_at IS NULL`, [code.trim()], ex);
  },
  byId(id: string, ex?: Executor) {
    return db.maybeOne<PromoRow>(`${PROMO_SELECT} WHERE pr.id = $1 AND pr.deleted_at IS NULL`, [id], ex);
  },
  /** Student context for eligibility / per-user limits. */
  async studentContext(userId: string, promotionId: string | null, ex?: Executor) {
    return db.one<{ redemptions: number; paid_before: boolean; school_id: string | null }>(
      `SELECT (SELECT count(*)::int FROM ${T.promotion_redemptions} r LEFT JOIN ${T.payments} p ON p.id = r.payment_id
                WHERE r.promotion_id = $2 AND r.user_id = $1
                  AND (r.status = 'redeemed' OR (r.status = 'reserved' AND p.status IN ('initiated', 'pending') AND (p.expires_at IS NULL OR p.expires_at > now())))) AS redemptions,
              EXISTS (SELECT 1 FROM ${T.payments} WHERE user_id = $1 AND status IN ('paid', 'partially_refunded', 'refunded')) AS paid_before,
              (SELECT school_id FROM ${T.student_profiles} WHERE user_id = $1) AS school_id`,
      [userId, promotionId],
      ex,
    );
  },
};
