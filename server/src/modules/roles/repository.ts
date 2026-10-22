import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import type { RoleRow } from './types.js';

export const rolesRepo = {
  list(ex?: Executor) {
    return db.many<RoleRow>(`SELECT * FROM ${T.roles} ORDER BY is_system DESC, created_at`, [], ex);
  },
  get(id: string, ex?: Executor) {
    return db.maybeOne<RoleRow>(`SELECT * FROM ${T.roles} WHERE id = $1`, [id], ex);
  },
  getByKey(key: string, ex?: Executor) {
    return db.maybeOne<RoleRow>(`SELECT * FROM ${T.roles} WHERE key = $1`, [key], ex);
  },
  /** role_id → permission keys */
  async permissionsByRole(roleIds: string[], ex?: Executor): Promise<Map<string, string[]>> {
    const rows = await db.many<{ role_id: string; key: string }>(
      `SELECT rp.role_id, p.key FROM ${T.role_permissions} rp JOIN ${T.permissions} p ON p.id = rp.permission_id WHERE rp.role_id = ANY($1::uuid[])`,
      [roleIds],
      ex,
    );
    const m = new Map<string, string[]>();
    for (const r of rows) m.set(r.role_id, [...(m.get(r.role_id) ?? []), r.key]);
    return m;
  },
  async assignedAdmins(roleIds: string[], ex?: Executor) {
    return db.many<{ role_id: string; id: string; name_en: string; name_ar: string; avatar_url: string | null }>(
      `SELECT ar.role_id, u.id, u.name_en, u.name_ar, u.avatar_url
         FROM ${T.admin_roles} ar JOIN ${T.users} u ON u.id = ar.user_id
        WHERE ar.role_id = ANY($1::uuid[]) AND u.status <> 'deactivated' AND u.deleted_at IS NULL
        ORDER BY u.name_en`,
      [roleIds],
      ex,
    );
  },
  insert(r: { key: string; nameEn: string; nameAr: string; descEn: string; descAr: string; system?: boolean }, ex?: Executor) {
    return db.one<RoleRow>(
      `INSERT INTO ${T.roles} (key, name_en, name_ar, description_en, description_ar, is_system) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [r.key, r.nameEn, r.nameAr, r.descEn, r.descAr, r.system ?? false],
      ex,
    );
  },
  update(id: string, r: { key: string; nameEn: string; nameAr: string; descEn: string; descAr: string }, ex?: Executor) {
    return db.one<RoleRow>(
      `UPDATE ${T.roles} SET key = $2, name_en = $3, name_ar = $4, description_en = $5, description_ar = $6 WHERE id = $1 RETURNING *`,
      [id, r.key, r.nameEn, r.nameAr, r.descEn, r.descAr],
      ex,
    );
  },
  async setPermissions(roleId: string, keys: string[], ex: Executor) {
    await db.query(`DELETE FROM ${T.role_permissions} WHERE role_id = $1`, [roleId], ex);
    if (keys.length) {
      await db.query(
        `INSERT INTO ${T.role_permissions} (role_id, permission_id)
         SELECT $1, id FROM ${T.permissions} WHERE key = ANY($2::text[]) ON CONFLICT DO NOTHING`,
        [roleId, keys],
        ex,
      );
    }
    await db.query(`UPDATE ${T.roles} SET updated_at = now() WHERE id = $1`, [roleId], ex);
  },
  countAssigned(roleId: string, ex?: Executor) {
    return db.scalar<number>(
      `SELECT count(*)::int FROM ${T.admin_roles} ar JOIN ${T.users} u ON u.id = ar.user_id WHERE ar.role_id = $1 AND u.status <> 'deactivated'`,
      [roleId],
      ex,
    );
  },
  async delete(roleId: string, ex: Executor) {
    await db.query(`DELETE FROM ${T.admin_roles} WHERE role_id = $1`, [roleId], ex);
    await db.query(`DELETE FROM ${T.roles} WHERE id = $1`, [roleId], ex);
  },
  keyExists(key: string) {
    return db.scalar<number>(`SELECT count(*)::int FROM ${T.roles} WHERE key = $1`, [key]);
  },
};
