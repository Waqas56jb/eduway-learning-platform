/** Housekeeping owned by the foundation: purge expired OTPs, idempotency keys and dead sessions. */
import { T } from '../config/constants.js';
import { db } from '../config/db.js';
import { logger } from '../config/logger.js';
import { registerJob } from './index.js';

export async function purgeExpiredAuthData(): Promise<{ otp: number; idem: number; sessions: number }> {
  const otp = await db.exec(`DELETE FROM ${T.otp_codes} WHERE created_at < now() - interval '7 days'`);
  const idem = await db.exec(`DELETE FROM ${T.idempotency_keys} WHERE expires_at < now()`);
  const sessions = await db.exec(
    `DELETE FROM ${T.sessions} WHERE (revoked_at IS NOT NULL AND revoked_at < now() - interval '90 days') OR expires_at < now() - interval '90 days'`,
  );
  return { otp, idem, sessions };
}

registerJob({
  name: 'eduway.maintenance.purge',
  cron: '17 3 * * *',
  handler: async () => {
    const r = await purgeExpiredAuthData();
    logger.info(r, 'purged expired auth data');
  },
});
