/**
 * Admin inbox (Topbar bell, ADM-ME-06..08). Server code calls `adminInbox.notify()` when something needs
 * attention; one row is created for every active admin holding `permission` (Super Admins always included).
 *
 *   await adminInbox.notify({ permission: 'payments.approve', kind: 'warning',
 *     title: { en: 'Refund requested', ar: 'طلب استرداد' }, body: {…}, href: '/payments/refunds', dedupeKey: `refund:${id}` });
 */
import { T, type PermissionKey } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import type { Localized } from '../i18n/index.js';

export interface AdminNotifyInput {
  permission: PermissionKey;
  kind?: 'info' | 'warning' | 'success' | 'danger';
  category?: string;
  title: Localized;
  body?: Localized;
  href: string;
  /** Prevents duplicates per admin (e.g. `lesson-review:<id>`). */
  dedupeKey?: string;
}

export const adminInbox = {
  async notify(n: AdminNotifyInput): Promise<number> {
    try {
      const res = await db.query(
        `INSERT INTO ${T.admin_notifications} (user_id, kind, category, title_en, title_ar, body_en, body_ar, href, dedupe_key)
         SELECT DISTINCT u.id, $2, $3, $4, $5, $6, $7, $8, $9
           FROM ${T.users} u
           JOIN ${T.admin_roles} ar ON ar.user_id = u.id
           JOIN ${T.roles} r ON r.id = ar.role_id
           LEFT JOIN ${T.role_permissions} rp ON rp.role_id = r.id
           LEFT JOIN ${T.permissions} p ON p.id = rp.permission_id
          WHERE u.kind = 'admin' AND u.status = 'active' AND (r.key = 'super_admin' OR p.key = $1)
         ON CONFLICT DO NOTHING`,
        [n.permission, n.kind ?? 'info', n.category ?? 'general', n.title.en, n.title.ar, n.body?.en ?? '', n.body?.ar ?? '', n.href, n.dedupeKey ?? null],
      );
      return res.rowCount ?? 0;
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'admin inbox notify failed');
      return 0;
    }
  },
};
