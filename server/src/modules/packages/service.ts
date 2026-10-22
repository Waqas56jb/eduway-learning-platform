/** Packages: student catalogue (PAY-01/02) + admin CRUD (ADM-PKG-*). All prices/validity live in the table. */
import { T } from '../../config/constants.js';
import { db, tx, type Executor } from '../../config/db.js';
import { loadPackageExtras, toPackagePublic, type PackagePublic } from '../../common/dto/package.js';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/index.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { currentSubscriptionRow } from '../../common/services/student-summary.js';
import { randomCode } from '../../common/utils/crypto.js';
import { iso, parseSort, sortRows, pageOf } from '../commerce/lib.js';
import { packagesRepo, type PackageAdminRow } from './repository.js';
import type { AdminPackageListQuery, PackagePatch, PackageWrite } from './schemas.js';
import type { AdminPackage } from './types.js';

async function decorate(rows: PackageAdminRow[], ex?: Executor): Promise<AdminPackage[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  // Sequential: `ex` may be a transaction client (no concurrent queries on one connection).
  const extras = await loadPackageExtras(ids, ex);
  const refs = await packagesRepo.subjectRefs(ids, ex);
  const defaultAi = await packagesRepo.defaultAiQuota(ex);
  const app = await settingsStore.app();
  return rows.map((p) => {
    const subjects = refs.filter((s) => s.package_id === p.id);
    const pub = toPackagePublic(p, { subjects: extras.subjects.get(p.id) ?? [], features: extras.features.get(p.id) ?? [], defaultAiQuota: defaultAi, devices: app.deviceLimit });
    return {
      id: p.id,
      name: pub.name,
      description: pub.description,
      tagline: pub.tagline,
      subjectIds: subjects.map((s) => s.id),
      subjects: subjects.map((s) => ({ id: s.id, slug: s.slug, name: { en: s.name_en, ar: s.name_ar }, color: s.color })),
      price: p.price,
      currency: p.currency,
      taxBehavior: p.tax_behavior,
      validityType: p.validity_type,
      validityValue: p.validity_value,
      validUntil: p.valid_until ? iso(p.valid_until) : null,
      yearlyPrice: p.yearly_price,
      yearlyValidityDays: p.yearly_validity_days,
      renewal: p.renewal,
      accessStart: p.access_start,
      accessStartDate: p.access_start_date ? iso(p.access_start_date) : null,
      status: p.status as AdminPackage['status'],
      featured: p.is_featured,
      order: p.sort_order,
      aiQuota: p.ai_quota,
      features: pub.features,
      comparison: pub.comparison,
      subscribers: p.subscribers,
      createdAt: iso(p.created_at),
      updatedAt: iso(p.updated_at),
    };
  });
}

