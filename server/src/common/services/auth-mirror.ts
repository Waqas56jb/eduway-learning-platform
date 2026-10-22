/**
 * Best-effort mirror of our users into Supabase Auth (shared project!). Every auth user we create carries
 * `app_metadata.app = "eduway_platform"`; we only ever touch users carrying that marker.
 * Our own authentication never depends on it (OTP / passwords live in eduway_platform_* tables).
 */
import { AUTH_APP_MARKER, T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { supabaseService } from '../../config/supabase.js';

export async function mirrorAuthUser(input: { userId: string; kind: 'student' | 'admin'; phone?: string | null; email?: string | null }): Promise<string | null> {
  if (!env.SUPABASE_AUTH_MIRROR || env.TEST) return null;
  try {
    const { data, error } = await supabaseService.auth.admin.createUser({
      ...(input.email ? { email: input.email, email_confirm: true } : {}),
      ...(input.phone ? { phone: input.phone.replace(/^\+/, ''), phone_confirm: true } : {}),
      app_metadata: { app: AUTH_APP_MARKER, kind: input.kind, eduway_user_id: input.userId },
      user_metadata: {},
    });
    if (error || !data.user) {
      logger.warn({ err: error?.message, kind: input.kind }, 'supabase auth mirror skipped');
      return null;
    }
    await db.query(`UPDATE ${T.users} SET auth_user_id = $2 WHERE id = $1 AND auth_user_id IS NULL`, [input.userId, data.user.id]);
    return data.user.id;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'supabase auth mirror failed');
    return null;
  }
}

/** Delete a mirrored auth user — only when it carries our marker. */
export async function deleteMirroredAuthUser(authUserId: string): Promise<void> {
  const { data } = await supabaseService.auth.admin.getUserById(authUserId);
  if (data.user?.app_metadata?.app !== AUTH_APP_MARKER) {
    logger.error({ authUserId }, 'refusing to delete a Supabase auth user that is not ours');
    return;
  }
  await supabaseService.auth.admin.deleteUser(authUserId);
}
