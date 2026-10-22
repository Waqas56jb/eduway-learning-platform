import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';

/** Base SELECT for AdminStudentRow (latest subscription via LATERAL). */
export const STUDENT_SELECT = `
  SELECT u.id, u.name_en, u.name_ar, u.phone, u.email, u.avatar_url, u.status, u.locked_reason, u.last_active_at, u.created_at,
         sp.gender, sp.school_name, sp.source, sp.referral_code, sp.ai_disabled,
         g.code AS gov_code, g.name_en AS gov_name_en, g.name_ar AS gov_name_ar,
         sc.id AS sch_id, sc.name_en AS sch_name_en, sc.name_ar AS sch_name_ar, sc.code AS sch_code,
         m.id AS mkt_id, m.name_en AS mkt_name_en, m.name_ar AS mkt_name_ar, m.avatar_url AS mkt_avatar_url,
         sub.package_id AS pkg_id, p.name_en AS pkg_name_en, p.name_ar AS pkg_name_ar,
         COALESCE(sub.sub_status, 'none') AS sub_status, sub.ends_at AS sub_ends_at,
         COALESCE((SELECT array_agg(DISTINCT s.platform::text) FROM ${T.sessions} s
                    WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now() AND s.platform <> 'admin'), '{}') AS platforms
    FROM ${T.users} u
    LEFT JOIN ${T.student_profiles} sp ON sp.user_id = u.id
    LEFT JOIN ${T.governorates} g ON g.id = sp.governorate_id
    LEFT JOIN ${T.schools} sc ON sc.id = sp.school_id
    LEFT JOIN ${T.marketers} m ON m.id = sp.marketer_id
    LEFT JOIN LATERAL (
      SELECT x.package_id, x.ends_at,
             CASE WHEN x.status IN ('active', 'trial') AND x.ends_at <= now() THEN 'expired' ELSE x.status END AS sub_status
        FROM ${T.subscriptions} x
       WHERE x.user_id = u.id AND x.status <> 'pending'
       ORDER BY (x.status IN ('active', 'trial') AND x.ends_at > now()) DESC, x.ends_at DESC
       LIMIT 1
    ) sub ON true
    LEFT JOIN ${T.packages} p ON p.id = sub.package_id
   WHERE u.kind = 'student' AND u.deleted_at IS NULL`;

export interface StudentListRow {
  id: string;
  name_en: string;
  name_ar: string;
  phone: string;
  email: string | null;
  avatar_url: string | null;
  status: string;
  locked_reason: string | null;
  last_active_at: Date | null;
  created_at: Date;
  gender: 'male' | 'female' | null;
  school_name: string | null;
  source: string | null;
  referral_code: string | null;
  ai_disabled: boolean | null;
  gov_code: string | null;
  gov_name_en: string | null;
  gov_name_ar: string | null;
  sch_id: string | null;
  sch_name_en: string | null;
  sch_name_ar: string | null;
  sch_code: string | null;
  mkt_id: string | null;
  mkt_name_en: string | null;
  mkt_name_ar: string | null;
  mkt_avatar_url: string | null;
  pkg_id: string | null;
  pkg_name_en: string | null;
  pkg_name_ar: string | null;
  sub_status: string;
  sub_ends_at: Date | null;
  platforms: string[];
}

export interface StudentFilter {
  q?: string;
  status?: string;
  packageId?: string;
  governorateId?: string;
  schoolId?: string;
  marketerId?: string;
  source?: string;
  platform?: string;
  createdFrom?: string;
  createdTo?: string;
  lastActiveBefore?: string;
  ids?: string[];
}

