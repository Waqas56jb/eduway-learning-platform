import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';

export interface OtpRow {
  id: string;
  phone: string;
  purpose: string;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  send_count: number;
  last_sent_at: Date;
  expires_at: Date;
  created_at: Date;
}

export interface StudentAuthRow {
  id: string;
  status: string;
  profile_completed: boolean | null;
  locale: string | null;
}

export interface LockoutRow {
  failed_count: number;
  window_start: Date;
  locked_until: Date | null;
}

export const authRepo = {
  findStudentByPhone(phone: string, ex?: Executor) {
    return db.maybeOne<StudentAuthRow>(
      `SELECT u.id, u.status, u.locale, sp.profile_completed FROM ${T.users} u
         LEFT JOIN ${T.student_profiles} sp ON sp.user_id = u.id
        WHERE u.kind = 'student' AND u.phone = $1 AND u.deleted_at IS NULL`,
      [phone],
      ex,
    );
  },

  // ── OTP ──
  latestActiveOtp(phone: string, ex?: Executor) {
    return db.maybeOne<OtpRow>(
      `SELECT * FROM ${T.otp_codes} WHERE phone = $1 AND consumed_at IS NULL AND invalidated_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [phone],
      ex,
    );
  },
  sendsInWindow(phone: string, minutes: number) {
    return db.one<{ sends: number; oldest: Date | null }>(
      `SELECT COALESCE(sum(send_count), 0)::int AS sends, min(created_at) AS oldest FROM ${T.otp_codes}
        WHERE phone = $1 AND created_at > now() - make_interval(mins => $2)`,
      [phone, minutes],
    );
  },
  invalidateActive(phone: string, ex?: Executor) {
    return db.exec(`UPDATE ${T.otp_codes} SET invalidated_at = now() WHERE phone = $1 AND consumed_at IS NULL AND invalidated_at IS NULL`, [phone], ex);
  },
  insertOtp(o: { phone: string; purpose: string; codeHash: string; maxAttempts: number; expiresAt: Date; ip: string | null; ua: string | null; provider: string; channel?: 'sms' | 'whatsapp' }) {
    return db.one<{ id: string }>(
      `INSERT INTO ${T.otp_codes} (phone, purpose, code_hash, max_attempts, expires_at, ip, user_agent, provider, channel)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [o.phone, o.purpose, o.codeHash, o.maxAttempts, o.expiresAt, o.ip, o.ua, o.provider, o.channel ?? 'sms'],
    );
  },
  /** Channel/provider actually used (after a WhatsApp → SMS fallback). */
  setOtpChannel(id: string, channel: 'sms' | 'whatsapp', provider: string) {
    return db.exec(`UPDATE ${T.otp_codes} SET channel = $2, provider = $3 WHERE id = $1`, [id, channel, provider]);
  },
  deleteOtp(id: string) {
    return db.exec(`DELETE FROM ${T.otp_codes} WHERE id = $1`, [id]);
  },
  incrementOtpAttempts(id: string) {
    return db.one<{ attempts: number; max_attempts: number }>(
      `UPDATE ${T.otp_codes} SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts, max_attempts`,
      [id],
    );
  },
  /** Atomically consume a still-valid code. Returns false when a concurrent request already used/invalidated it. */
  async consumeOtp(id: string, ex?: Executor): Promise<boolean> {
    const n = await db.exec(
      `UPDATE ${T.otp_codes} SET consumed_at = now()
        WHERE id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL AND attempts < max_attempts AND expires_at > now()`,
      [id],
      ex,
    );
    return n > 0;
  },

  // ── lockouts ──
  getLockout(kind: string, identifier: string) {
    return db.maybeOne<LockoutRow>(`SELECT failed_count, window_start, locked_until FROM ${T.auth_lockouts} WHERE kind = $1 AND identifier = $2`, [kind, identifier]);
  },
  /** Count a failure; lock for `lockMinutes` when `threshold` failures are reached. Returns the new state. */
  async registerFailure(kind: string, identifier: string, threshold: number, lockMinutes: number): Promise<LockoutRow> {
    const cur = await this.getLockout(kind, identifier);
    const now = Date.now();
    const expiredLock = !!cur?.locked_until && cur.locked_until.getTime() <= now;
    const failed = expiredLock || !cur ? 1 : cur.failed_count + 1;
    const stillLocked = cur?.locked_until && cur.locked_until.getTime() > now ? cur.locked_until : null;
    const lockedUntil = stillLocked ?? (failed >= threshold ? new Date(now + lockMinutes * 60_000) : null);
    return db.one<LockoutRow>(
      `INSERT INTO ${T.auth_lockouts} (kind, identifier, failed_count, window_start, locked_until) VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (kind, identifier) DO UPDATE SET failed_count = EXCLUDED.failed_count, locked_until = EXCLUDED.locked_until,
         window_start = CASE WHEN EXCLUDED.failed_count = 1 THEN now() ELSE ${T.auth_lockouts}.window_start END
       RETURNING failed_count, window_start, locked_until`,
      [kind, identifier, failed, lockedUntil],
    );
  },
  lockNow(kind: string, identifier: string, minutes: number) {
    return db.query(
      `INSERT INTO ${T.auth_lockouts} (kind, identifier, failed_count, locked_until) VALUES ($1, $2, 1, now() + make_interval(mins => $3))
       ON CONFLICT (kind, identifier) DO UPDATE SET locked_until = now() + make_interval(mins => $3)`,
      [kind, identifier, minutes],
    );
  },
  clearLockout(kind: string, identifier: string, ex?: Executor) {
    return db.exec(`DELETE FROM ${T.auth_lockouts} WHERE kind = $1 AND identifier = $2`, [kind, identifier], ex);
  },

  // ── devices ──
  upsertDevice(d: { userId: string; deviceId: string; platform: string; name: string; ip: string | null; ua: string | null }, ex?: Executor) {
    return db.one<{ blocked: boolean }>(
      `INSERT INTO ${T.devices} (user_id, device_id, platform, name, last_ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, device_id) DO UPDATE SET platform = EXCLUDED.platform, name = EXCLUDED.name,
         last_ip = EXCLUDED.last_ip, user_agent = EXCLUDED.user_agent, last_seen_at = now()
       RETURNING blocked`,
      [d.userId, d.deviceId, d.platform, d.name, d.ip, d.ua],
      ex,
    );
  },
  isDeviceBlocked(userId: string, deviceId: string) {
    return db.scalar<boolean>(`SELECT blocked FROM ${T.devices} WHERE user_id = $1 AND device_id = $2`, [userId, deviceId]);
  },

  touchUser(userId: string, ex?: Executor) {
    return db.exec(`UPDATE ${T.users} SET last_active_at = now() WHERE id = $1`, [userId], ex);
  },

  // ── legal ──
  currentLegal(ex?: Executor) {
    return db.many<{ id: string; doc_type: 'terms' | 'privacy'; version: string }>(
      `SELECT id, doc_type, version FROM ${T.legal_documents} WHERE status = 'published'`,
      [],
      ex,
    );
  },
  acceptLegal(userId: string, documentId: string, ip: string | null, platform: string | null, ex?: Executor) {
    return db.query(
      `INSERT INTO ${T.legal_acceptances} (user_id, document_id, ip, platform) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, document_id) DO NOTHING`,
      [userId, documentId, ip, platform],
      ex,
    );
  },

  // ── admin tokens ──
  findInvite(tokenHash: string) {
    return db.maybeOne<{ id: string; user_id: string; role_id: string | null; expires_at: Date }>(
      `SELECT id, user_id, role_id, expires_at FROM ${T.admin_invites}
        WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );
  },
  /** Single-use: false when the invite was already accepted/revoked (concurrent replay). */
  async acceptInvite(id: string, ex?: Executor): Promise<boolean> {
    return (await db.exec(`UPDATE ${T.admin_invites} SET accepted_at = now() WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`, [id], ex)) > 0;
  },
  insertReset(userId: string, tokenHash: string, minutes: number, ip: string | null) {
    return db.query(`INSERT INTO ${T.password_resets} (user_id, token_hash, expires_at, ip) VALUES ($1,$2, now() + make_interval(mins => $3), $4)`, [userId, tokenHash, minutes, ip]);
  },
  findReset(tokenHash: string) {
    return db.maybeOne<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM ${T.password_resets} WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );
  },
  /** Retire every unused reset link of a user (a new link was issued, or the password was just reset). */
  retireResets(userId: string) {
    return db.exec(`UPDATE ${T.password_resets} SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  },
  /** Single-use: false when the token was already used (concurrent replay). */
  async useReset(id: string, ex?: Executor): Promise<boolean> {
    return (await db.exec(`UPDATE ${T.password_resets} SET used_at = now() WHERE id = $1 AND used_at IS NULL AND expires_at > now()`, [id], ex)) > 0;
  },
};
