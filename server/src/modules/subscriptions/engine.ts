/**
 * Subscription engine — the ONLY writer of subscriptions + their entitlements (with entitlement_logs).
 * Every function accepts an Executor so payment webhooks / admin actions run it inside their transaction.
 */
import { T } from '../../config/constants.js';
import { db, tx, type Executor } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { entitlements } from '../../common/entitlements.js';
import { BusinessRuleError, NotFoundError } from '../../common/errors/index.js';
import { addDays, daysRemaining } from '../../common/utils/dates.js';
import { notifyStudent } from '../commerce/lib.js';
import { emailStudent, userUrl } from '../notifications/email/recipients.js';
import { cycleDays, type PriceQuote } from '../payments/pricing.js';
import { loadQuotePackage } from '../payments/quote.service.js';

export interface Actor {
  id: string | null;
  name: string;
}

interface SubRow {
  id: string;
  user_id: string;
  package_id: string;
  status: string;
  starts_at: Date;
  ends_at: Date;
  source: string;
  payment_id: string | null;
}

async function aiQuotaFor(packageId: string, ex: Executor): Promise<number> {
  const r = await db.one<{ q: number }>(
    `SELECT COALESCE(p.ai_quota, (SELECT monthly_allowance FROM ${T.ai_settings} WHERE id = 1), 0)::int AS q FROM ${T.packages} p WHERE p.id = $1`,
    [packageId],
    ex,
  );
  return r.q;
}

async function packageSubjects(packageId: string, ex: Executor): Promise<string[]> {
  return (await db.many<{ subject_id: string }>(`SELECT subject_id FROM ${T.package_subjects} WHERE package_id = $1`, [packageId], ex)).map((r) => r.subject_id);
}

async function lockSub(id: string, ex: Executor): Promise<SubRow> {
  const s = await db.maybeOne<SubRow>(`SELECT * FROM ${T.subscriptions} WHERE id = $1 FOR UPDATE`, [id], ex);
  if (!s) throw new NotFoundError('subscription');
  return s;
}

async function createSubscription(
  input: { userId: string; packageId: string; cycle: 'monthly' | 'yearly'; source: 'payment' | 'manual' | 'trial'; startsAt: Date; endsAt: Date; paymentId?: string | null; previousId?: string | null; reason: string; actor: Actor },
  ex: Executor,
): Promise<string> {
  const id = await db.scalar<string>(
    `INSERT INTO ${T.subscriptions} (user_id, package_id, billing_cycle, status, source, starts_at, ends_at, ai_quota, payment_id, previous_subscription_id, granted_by, grant_reason, auto_renew)
     VALUES ($1,$2,$3,'active',$4,$5,$6,$7,$8,$9,$10,$11,(SELECT renewal = 'auto' FROM ${T.packages} WHERE id = $2)) RETURNING id`,
    [input.userId, input.packageId, input.cycle, input.source, input.startsAt, input.endsAt, await aiQuotaFor(input.packageId, ex), input.paymentId ?? null, input.previousId ?? null,
      input.source === 'manual' ? input.actor.id : null, input.source === 'manual' ? input.reason : null],
    ex,
  );
  await entitlements.grant(
    { userId: input.userId, subjectIds: await packageSubjects(input.packageId, ex), source: 'package', subscriptionId: id, startsAt: input.startsAt, endsAt: input.endsAt, actorId: input.actor.id, actorName: input.actor.name, reason: input.reason },
    ex,
  );
  return id as string;
}

async function liveSubscription(userId: string, ex: Executor): Promise<SubRow | null> {
  return db.maybeOne<SubRow>(
    `SELECT * FROM ${T.subscriptions} WHERE user_id = $1 AND status IN ('active', 'trial') AND ends_at > now() ORDER BY ends_at DESC LIMIT 1`,
    [userId],
    ex,
  );
}