export function buildStudentWhere(f: StudentFilter): { sql: string; params: unknown[] } {
  const w: string[] = [];
  const p: unknown[] = [];
  const add = (cond: (n: string) => string, v: unknown) => {
    p.push(v);
    w.push(cond(`$${p.length}`));
  };
  if (f.q) {
    for (const word of f.q.trim().toLowerCase().split(/\s+/).slice(0, 5)) {
      add((n) => `(lower(u.name_en) LIKE ${n} OR u.name_ar LIKE ${n} OR u.phone LIKE ${n} OR lower(coalesce(u.email,'')) LIKE ${n} OR lower(coalesce(sp.referral_code,'')) LIKE ${n} OR u.id::text = trim(both '%' from ${n}))`, `%${word.replace(/^0/, '')}%`);
    }
  }
  if (f.status === 'locked') w.push(`u.status = 'locked'`);
  else if (f.status) add((n) => `COALESCE(sub.sub_status, 'none') = ${n}`, f.status);
  if (f.packageId === '__none') w.push('sub.package_id IS NULL');
  else if (f.packageId) add((n) => `sub.package_id = ${n}::uuid`, f.packageId);
  if (f.governorateId) add((n) => `g.code = ${n}`, f.governorateId);
  if (f.schoolId === '__none') w.push('sp.school_id IS NULL');
  else if (f.schoolId) add((n) => `sp.school_id = ${n}::uuid`, f.schoolId);
  if (f.marketerId === '__none') w.push('sp.marketer_id IS NULL');
  else if (f.marketerId) add((n) => `sp.marketer_id = ${n}::uuid`, f.marketerId);
  if (f.source) add((n) => `sp.source = ${n}`, f.source);
  if (f.platform) add((n) => `EXISTS (SELECT 1 FROM ${T.sessions} s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now() AND s.platform::text = ${n})`, f.platform);
  if (f.createdFrom) add((n) => `u.created_at >= ${n}::timestamptz`, f.createdFrom);
  if (f.createdTo) add((n) => `u.created_at <= ${n}::timestamptz`, f.createdTo);
  if (f.lastActiveBefore) add((n) => `(u.last_active_at IS NULL OR u.last_active_at < ${n}::timestamptz)`, f.lastActiveBefore);
  if (f.ids?.length) add((n) => `u.id = ANY(${n}::uuid[])`, f.ids);
  return { sql: w.length ? ` AND ${w.join(' AND ')}` : '', params: p };
}

