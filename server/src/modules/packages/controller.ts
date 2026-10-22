import type { Request, Response } from 'express';
import type { ExportColumn, ExportRequest } from '../../common/services/exporter.js';
import { paged } from '../../common/utils/response.js';
import { OK } from '../../common/dto/refs.js';
import { sendTableExport } from '../commerce/lib.js';
import type { AdminPackageListQuery, PackagePatch, PackageWrite } from './schemas.js';
import { packagesService } from './service.js';
import type { AdminPackage } from './types.js';

const EXPORT_COLUMNS: ExportColumn<AdminPackage>[] = [
  { key: 'name_en', header: 'name_en', value: (r) => r.name.en },
  { key: 'name_ar', header: 'name_ar', value: (r) => r.name.ar },
  { key: 'subjects', header: 'subjects', value: (r) => r.subjects.map((s) => s.slug).join('|') },
  { key: 'price', header: 'price', value: (r) => r.price },
  { key: 'yearlyPrice', header: 'yearly_price', value: (r) => r.yearlyPrice },
  { key: 'currency', header: 'currency', value: (r) => r.currency },
  { key: 'validity', header: 'validity', value: (r) => (r.validityType === 'until_date' ? `until ${r.validUntil?.slice(0, 10)}` : `${r.validityValue} ${r.validityType}`) },
  { key: 'renewal', header: 'renewal', value: (r) => r.renewal },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'featured', header: 'featured', value: (r) => (r.featured ? 'yes' : 'no') },
  { key: 'aiQuota', header: 'ai_quota', value: (r) => r.aiQuota },
  { key: 'subscribers', header: 'subscribers', value: (r) => r.subscribers },
  { key: 'updated', header: 'updated', value: (r) => r.updatedAt },
];

export const packagesController = {
  listPublic: (userId?: string) => packagesService.listPublic(userId),
  getPublic: (id: string, userId?: string) => packagesService.getPublic(id, userId),
  async list(q: AdminPackageListQuery) {
    const r = await packagesService.pageAdmin(q);
    return paged(r.items, r.meta);
  },
  get: (id: string) => packagesService.get(id),
  async create(req: Request, body: PackageWrite) {
    const p = await packagesService.create(body);
    req.audit = { action: 'package.create', entity: 'package', entityId: p.id, summary: `Created package ${p.name.en}`, after: p };
    return p;
  },
  async update(req: Request, id: string, body: PackagePatch) {
    const before = await packagesService.get(id);
    const p = await packagesService.update(id, body);
    const changed = Object.keys(body);
    req.audit = {
      action: 'package.update',
      entity: 'package',
      entityId: id,
      summary: `Updated ${p.name.en}: ${changed.join(', ')}${body.price !== undefined && body.price !== before.price ? ` (price ${before.price} → ${p.price})` : ''}`,
      before: Object.fromEntries(changed.map((k) => [k, (before as unknown as Record<string, unknown>)[k]])),
      after: Object.fromEntries(changed.map((k) => [k, (p as unknown as Record<string, unknown>)[k]])),
    };
    return p;
  },
  async duplicate(req: Request, id: string) {
    const p = await packagesService.duplicate(id);
    req.audit = { action: 'package.duplicate', entity: 'package', entityId: p.id, summary: `Duplicated package ${id} → ${p.name.en}`, after: p };
    return p;
  },
  async archive(req: Request, id: string, reason?: string) {
    const p = await packagesService.setStatus(id, 'archived');
    req.audit = { action: 'package.archive', entity: 'package', entityId: id, summary: `Archived ${p.name.en}${reason ? `: ${reason}` : ''}`, after: { status: 'archived', reason } };
    return p;
  },
  async restore(req: Request, id: string) {
    const p = await packagesService.setStatus(id, 'active');
    req.audit = { action: 'package.restore', entity: 'package', entityId: id, summary: `Restored ${p.name.en}`, after: { status: 'active' } };
    return p;
  },
  async remove(req: Request, id: string) {
    const before = await packagesService.get(id);
    await packagesService.remove(id);
    req.audit = { action: 'package.delete', entity: 'package', entityId: id, summary: `Deleted package ${before.name.en}`, before };
    return OK;
  },
  async reorder(req: Request, ids: string[]) {
    const r = await packagesService.reorder(ids);
    req.audit = { action: 'package.reorder', entity: 'package', entityId: null, summary: `Reordered ${ids.length} packages`, after: { ids } };
    return r;
  },
  async export(req: Request, res: Response, body: ExportRequest) {
    const f = (body.filters ?? {}) as Partial<AdminPackageListQuery>;
    let rows = await packagesService.listAdmin({ status: f.status, q: f.q, sort: f.sort });
    if (body.ids?.length) rows = rows.filter((r) => body.ids?.includes(r.id));
    await sendTableExport(req, res, { report: 'packages', format: body.format, columns: EXPORT_COLUMNS, selected: body.columns, rows, filters: body.filters });
  },
};