export const subscriptionEngine = {
  /**
   * Payment succeeded → subscription per the frozen quote (new | renew | upgrade | downgrade).
   * Idempotent per payment (unique subscriptions.payment_id): returns the existing subscription if any.
   */
  async activateFromPayment(p: { id: string; user_id: string; package_id: string; billing_cycle: 'monthly' | 'yearly'; quote: PriceQuote | null }, ex: Executor): Promise<string> {
    const existing = await db.scalar<string>(`SELECT id FROM ${T.subscriptions} WHERE payment_id = $1`, [p.id], ex);
    if (existing) return existing;
    const now = new Date();
    const actor: Actor = { id: null, name: 'payment' };
    const quote = p.quote;
    const durationMs = quote ? new Date(quote.endsAt).getTime() - new Date(quote.startsAt).getTime() : addDays(now, 30).getTime() - now.getTime();
    const current = await liveSubscription(p.user_id, ex);
    let intent = quote?.intent ?? 'new';
    if (!current && (intent === 'renew' || intent === 'downgrade' || intent === 'upgrade')) intent = 'new';
    let start: Date;
    if (intent === 'renew' || intent === 'downgrade') start = new Date(Math.max((current as SubRow).ends_at.getTime(), now.getTime()));
    else start = new Date(Math.max(quote ? new Date(quote.startsAt).getTime() : 0, now.getTime()));
    if (intent === 'upgrade' && current) {
      await db.query(
        `UPDATE ${T.subscriptions} SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'upgraded', ends_at = GREATEST(now(), starts_at + interval '1 second') WHERE id = $1`,
        [current.id],
        ex,
      );
      await entitlements.revoke({ userId: p.user_id, subscriptionId: current.id }, 'upgrade', { id: null, name: 'payment' }, ex);
    }
    return createSubscription(
      { userId: p.user_id, packageId: p.package_id, cycle: p.billing_cycle, source: 'payment', startsAt: start, endsAt: new Date(start.getTime() + durationMs), paymentId: p.id, previousId: current?.id ?? null, reason: `payment:${intent}`, actor },
      ex,
    );
  },

  /** ADM-SBS-02 manual grant (subscription source 'manual' + package entitlements + logs). */
  async grantManual(input: { studentId: string; packageId: string; days?: number; startsAt?: string; reason: string; actor: Actor }, ex?: Executor): Promise<string> {
    const run = async (c: Executor) => {
      const isStudent = await db.scalar<boolean>(`SELECT true FROM ${T.users} WHERE id = $1 AND kind = 'student' AND deleted_at IS NULL`, [input.studentId], c);
      if (!isStudent) throw new NotFoundError('student');
      const pkg = await db.maybeOne<{ id: string }>(`SELECT id FROM ${T.packages} WHERE id = $1 AND deleted_at IS NULL`, [input.packageId], c);
      if (!pkg) throw new NotFoundError('package');
      const qp = await loadQuotePackage(input.packageId, c).catch(() => null);
      const start = input.startsAt ? new Date(input.startsAt) : new Date();
      const days = input.days ?? (qp ? cycleDays(qp, 'monthly', start) : 30);
      if (days < 1) throw new BusinessRuleError('PACKAGE_UNAVAILABLE', { packageId: input.packageId });
      return createSubscription({ userId: input.studentId, packageId: input.packageId, cycle: 'monthly', source: 'manual', startsAt: start, endsAt: addDays(start, days), reason: input.reason, actor: input.actor }, c);
    };
    return ex ? run(ex) : tx(run);
  },

  /** ADM-SBS-03 upgrade/downgrade: package swap, entitlements re-synced. */
  async changePackage(id: string, input: { packageId: string; reason: string; keepEndDate: boolean; actor: Actor }): Promise<void> {
    await tx(async (c) => {
      const s = await lockSub(id, c);
      if (!['active', 'trial'].includes(s.status) || s.ends_at.getTime() <= Date.now()) throw new BusinessRuleError('SUBSCRIPTION_NOT_ACTIVE');
      const pkg = await db.maybeOne<{ id: string }>(`SELECT id FROM ${T.packages} WHERE id = $1 AND deleted_at IS NULL`, [input.packageId], c);
      if (!pkg) throw new NotFoundError('package');
      let ends = s.ends_at;
      if (!input.keepEndDate) {
        const qp = await loadQuotePackage(input.packageId, c);
        ends = addDays(new Date(), cycleDays(qp, 'monthly', new Date()));
      }
      await db.query(`UPDATE ${T.subscriptions} SET package_id = $2, ends_at = $3, ai_quota = $4 WHERE id = $1`, [id, input.packageId, ends, await aiQuotaFor(input.packageId, c)], c);
      const newSubjects = await packageSubjects(input.packageId, c);
      const curSubjects = (await db.many<{ subject_id: string }>(`SELECT subject_id FROM ${T.entitlements} WHERE subscription_id = $1 AND revoked_at IS NULL`, [id], c)).map((r) => r.subject_id);
      for (const subj of curSubjects.filter((x) => !newSubjects.includes(x))) {
        await entitlements.revoke({ userId: s.user_id, subscriptionId: id, subjectId: subj }, `change_package: ${input.reason}`, input.actor, c);
      }
      await entitlements.grant({ userId: s.user_id, subjectIds: newSubjects, source: 'package', subscriptionId: id, startsAt: s.starts_at, endsAt: ends, actorId: input.actor.id, actorName: input.actor.name, reason: `change_package: ${input.reason}` }, c);
    });
  },

  /** ADM-SBS-04 extend by N days (entitlements extended + 'extend' logs). */
  async extend(id: string, days: number, reason: string, actor: Actor): Promise<void> {
    await tx(async (c) => {
      const s = await lockSub(id, c);
      if (s.status === 'cancelled') throw new BusinessRuleError('SUBSCRIPTION_NOT_ACTIVE');
      const base = s.ends_at.getTime() > Date.now() ? s.ends_at : new Date();
      const ends = addDays(base, days);
      await db.query(`UPDATE ${T.subscriptions} SET ends_at = $2, status = 'active' WHERE id = $1`, [id, ends], c);
      const rows = await db.many<{ id: string; subject_id: string; starts_at: Date }>(
        `UPDATE ${T.entitlements} SET ends_at = $2 WHERE subscription_id = $1 AND revoked_at IS NULL RETURNING id, subject_id, starts_at`,
        [id, ends],
        c,
      );
      for (const r of rows) {
        await db.query(
          `INSERT INTO ${T.entitlement_logs} (user_id, entitlement_id, subject_id, action, source, days, starts_at, ends_at, reason, actor_id, actor_name)
           VALUES ($1,$2,$3,'extend','package',$4,$5,$6,$7,$8,$9)`,
          [s.user_id, r.id, r.subject_id, days, r.starts_at, ends, reason, actor.id, actor.name],
          c,
        );
      }
      entitlements.invalidate(s.user_id);
    });
  },

  /** ADM-SBS-05 cancel: immediate → access revoked now; otherwise stays until endsAt. */
  async cancel(id: string, reason: string, immediate: boolean, actor: Actor, ex?: Executor): Promise<void> {
    const run = async (c: Executor) => {
      const s = await lockSub(id, c);
      if (s.status === 'cancelled' || s.status === 'expired') throw new BusinessRuleError('SUBSCRIPTION_NOT_ACTIVE');
      await db.query(
        `UPDATE ${T.subscriptions} SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2, auto_renew = false
           ${immediate ? `, ends_at = GREATEST(now(), starts_at + interval '1 second')` : ''} WHERE id = $1`,
        [id, reason],
        c,
      );
      if (immediate) await entitlements.revoke({ userId: s.user_id, subscriptionId: id }, `cancel: ${reason}`, actor, c);
    };
    if (ex) await run(ex);
    else await tx(run);
  },

  /**
   * Job entry point (subscription-expiry): marks ended subscriptions `expired` (+ entitlement 'expire' logs),
   * sends 7/3/1-day reminders (template `expiry_wa`, once per threshold) and retires expired school code aliases.
   */
  async expireSubscriptionsAndRemind(now = new Date()): Promise<{ expired: number; reminded: number; aliasesCleared: number }> {
    const expiredRows: { id: string; user_id: string }[] = [];
    const expired = await tx(async (c) => {
      const rows = await db.many<{ id: string; user_id: string }>(
        `UPDATE ${T.subscriptions} SET status = 'expired' WHERE status IN ('active', 'trial') AND ends_at <= $1 RETURNING id, user_id`,
        [now],
        c,
      );
      for (const r of rows) {
        await db.query(
          `INSERT INTO ${T.entitlement_logs} (user_id, entitlement_id, subject_id, action, source, starts_at, ends_at, reason, actor_name)
           SELECT e.user_id, e.id, e.subject_id, 'expire', e.source, e.starts_at, e.ends_at, 'subscription expired', 'system'
             FROM ${T.entitlements} e WHERE e.subscription_id = $1 AND e.revoked_at IS NULL`,
          [r.id],
          c,
        );
        entitlements.invalidate(r.user_id);
      }
      expiredRows.push(...rows);
      return rows.length;
    });
    await emailExpired(expiredRows);

    let reminded = 0;
    for (const d of [7, 3, 1]) {
      const due = await db.many<{ id: string; user_id: string; ends_at: Date; name_en: string; name_ar: string; pkg_en: string; pkg_ar: string }>(
        `SELECT s.id, s.user_id, s.ends_at, u.name_en, u.name_ar, p.name_en AS pkg_en, p.name_ar AS pkg_ar
           FROM ${T.subscriptions} s JOIN ${T.users} u ON u.id = s.user_id JOIN ${T.packages} p ON p.id = s.package_id
          WHERE s.status = 'active' AND s.ends_at > $1 AND s.ends_at <= $1::timestamptz + make_interval(days => $2::int)
            AND NOT (s.reminders_sent @> to_jsonb($2::int))
            AND NOT EXISTS (SELECT 1 FROM ${T.subscriptions} n WHERE n.user_id = s.user_id AND n.id <> s.id AND n.status = 'active' AND n.ends_at > s.ends_at)`,
        [now, d],
      );
      for (const s of due) {
        const left = daysRemaining(s.ends_at, now);
        await notifyStudent({
          userId: s.user_id,
          type: 'subscription',
          templateType: 'subscription_expiry',
          vars: { package_name: s.pkg_en, expiry_date: s.ends_at.toISOString().slice(0, 10), days: left },
          fallback: {
            title: { en: 'Your subscription is ending soon', ar: 'اشتراكك على وشك الانتهاء' },
            body: { en: `${s.pkg_en} ends in ${left} day(s). Renew to keep learning.`, ar: `تنتهي باقة ${s.pkg_ar} خلال ${left} يوم. جدّد للمتابعة.` },
          },
          link: '/subscription',
        });
        await emailStudent(
          s.user_id,
          'subscription_expiring',
          { package: { en: s.pkg_en, ar: s.pkg_ar || s.pkg_en }, days: left, until: s.ends_at.toISOString(), link: userUrl('/student/subscription') },
          { category: 'payments', dedupeKey: `sub-expiring:${s.id}:${d}` },
        );
        await db.query(`UPDATE ${T.subscriptions} SET reminders_sent = reminders_sent || to_jsonb($2::int) WHERE id = $1`, [s.id, d]);
        reminded++;
      }
    }
    const aliasesCleared = await db.exec(
      `UPDATE ${T.schools} SET referral_code = code, code_alias_until = NULL WHERE code_alias_until IS NOT NULL AND code_alias_until <= $1`,
      [now],
    );
    if (expired || reminded) logger.info({ expired, reminded, aliasesCleared }, 'subscription expiry run');
    return { expired, reminded, aliasesCleared };
  },
};

