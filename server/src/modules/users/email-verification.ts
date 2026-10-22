/**
 * Student email confirmation (ME-12 / AUTH-30). A student's email only receives receipts, subscription and support
 * emails after it is confirmed. Tokens: 32 random bytes, stored hashed, single use, 24 h, one live token per user
 * (requesting a new link retires the previous one), bound to the address they were issued for.
 */
import { T } from '../../config/constants.js';
import { db, tx } from '../../config/db.js';
import { env } from '../../config/env.js';
import { BusinessRuleError } from '../../common/errors/index.js';
import { hashToken, randomToken } from '../../common/utils/crypto.js';
import { queueEmail } from '../notifications/email/send.js';

export const EMAIL_VERIFICATION_HOURS = 24;

/** Issue a confirmation link for the student's current email and queue the email (never waits for SMTP). */
export async function requestEmailVerification(userId: string, ip: string | null = null): Promise<{ sent: boolean; email: string | null; alreadyVerified: boolean }> {
  const u = await db.maybeOne<{ email: string | null; verified: boolean; locale: string; name_en: string; name_ar: string }>(
    `SELECT email, email_verified_at IS NOT NULL AS verified, locale, name_en, name_ar FROM ${T.users} WHERE id = $1 AND kind = 'student' AND deleted_at IS NULL`,
    [userId],
  );
  if (!u?.email) throw new BusinessRuleError('EMAIL_MISSING');
  if (u.verified) return { sent: false, email: u.email, alreadyVerified: true };
  const recent = await db.scalar<number>(
    `SELECT count(*)::int FROM ${T.email_verifications} WHERE user_id = $1 AND created_at > now() - interval '1 hour'`,
    [userId],
  );
  if ((recent ?? 0) >= 5) throw new BusinessRuleError('EMAIL_VERIFICATION_LIMIT');
  const token = randomToken(32);
  await tx(async (c) => {
    await db.query(`UPDATE ${T.email_verifications} SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId], c);
    await db.query(
      `INSERT INTO ${T.email_verifications} (user_id, email, token_hash, expires_at, ip) VALUES ($1, $2, $3, now() + make_interval(hours => $4), $5)`,
      [userId, u.email!.toLowerCase(), hashToken(token, 'email-verify'), EMAIL_VERIFICATION_HOURS, ip],
      c,
    );
  });
  const link = `${env.USER_APP_URL.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
  const id = await queueEmail({
    to: u.email,
    template: 'email_verification',
    vars: { name: { en: u.name_en, ar: u.name_ar || u.name_en }, link, hours: EMAIL_VERIFICATION_HOURS },
    lang: u.locale === 'en' ? 'en' : 'ar',
    userId,
  });
  return { sent: !!id, email: u.email, alreadyVerified: false };
}

/** Confirm an email with a link token. Single use; the account's email must still be the one the link was sent to. */
export async function confirmEmail(token: string): Promise<{ verified: true; email: string }> {
  const row = await db.maybeOne<{ id: string; user_id: string; email: string }>(
    `UPDATE ${T.email_verifications} v SET used_at = now()
       FROM ${T.users} u
      WHERE v.token_hash = $1 AND v.used_at IS NULL AND v.expires_at > now()
        AND u.id = v.user_id AND u.deleted_at IS NULL AND lower(coalesce(u.email, '')) = v.email
      RETURNING v.id, v.user_id, v.email`,
    [hashToken(token, 'email-verify')],
  );
  if (!row) throw new BusinessRuleError('EMAIL_TOKEN_INVALID');
  await db.query(`UPDATE ${T.users} SET email_verified_at = now() WHERE id = $1 AND email_verified_at IS NULL`, [row.user_id]);
  return { verified: true, email: row.email };
}

/** Email changed (profile / registration / admin edit): mark unconfirmed and send a new link. Never throws. */
export async function onStudentEmailChanged(userId: string, ip: string | null = null): Promise<void> {
  try {
    await db.query(`UPDATE ${T.users} SET email_verified_at = NULL WHERE id = $1`, [userId]);
    await db.query(`UPDATE ${T.email_verifications} SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
    const u = await db.scalar<string>(`SELECT email FROM ${T.users} WHERE id = $1`, [userId]);
    if (u) await requestEmailVerification(userId, ip);
  } catch {
    /* the student can request a new link from the profile */
  }
}
