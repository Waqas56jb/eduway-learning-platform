/** Writes suspicious-activity events surfaced in the admin Security → Alerts screen. */
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import { logger } from '../../config/logger.js';

export type SecurityEventKind =
  | 'multiple_devices'
  | 'otp_bruteforce'
  | 'unusual_location'
  | 'payment_fraud'
  | 'admin_login_failure'
  | 'refresh_token_reuse'
  | 'other';

export interface SecurityEventInput {
  kind: SecurityEventKind;
  severity: 'low' | 'medium' | 'high' | 'critical';
  subjectLabel: string;
  userId?: string | null;
  detail: string;
  ip?: string | null;
  meta?: Record<string, unknown>;
}

export const securityEvents = {
  async record(e: SecurityEventInput, ex?: Executor): Promise<void> {
    try {
      // De-duplicate: one open event per (kind, user/subject) per hour.
      const recent = await db.scalar<number>(
        `SELECT count(*) FROM ${T.suspicious_events}
          WHERE kind = $1 AND status = 'open' AND subject_label = $2 AND created_at > now() - interval '1 hour'`,
        [e.kind, e.subjectLabel],
        ex,
      );
      if ((recent ?? 0) > 0) return;
      await db.query(
        `INSERT INTO ${T.suspicious_events} (kind, severity, subject_label, user_id, detail, ip, meta)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [e.kind, e.severity, e.subjectLabel, e.userId ?? null, e.detail, e.ip ?? null, JSON.stringify(e.meta ?? {})],
        ex,
      );
    } catch (err) {
      logger.error({ err: (err as Error).message, kind: e.kind }, 'security event write failed');
    }
  },
};