export const studentsRepo = {
  async list(f: StudentFilter, order: string, limit: number, offset: number) {
    const { sql, params } = buildStudentWhere(f);
    const base = `${STUDENT_SELECT}${sql}`;
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM (${base}) x`, params)) ?? 0;
    const rows = await db.many<StudentListRow>(`${base} ORDER BY ${order}, u.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    return { rows, total };
  },
  get(id: string, ex?: Executor) {
    return db.maybeOne<StudentListRow>(`${STUDENT_SELECT} AND u.id = $1`, [id], ex);
  },
  stats() {
    return db.one<Record<string, number>>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE sub_status = 'active')::int AS active,
              count(*) FILTER (WHERE sub_status = 'trial')::int AS trial,
              count(*) FILTER (WHERE sub_status = 'expired')::int AS expired,
              count(*) FILTER (WHERE sub_status = 'cancelled')::int AS cancelled,
              count(*) FILTER (WHERE sub_status = 'none')::int AS none,
              count(*) FILTER (WHERE status = 'locked')::int AS locked,
              count(*) FILTER (WHERE 'web' = ANY(platforms))::int AS web,
              count(*) FILTER (WHERE 'ios' = ANY(platforms))::int AS ios,
              count(*) FILTER (WHERE 'android' = ANY(platforms))::int AS android
         FROM (${STUDENT_SELECT}) x`,
    );
  },
  setLocked(id: string, locked: boolean, reason: string | null, ex?: Executor) {
    return db.exec(
      `UPDATE ${T.users} SET status = $2, locked_at = CASE WHEN $2 = 'locked' THEN now() ELSE NULL END, locked_reason = $3
        WHERE id = $1 AND kind = 'student'`,
      [id, locked ? 'locked' : 'active', locked ? reason : null],
      ex,
    );
  },
  metrics(id: string) {
    return db.one<{ progress: number; avg_score: number; ltv: number; tx_count: number; notes: number }>(
      `SELECT
         COALESCE((SELECT round(100.0 * count(*) / NULLIF((SELECT count(*) FROM ${T.lessons} WHERE status = 'published' AND deleted_at IS NULL), 0))
                     FROM ${T.lesson_completions} WHERE user_id = $1), 0)::int AS progress,
         COALESCE((SELECT round(avg(score)) FROM (
                     SELECT score FROM ${T.quiz_attempts} WHERE user_id = $1 AND score IS NOT NULL
                     UNION ALL SELECT score FROM ${T.exam_attempts} WHERE user_id = $1 AND score IS NOT NULL) s), 0)::int AS avg_score,
         COALESCE((SELECT sum(total - refunded_amount) FROM ${T.payments} WHERE user_id = $1 AND status IN ('paid', 'partially_refunded')), 0)::int AS ltv,
         (SELECT count(*) FROM ${T.payments} WHERE user_id = $1)::int AS tx_count,
         (SELECT count(*) FROM ${T.entity_notes} WHERE entity_type = 'student' AND entity_id = $1)::int AS notes`,
      [id],
    );
  },
  packageDetail(packageId: string) {
    return db.maybeOne<{ id: string; name_en: string; name_ar: string; validity_type: 'days' | 'months' | 'until_date'; validity_value: number; valid_until: Date | null; subject_ids: string[] }>(
      `SELECT p.id, p.name_en, p.name_ar, p.validity_type, p.validity_value, p.valid_until,
              COALESCE(array_agg(ps.subject_id) FILTER (WHERE ps.subject_id IS NOT NULL), '{}') AS subject_ids
         FROM ${T.packages} p LEFT JOIN ${T.package_subjects} ps ON ps.package_id = p.id WHERE p.id = $1 GROUP BY p.id`,
      [packageId],
    );
  },
  notes(id: string) {
    return db.many<{ id: string; body: string; created_at: Date; a_id: string | null; a_name_en: string | null; a_name_ar: string | null; a_avatar_url: string | null; author_name: string }>(
      `SELECT n.id, n.body, n.created_at, n.author_name, a.id AS a_id, a.name_en AS a_name_en, a.name_ar AS a_name_ar, a.avatar_url AS a_avatar_url
         FROM ${T.entity_notes} n LEFT JOIN ${T.users} a ON a.id = n.author_id
        WHERE n.entity_type = 'student' AND n.entity_id = $1 ORDER BY n.created_at DESC`,
      [id],
    );
  },
  addNote(id: string, authorId: string, authorName: string, body: string) {
    return db.one<{ id: string }>(
      `INSERT INTO ${T.entity_notes} (entity_type, entity_id, author_id, author_name, body) VALUES ('student', $1, $2, $3, $4) RETURNING id`,
      [id, authorId, authorName, body],
    );
  },
  entitlementLogs(id: string) {
    return db.many<Record<string, unknown> & { id: string; action: string; source: string | null; days: number | null; reason: string; created_at: Date }>(
      `SELECT l.id, l.action, l.source, l.days, l.reason, l.created_at,
              s.id AS s_id, s.slug AS s_slug, s.name_en AS s_name_en, s.name_ar AS s_name_ar, s.color AS s_color,
              a.id AS a_id, a.name_en AS a_name_en, a.name_ar AS a_name_ar, a.avatar_url AS a_avatar_url
         FROM ${T.entitlement_logs} l
         LEFT JOIN ${T.subjects} s ON s.id = l.subject_id
         LEFT JOIN ${T.users} a ON a.id = l.actor_id AND a.kind = 'admin'
        WHERE l.user_id = $1 ORDER BY l.created_at DESC LIMIT 200`,
      [id],
    );
  },
  otpState(phone: string) {
    return db.maybeOne<{ failed_count: number; locked_until: Date | null }>(`SELECT failed_count, locked_until FROM ${T.auth_lockouts} WHERE kind = 'otp' AND identifier = $1`, [phone]);
  },
  async resetOtp(phone: string) {
    await db.query(`DELETE FROM ${T.auth_lockouts} WHERE kind = 'otp' AND identifier = $1`, [phone]);
    await db.query(`UPDATE ${T.otp_codes} SET invalidated_at = now() WHERE phone = $1 AND consumed_at IS NULL AND invalidated_at IS NULL`, [phone]);
  },
  updateProfile(id: string, patch: Record<string, unknown>, ex?: Executor) {
    const keys = Object.keys(patch);
    if (!keys.length) return Promise.resolve(0);
    return db.exec(`UPDATE ${T.student_profiles} SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE user_id = $1`, [id, ...keys.map((k) => patch[k])], ex);
  },
  updateUser(id: string, patch: Record<string, unknown>, ex?: Executor) {
    const keys = Object.keys(patch);
    if (!keys.length) return Promise.resolve(0);
    return db.exec(`UPDATE ${T.users} SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...keys.map((k) => patch[k])], ex);
  },
  // ── activity ──
  watch(id: string, limit: number) {
    return db.many<Record<string, unknown>>(
      `SELECT w.id, w.lesson_id, w.watched_sec, w.duration_sec, w.completed, w.updated_at, l.title_en, l.title_ar,
              s.id AS s_id, s.slug AS s_slug, s.name_en AS s_name_en, s.name_ar AS s_name_ar, s.color AS s_color
         FROM ${T.watch_progress} w JOIN ${T.lessons} l ON l.id = w.lesson_id JOIN ${T.subjects} s ON s.id = l.subject_id
        WHERE w.user_id = $1 ORDER BY w.updated_at DESC LIMIT $2`,
      [id, limit],
    );
  },
  quizzes(id: string, limit: number) {
    return db.many<Record<string, unknown>>(
      `SELECT q.id, q.lesson_id, q.correct_count, q.total_count, q.score, q.status, q.pass_threshold, COALESCE(q.submitted_at, q.started_at) AS at,
              l.title_en, l.title_ar
         FROM ${T.quiz_attempts} q JOIN ${T.lessons} l ON l.id = q.lesson_id
        WHERE q.user_id = $1 AND q.status <> 'in_progress' ORDER BY at DESC LIMIT $2`,
      [id, limit],
    );
  },
  exams(id: string, limit: number) {
    return db.many<Record<string, unknown>>(
      `SELECT e.id, e.score, e.status, e.passed, e.started_at, b.title_en, b.title_ar, b.duration_min
         FROM ${T.exam_attempts} e JOIN ${T.exam_blueprints} b ON b.id = e.blueprint_id
        WHERE e.user_id = $1 ORDER BY e.started_at DESC LIMIT $2`,
      [id, limit],
    );
  },
  aiDaily(id: string, days: number) {
    return db.many<{ date: string; questions: number }>(
      `SELECT d::date::text AS date,
              (SELECT count(*) FROM ${T.ai_messages} m JOIN ${T.ai_conversations} c ON c.id = m.conversation_id
                WHERE c.user_id = $1 AND m.role = 'user' AND (m.created_at AT TIME ZONE 'Asia/Baghdad')::date = d::date)::int AS questions
         FROM generate_series((now() AT TIME ZONE 'Asia/Baghdad')::date - ($2::int - 1), (now() AT TIME ZONE 'Asia/Baghdad')::date, interval '1 day') d
        ORDER BY d`,
      [id, days],
    );
  },
  aiRecent(id: string, limit: number) {
    return db.many<Record<string, unknown>>(
      `SELECT m.id, m.content, m.created_at, s.id AS s_id, s.slug AS s_slug, s.name_en AS s_name_en, s.name_ar AS s_name_ar, s.color AS s_color
         FROM ${T.ai_messages} m JOIN ${T.ai_conversations} c ON c.id = m.conversation_id LEFT JOIN ${T.subjects} s ON s.id = c.subject_id
        WHERE c.user_id = $1 AND m.role = 'user' ORDER BY m.created_at DESC LIMIT $2`,
      [id, limit],
    );
  },
  transactions(id: string, order: string, limit: number, offset: number) {
    return Promise.all([
      db.scalar<number>(`SELECT count(*)::int FROM ${T.payments} WHERE user_id = $1`, [id]),
      db.many<Record<string, unknown>>(
        `SELECT pay.*, r.number AS receipt_number,
                u.id AS u_id, u.name_en AS u_name_en, u.name_ar AS u_name_ar, u.phone AS u_phone, u.avatar_url AS u_avatar_url,
                p.id AS p_id, p.name_en AS p_name_en, p.name_ar AS p_name_ar,
                sc.id AS sc_id, sc.name_en AS sc_name_en, sc.name_ar AS sc_name_ar, sc.code AS sc_code,
                m.id AS m_id, m.name_en AS m_name_en, m.name_ar AS m_name_ar, m.avatar_url AS m_avatar_url
           FROM ${T.payments} pay
           JOIN ${T.users} u ON u.id = pay.user_id
           JOIN ${T.packages} p ON p.id = pay.package_id
           LEFT JOIN ${T.receipts} r ON r.payment_id = pay.id
           LEFT JOIN ${T.schools} sc ON sc.id = pay.school_id
           LEFT JOIN ${T.marketers} m ON m.id = pay.marketer_id
          WHERE pay.user_id = $1 ORDER BY ${order} LIMIT $2 OFFSET $3`,
        [id, limit, offset],
      ),
    ]);
  },
};
