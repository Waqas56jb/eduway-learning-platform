import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import type { PackageRow } from '../../common/dto/package.js';

export interface PackageAdminRow extends PackageRow {
  tax_behavior: 'inclusive' | 'exclusive' | 'exempt';
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  subscribers: number;
}

const SUBSCRIBERS = `(SELECT count(*)::int FROM ${T.subscriptions} s WHERE s.package_id = p.id AND s.status IN ('active', 'trial') AND s.ends_at > now())`;

export const packagesRepo = {
  listAll(ex?: Executor) {
    return db.many<PackageAdminRow>(`SELECT p.*, ${SUBSCRIBERS} AS subscribers FROM ${T.packages} p WHERE p.deleted_at IS NULL ORDER BY p.sort_order, p.created_at`, [], ex);
  },
  listActive() {
    return db.many<PackageAdminRow>(`SELECT p.*, 0 AS subscribers FROM ${T.packages} p WHERE p.deleted_at IS NULL AND p.status = 'active' ORDER BY p.sort_order, p.price`);
  },
  get(id: string, ex?: Executor) {
    return db.maybeOne<PackageAdminRow>(`SELECT p.*, ${SUBSCRIBERS} AS subscribers FROM ${T.packages} p WHERE p.id = $1 AND p.deleted_at IS NULL`, [id], ex);
  },
  subjectRefs(ids: string[], ex?: Executor) {
    return db.many<{ package_id: string; id: string; slug: string; name_en: string; name_ar: string; color: string }>(
      `SELECT ps.package_id, s.id, s.slug, s.name_en, s.name_ar, s.color FROM ${T.package_subjects} ps JOIN ${T.subjects} s ON s.id = ps.subject_id
        WHERE ps.package_id = ANY($1::uuid[]) ORDER BY s.sort_order`,
      [ids],
      ex,
    );
  },
  async defaultAiQuota(ex?: Executor): Promise<number> {
    return (await db.scalar<number>(`SELECT monthly_allowance FROM ${T.ai_settings} WHERE id = 1`, [], ex)) ?? 100;
  },
  async replaceSubjects(pkgId: string, subjectIds: string[], ex: Executor) {
    await db.query(`DELETE FROM ${T.package_subjects} WHERE package_id = $1`, [pkgId], ex);
    if (subjectIds.length) {
      await db.query(
        `INSERT INTO ${T.package_subjects} (package_id, subject_id) SELECT $1, s.id FROM ${T.subjects} s WHERE s.id = ANY($2::uuid[]) ON CONFLICT DO NOTHING`,
        [pkgId, subjectIds],
        ex,
      );
    }
  },
  async replaceFeatures(pkgId: string, features: { en: string; ar: string }[], ex: Executor) {
    await db.query(`DELETE FROM ${T.package_features} WHERE package_id = $1`, [pkgId], ex);
    for (const [i, f] of features.entries()) {
      await db.query(`INSERT INTO ${T.package_features} (package_id, text_en, text_ar, sort_order) VALUES ($1,$2,$3,$4)`, [pkgId, f.en, f.ar, i + 1], ex);
    }
  },
  async countSubjects(ids: string[], ex?: Executor): Promise<number> {
    return (await db.scalar<number>(`SELECT count(*)::int FROM ${T.subjects} WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`, [ids], ex)) ?? 0;
  },
  async dependents(id: string): Promise<{ active: number; payments: number }> {
    return db.one(
      `SELECT ${SUBSCRIBERS.replace('p.id', '$1')} AS active, (SELECT count(*)::int FROM ${T.payments} WHERE package_id = $1) AS payments`,
      [id],
    );
  },
};