export const expireSubscriptionsAndRemind = (now?: Date) => subscriptionEngine.expireSubscriptionsAndRemind(now);

/** "Subscription expired" email — skipped when the student already has another active subscription. */
async function emailExpired(rows: { id: string; user_id: string }[]): Promise<void> {
  for (const r of rows) {
    const s = await db.maybeOne<{ pkg_en: string; pkg_ar: string; renewed: boolean }>(
      `SELECT p.name_en AS pkg_en, p.name_ar AS pkg_ar,
              EXISTS (SELECT 1 FROM ${T.subscriptions} n WHERE n.user_id = s.user_id AND n.id <> s.id AND n.status IN ('active', 'trial') AND n.ends_at > now()) AS renewed
         FROM ${T.subscriptions} s JOIN ${T.packages} p ON p.id = s.package_id WHERE s.id = $1`,
      [r.id],
    ).catch(() => null);
    if (!s || s.renewed) continue;
    await emailStudent(r.user_id, 'subscription_expired', { package: { en: s.pkg_en, ar: s.pkg_ar || s.pkg_en }, link: userUrl('/student/subscription') }, { category: 'payments', dedupeKey: `sub-expired:${r.id}` });
  }
}

/** "Subscription active" email after a manual grant (payments send the receipt email instead). */
export async function emailSubscriptionActivated(subscriptionId: string): Promise<void> {
  const s = await db.maybeOne<{ user_id: string; ends_at: Date; pkg_en: string; pkg_ar: string }>(
    `SELECT s.user_id, s.ends_at, p.name_en AS pkg_en, p.name_ar AS pkg_ar FROM ${T.subscriptions} s JOIN ${T.packages} p ON p.id = s.package_id WHERE s.id = $1`,
    [subscriptionId],
  ).catch(() => null);
  if (!s) return;
  await emailStudent(s.user_id, 'subscription_activated', { package: { en: s.pkg_en, ar: s.pkg_ar || s.pkg_en }, until: s.ends_at.toISOString(), link: userUrl('/student/dashboard') }, { dedupeKey: `sub-activated:${subscriptionId}` });
}
