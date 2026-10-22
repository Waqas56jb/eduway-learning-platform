/**
 * Campaign audience builder (ADM-CMP-03/04). `buildAudienceQuery()` is pure: it turns `CampaignFilters` into one
 * parameterized SELECT (tables via T.*, every user value bound as $n) returning one row per matching student with
 * the reason it is excluded (or NULL when reachable). Exclusions are evaluated in priority order so they sum up:
 *   locked → optedOut (channel switch or the template's category switch) → noEmail (email) / noPushToken (push).
 * Platform targeting (`platforms`): web/ios/android — a student matches when registered on, signed in from or holding
 * a push token for one of the platforms; push deliveries only go to tokens of the targeted app platforms.
 */
import { T } from '../../config/constants.js';
import { categoryForType, type NotifChannel } from './templates.js';

export type Platform = 'web' | 'ios' | 'android';
export type SubscriptionStatus = 'active' | 'expired' | 'trial' | 'none' | 'cancelled';

export interface CampaignFilters {
  packageId?: string | null;
  subjectId?: string | null;
  governorateId?: string | null;
  schoolId?: string | null;
  inactiveDays?: number | null;
  platforms?: Platform[] | null;
  subscriptionStatus?: SubscriptionStatus | null;
}

/** Channel default when the student never touched the switch (mirrors users DEFAULT_NOTIFICATION_PREFS). */
export const CHANNEL_PREF_DEFAULT: Record<Exclude<NotifChannel, 'in_app'>, boolean> = { push: true, sms: true, whatsapp: false, email: false };

export interface AudienceQuery {
  sql: string;
  params: unknown[];
}

export function buildAudienceQuery(filters: CampaignFilters, channel: NotifChannel, templateType?: string | null): AudienceQuery {
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where: string[] = [`u.kind = 'student'`, 'u.deleted_at IS NULL'];

  if (filters.packageId === '__none') where.push(`(cs.status IS NULL OR cs.status NOT IN ('active', 'trial'))`);
  else if (filters.packageId) where.push(`(cs.package_id = ${p(filters.packageId)}::uuid AND cs.status IN ('active', 'trial'))`);

  if (filters.subjectId) {
    where.push(
      `EXISTS (SELECT 1 FROM ${T.entitlements} e WHERE e.user_id = u.id AND e.subject_id = ${p(filters.subjectId)}::uuid
                 AND e.revoked_at IS NULL AND e.starts_at <= now() AND e.ends_at > now())`,
    );
  }
  if (filters.governorateId) where.push(`EXISTS (SELECT 1 FROM ${T.governorates} g WHERE g.id = sp.governorate_id AND (g.code = ${p(filters.governorateId)} OR g.id::text = $${params.length}))`);
  if (filters.schoolId === '__none') where.push('sp.school_id IS NULL');
  else if (filters.schoolId) where.push(`sp.school_id = ${p(filters.schoolId)}::uuid`);
  if (filters.inactiveDays) where.push(`(u.last_active_at IS NULL OR u.last_active_at < now() - make_interval(days => ${p(Math.floor(filters.inactiveDays))}))`);
  if (filters.subscriptionStatus) where.push(`coalesce(cs.status, 'none') = ${p(filters.subscriptionStatus)}`);

  const platforms = filters.platforms?.length ? [...new Set(filters.platforms)] : null;
  if (platforms) {
    const ph = p(platforms);
    where.push(
      `(sp.registered_platform::text = ANY(${ph}::text[])
        OR EXISTS (SELECT 1 FROM ${T.sessions} s WHERE s.user_id = u.id AND s.platform::text = ANY(${ph}::text[]))
        OR EXISTS (SELECT 1 FROM ${T.push_tokens} t WHERE t.user_id = u.id AND t.revoked_at IS NULL AND t.platform::text = ANY(${ph}::text[])))`,
    );
  }

  // Push only reaches app tokens of the targeted platforms (web has no push).
  const pushPlatforms = (platforms ?? ['ios', 'android']).filter((x) => x !== 'web');
  const pushPh = channel === 'push' ? p(pushPlatforms.length ? pushPlatforms : ['__none__']) : '';

  const optOut: string[] = [];
  if (channel !== 'in_app') optOut.push(`coalesce((u.notification_prefs->>${p(channel)})::boolean, ${CHANNEL_PREF_DEFAULT[channel] ? 'true' : 'false'}) = false`);
  const category = templateType ? categoryForType(templateType) : null;
  if (category) optOut.push(`coalesce((u.notification_prefs->>${p(category)})::boolean, true) = false`);

  const sql = `
    SELECT u.id AS user_id, u.name_en, u.name_ar, u.locale, u.email, u.phone,
           CASE
             WHEN u.status <> 'active' THEN 'locked'
             ${optOut.length ? `WHEN ${optOut.join(' OR ')} THEN 'optedOut'` : ''}
             ${channel === 'email' ? `WHEN u.email IS NULL OR u.email = '' OR u.email_verified_at IS NULL THEN 'noEmail'` : ''}
             ${channel === 'push' ? `WHEN NOT EXISTS (SELECT 1 FROM ${T.push_tokens} t WHERE t.user_id = u.id AND t.revoked_at IS NULL AND t.platform::text = ANY(${pushPh}::text[])) THEN 'noPushToken'` : ''}
             ${channel === 'sms' || channel === 'whatsapp' ? `WHEN u.phone IS NULL THEN 'optedOut'` : ''}
             ELSE NULL
           END AS excluded
      FROM ${T.users} u
      LEFT JOIN ${T.student_profiles} sp ON sp.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT CASE WHEN s.status IN ('active', 'trial') AND s.ends_at <= now() THEN 'expired' ELSE s.status END AS status, s.package_id
          FROM ${T.subscriptions} s
         WHERE s.user_id = u.id AND s.status <> 'pending'
         ORDER BY (s.status IN ('active', 'trial') AND s.ends_at > now()) DESC, s.ends_at DESC
         LIMIT 1) cs ON true
     WHERE ${where.join('\n       AND ')}`;
  return { sql, params };
}

/** Wraps the audience query into the ADM-CMP-03 counts. */
export function buildAudienceCountQuery(filters: CampaignFilters, channel: NotifChannel, templateType?: string | null): AudienceQuery {
  const a = buildAudienceQuery(filters, channel, templateType);
  return {
    sql: `SELECT count(*)::int AS matched,
                 count(*) FILTER (WHERE excluded IS NULL)::int AS reachable,
                 count(*) FILTER (WHERE excluded = 'noEmail')::int AS no_email,
                 count(*) FILTER (WHERE excluded = 'noPushToken')::int AS no_push,
                 count(*) FILTER (WHERE excluded = 'optedOut')::int AS opted_out,
                 count(*) FILTER (WHERE excluded = 'locked')::int AS locked,
                 (SELECT count(*)::int FROM ${T.users} WHERE kind = 'student' AND deleted_at IS NULL) AS total
            FROM (${a.sql}) aud`,
    params: a.params,
  };
}