async function toPublic(rows: PackageAdminRow[], currentPackageId: string | null | undefined): Promise<PackagePublic[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [extras, defaultAi, app] = await Promise.all([loadPackageExtras(ids), packagesRepo.defaultAiQuota(), settingsStore.app()]);
  return rows.map((p) => toPackagePublic(p, { subjects: extras.subjects.get(p.id) ?? [], features: extras.features.get(p.id) ?? [], defaultAiQuota: defaultAi, currentPackageId, devices: app.deviceLimit }));
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'package';

const COLS: Record<string, (v: PackagePatch) => unknown> = {
  name_en: (v) => v.name?.en,
  name_ar: (v) => v.name?.ar,
  description_en: (v) => v.description?.en,
  description_ar: (v) => v.description?.ar,
  tagline_en: (v) => v.tagline?.en,
  tagline_ar: (v) => v.tagline?.ar,
  price: (v) => v.price,
  currency: (v) => v.currency,
  tax_behavior: (v) => v.taxBehavior,
  validity_type: (v) => v.validityType,
  validity_value: (v) => v.validityValue,
  valid_until: (v) => v.validUntil,
  yearly_price: (v) => v.yearlyPrice,
  yearly_validity_days: (v) => v.yearlyValidityDays,
  renewal: (v) => v.renewal,
  access_start: (v) => v.accessStart,
  access_start_date: (v) => v.accessStartDate,
  status: (v) => v.status,
  is_featured: (v) => v.featured,
  sort_order: (v) => v.order,
  ai_quota: (v) => v.aiQuota,
  comparison: (v) => (v.comparison === undefined ? undefined : JSON.stringify(v.comparison)),
};

async function assertSubjects(ids: string[] | undefined, ex: Executor) {
  if (!ids) return;
  const n = await packagesRepo.countSubjects(ids, ex);
  if (n !== new Set(ids).size) throw new NotFoundError('subject');
}

export const packagesService = {
  async listPublic(userId?: string): Promise<PackagePublic[]> {
    const current = userId ? await currentSubscriptionRow(userId) : undefined;
    const live = current && ['active', 'trial'].includes(current.status) ? current.package_id : null;
    return toPublic(await packagesRepo.listActive(), userId ? live : undefined);
  },

  async getPublic(id: string, userId?: string): Promise<PackagePublic> {
    const row = await packagesRepo.get(id);
    const current = userId ? await currentSubscriptionRow(userId) : undefined;
    // Students may always see their own (even archived) package.
    if (!row || (row.status !== 'active' && current?.package_id !== id)) throw new NotFoundError('package');
    const live = current && ['active', 'trial'].includes(current.status) ? current.package_id : null;
    return (await toPublic([row], userId ? live : undefined))[0] as PackagePublic;
  },

  async listAdmin(q: Pick<AdminPackageListQuery, 'status' | 'q' | 'sort'>): Promise<AdminPackage[]> {
    let rows = await decorate(await packagesRepo.listAll());
    if (q.status) rows = rows.filter((r) => r.status === q.status);
    if (q.q) {
      const words = q.q.toLowerCase().split(/\s+/).filter(Boolean);
      rows = rows.filter((r) => words.every((w) => `${r.name.en} ${r.name.ar} ${r.tagline.en}`.toLowerCase().includes(w)));
    }
    const sort = parseSort(q.sort, ['order', 'name', 'price', 'subscribers', 'status', 'createdAt', 'updatedAt'], 'order');
    return sortRows(rows, sort, (r, k) => (k === 'name' ? r.name.en : (r as unknown as Record<string, unknown>)[k]));
  },

  async pageAdmin(q: AdminPackageListQuery) {
    return pageOf(await this.listAdmin(q), q.page, q.pageSize);
  },

  async get(id: string, ex?: Executor): Promise<AdminPackage> {
    const row = await packagesRepo.get(id, ex);
    if (!row) throw new NotFoundError('package');
    return (await decorate([row], ex))[0] as AdminPackage;
  },

  async create(body: PackageWrite): Promise<AdminPackage> {
    return tx(async (c) => {
      await assertSubjects(body.subjectIds, c);
      const slug = `${slugify(body.name.en)}-${randomCode(4).toLowerCase()}`;
      const keys = Object.keys(COLS);
      const vals = keys.map((k) => (COLS[k] as (v: PackagePatch) => unknown)(body) ?? null);
      const id = await db.scalar<string>(
        `INSERT INTO ${T.packages} (slug, ${keys.join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING id`,
        [slug, ...vals],
        c,
      );
      await packagesRepo.replaceSubjects(id as string, body.subjectIds, c);
      await packagesRepo.replaceFeatures(id as string, body.features, c);
      return this.get(id as string, c);
    });
  },

  async update(id: string, body: PackagePatch): Promise<AdminPackage> {
    return tx(async (c) => {
      const cur = await packagesRepo.get(id, c);
      if (!cur) throw new NotFoundError('package');
      // Cross-field validity check against the merged state.
      const vt = body.validityType ?? cur.validity_type;
      const vu = body.validUntil !== undefined ? body.validUntil : cur.valid_until;
      const vv = body.validityValue ?? cur.validity_value;
      if (vt === 'until_date' && !vu) throw new ValidationError([{ path: 'validUntil', message: 'validUntil is required for until_date' }]);
      if (vt !== 'until_date' && vv < 1) throw new ValidationError([{ path: 'validityValue', message: 'validityValue must be ≥ 1' }]);
      const as = body.accessStart ?? cur.access_start;
      const asd = body.accessStartDate !== undefined ? body.accessStartDate : cur.access_start_date;
      if (as === 'from_date' && !asd) throw new ValidationError([{ path: 'accessStartDate', message: 'accessStartDate is required for from_date' }]);
      await assertSubjects(body.subjectIds, c);
      const sets: string[] = [];
      const params: unknown[] = [id];
      for (const [col, get] of Object.entries(COLS)) {
        const v = get(body);
        if (v === undefined) continue;
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      }
      if (sets.length) await db.query(`UPDATE ${T.packages} SET ${sets.join(', ')} WHERE id = $1`, params, c);
      if (body.subjectIds) await packagesRepo.replaceSubjects(id, body.subjectIds, c);
      if (body.features) await packagesRepo.replaceFeatures(id, body.features, c);
      return this.get(id, c);
    });
  },

  async duplicate(id: string): Promise<AdminPackage> {
    const src = await this.get(id);
    return this.create({
      name: { en: `${src.name.en} (copy)`, ar: `${src.name.ar} (نسخة)` },
      description: src.description,
      tagline: src.tagline,
      subjectIds: src.subjectIds,
      price: src.price,
      currency: src.currency,
      taxBehavior: src.taxBehavior,
      validityType: src.validityType,
      validityValue: src.validityValue,
      validUntil: src.validUntil,
      yearlyPrice: src.yearlyPrice,
      yearlyValidityDays: src.yearlyValidityDays,
      renewal: src.renewal,
      accessStart: src.accessStart,
      accessStartDate: src.accessStartDate,
      status: 'draft',
      featured: false,
      order: src.order + 1,
      aiQuota: src.aiQuota,
      features: src.features,
      comparison: src.comparison,
    });
  },

  async setStatus(id: string, status: 'archived' | 'active' | 'draft'): Promise<AdminPackage> {
    const n = await db.exec(`UPDATE ${T.packages} SET status = $2 WHERE id = $1 AND deleted_at IS NULL`, [id, status]);
    if (!n) throw new NotFoundError('package');
    return this.get(id);
  },

  async remove(id: string): Promise<void> {
    await this.get(id);
    const d = await packagesRepo.dependents(id);
    if (d.active > 0 || d.payments > 0) throw new ConflictError('HAS_DEPENDENTS', { count: d.active || d.payments, activeSubscribers: d.active, payments: d.payments });
    await db.query(`UPDATE ${T.packages} SET deleted_at = now(), status = 'archived', slug = slug || '-del-' || substr(md5(random()::text), 1, 6) WHERE id = $1`, [id]);
  },

  async reorder(ids: string[]): Promise<AdminPackage[]> {
    await tx(async (c) => {
      for (const [i, id] of ids.entries()) await db.query(`UPDATE ${T.packages} SET sort_order = $2 WHERE id = $1`, [id, i + 1], c);
    });
    return this.listAdmin({});
  },
};
