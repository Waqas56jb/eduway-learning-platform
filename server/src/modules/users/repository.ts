import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import type { StudentRow } from './types.js';

export const usersRepo = {
  getStudent(userId: string, ex?: Executor) {
    return db.maybeOne<StudentRow>(
      `SELECT u.id, u.phone, u.email, u.name_en, u.name_ar, u.avatar_url, u.locale, u.status, u.notification_prefs, u.created_at,
              sp.gender, sp.first_name_en, sp.first_name_ar, sp.school_id, sp.school_name, sp.profile_completed,
              sp.daily_goal_minutes,
              COALESCE(sp.last_lesson_id, (SELECT wp.lesson_id FROM ${T.watch_progress} wp WHERE wp.user_id = u.id ORDER BY wp.updated_at DESC LIMIT 1)) AS last_lesson_id,
              g.code AS governorate_code, g.name_en AS governorate_name_en, g.name_ar AS governorate_name_ar,
              sc.name_en AS school_name_en, sc.name_ar AS school_name_ar,
              st.current_streak, st.last_active_date::text AS last_active_date
         FROM ${T.users} u
         LEFT JOIN ${T.student_profiles} sp ON sp.user_id = u.id
         LEFT JOIN ${T.governorates} g ON g.id = sp.governorate_id
         LEFT JOIN ${T.schools} sc ON sc.id = sp.school_id
         LEFT JOIN ${T.streaks} st ON st.user_id = u.id
        WHERE u.id = $1 AND u.kind = 'student' AND u.deleted_at IS NULL`,
      [userId],
      ex,
    );
  },

  /** Published legal documents the user has not accepted. */
  pendingLegal(userId: string, ex?: Executor) {
    return db.many<{ doc: 'terms' | 'privacy'; version: string }>(
      `SELECT d.doc_type AS doc, d.version FROM ${T.legal_documents} d
        WHERE d.status = 'published' AND d.requires_acceptance
          AND NOT EXISTS (SELECT 1 FROM ${T.legal_acceptances} a WHERE a.user_id = $1 AND a.document_id = d.id)
        ORDER BY d.doc_type`,
      [userId],
      ex,
    );
  },

  updateUser(userId: string, patch: Record<string, unknown>, ex?: Executor) {
    const keys = Object.keys(patch);
    if (!keys.length) return Promise.resolve(0);
    return db.exec(`UPDATE ${T.users} SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [userId, ...keys.map((k) => patch[k])], ex);
  },

  updateProfile(userId: string, patch: Record<string, unknown>, ex?: Executor) {
    const keys = Object.keys(patch);
    if (!keys.length) return Promise.resolve(0);
    return db.exec(`UPDATE ${T.student_profiles} SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE user_id = $1`, [userId, ...keys.map((k) => patch[k])], ex);
  },

  governorateIdByCode(code: string, ex?: Executor) {
    return db.scalar<string>(`SELECT id FROM ${T.governorates} WHERE code = $1`, [code], ex);
  },

  devices(userId: string) {
    return db.many<{ id: string; device_id: string; platform: string; name: string | null; last_seen_at: Date; push: boolean }>(
      `SELECT d.id, d.device_id, d.platform, d.name, d.last_seen_at,
              EXISTS (SELECT 1 FROM ${T.push_tokens} p WHERE p.user_id = d.user_id AND p.device_id = d.device_id AND p.revoked_at IS NULL) AS push
         FROM ${T.devices} d WHERE d.user_id = $1 AND NOT d.blocked ORDER BY d.last_seen_at DESC`,
      [userId],
    );
  },

  upsertPushToken(userId: string, t: { token: string; provider: string; platform: string; deviceId: string }) {
    return db.query(
      `INSERT INTO ${T.push_tokens} (user_id, token, provider, platform, device_id, last_seen_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, provider = EXCLUDED.provider, platform = EXCLUDED.platform,
         device_id = EXCLUDED.device_id, last_seen_at = now(), revoked_at = NULL`,
      [userId, t.token, t.provider, t.platform, t.deviceId],
    );
  },

  revokePushToken(userId: string, token: string) {
    return db.exec(`UPDATE ${T.push_tokens} SET revoked_at = now() WHERE user_id = $1 AND token = $2 AND revoked_at IS NULL`, [userId, token]);
  },
};
