/**
 * Referral / school / marketer code resolution (PUB-04 rules, used by registration and admin attribution).
 * Order: school `code` (or school referral code) → marketer `code` (or referral code) → promotion code of type
 * referral|campaign (enabled, inside its validity window).
 */
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import type { Localized } from '../i18n/index.js';

export const REFERRAL_CODE_RE = /^[A-Za-z0-9-]{4,20}$/;

export interface ResolvedReferral {
  kind: 'school' | 'marketer' | 'referral' | 'campaign';
  label: Localized;
  code: string;
  schoolId: string | null;
  marketerId: string | null;
  promotionId: string | null;
}

export async function resolveReferralCode(raw: string, ex?: Executor): Promise<ResolvedReferral | null> {
  const code = raw.trim().toUpperCase();
  if (!REFERRAL_CODE_RE.test(code)) return null;

  const school = await db.maybeOne<{ id: string; name_en: string; name_ar: string; marketer_id: string | null }>(
    `SELECT s.id, s.name_en, s.name_ar, ms.marketer_id FROM ${T.schools} s
       LEFT JOIN ${T.marketer_schools} ms ON ms.school_id = s.id AND ms.unassigned_at IS NULL
      WHERE (upper(s.code) = $1 OR upper(s.referral_code) = $1) AND s.status = 'active' AND s.deleted_at IS NULL LIMIT 1`,
    [code],
    ex,
  );
  if (school) return { kind: 'school', label: { en: school.name_en, ar: school.name_ar }, code, schoolId: school.id, marketerId: school.marketer_id, promotionId: null };

  const marketer = await db.maybeOne<{ id: string; name_en: string; name_ar: string }>(
    `SELECT id, name_en, name_ar FROM ${T.marketers} WHERE (upper(code) = $1 OR upper(referral_code) = $1) AND status = 'active' AND deleted_at IS NULL LIMIT 1`,
    [code],
    ex,
  );
  if (marketer) return { kind: 'marketer', label: { en: marketer.name_en, ar: marketer.name_ar }, code, schoolId: null, marketerId: marketer.id, promotionId: null };

  const promo = await db.maybeOne<{ id: string; type: 'referral' | 'campaign'; description: string; school_id: string | null; marketer_id: string | null }>(
    `SELECT id, type, description, school_id, marketer_id FROM ${T.promotions}
      WHERE upper(code) = $1 AND type IN ('referral', 'campaign') AND enabled AND deleted_at IS NULL
        AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now()) LIMIT 1`,
    [code],
    ex,
  );
  if (promo) return { kind: promo.type, label: { en: promo.description || code, ar: promo.description || code }, code, schoolId: promo.school_id, marketerId: promo.marketer_id, promotionId: promo.id };
  return null;
}
