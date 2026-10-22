import type { Request, Response } from 'express';
import { OK } from '../../common/dto/refs.js';
import type { ExportColumn, ExportRequest } from '../../common/services/exporter.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { paged } from '../../common/utils/response.js';
import { pageOf, sendTableExport } from '../commerce/lib.js';
import type { PromotionListQuery, PromotionPatch, PromotionWrite } from './schemas.js';
import { promotionsService, type PromotionDto } from './service.js';

const COLUMNS: ExportColumn<PromotionDto>[] = [
  { key: 'code', header: 'code', value: (r) => r.code },
  { key: 'type', header: 'type', value: (r) => r.type },
  { key: 'discount', header: 'discount', value: (r) => (r.discountType === 'percent' ? `${r.discountValue}%` : `${r.discountValue} IQD`) },
  { key: 'packages', header: 'packages', value: (r) => (r.packages.length ? r.packages.map((p) => p.name.en).join('|') : 'all') },
  { key: 'eligibility', header: 'eligibility', value: (r) => r.eligibility },
  { key: 'used', header: 'used', value: (r) => r.used },
  { key: 'usageLimit', header: 'usage_limit', value: (r) => r.usageLimit || 'unlimited' },
  { key: 'validFrom', header: 'valid_from', value: (r) => r.validFrom },
  { key: 'validTo', header: 'valid_to', value: (r) => r.validTo },
  { key: 'phase', header: 'phase', value: (r) => r.phase },
  { key: 'owner', header: 'owner', value: (r) => r.owner?.name.en ?? '' },
];

type Redemption = Awaited<ReturnType<typeof promotionsService.redemptionRows>>[number];
const REDEMPTION_COLUMNS: ExportColumn<Redemption>[] = [
  { key: 'at', header: 'at', value: (r) => r.at },
  { key: 'student', header: 'student', value: (r) => r.student.name.en },
  { key: 'mobile', header: 'mobile', value: (r) => r.student.mobile },
  { key: 'ref', header: 'ref', value: (r) => r.ref },
  { key: 'discount', header: 'discount', value: (r) => r.discount },
];

export const promotionsController = {
  async list(q: PromotionListQuery) {
    const r = await promotionsService.page(q);
    return paged(r.items, r.meta);
  },
  stats: () => promotionsService.stats(),
  async create(req: Request, admin: AdminPrincipal, body: PromotionWrite) {
    const p = await promotionsService.create(body, admin.userId);
    req.audit = { action: 'promotion.create', entity: 'promotion', entityId: p.id, summary: `Created promotion ${p.code}`, after: p };
    return p;
  },
  async update(req: Request, id: string, body: PromotionPatch) {
    const before = await promotionsService.get(id);
    const p = await promotionsService.update(id, body);
    const keys = Object.keys(body);
    const action = keys.length === 1 && keys[0] === 'enabled' ? (body.enabled ? 'promotion.enable' : 'promotion.disable') : 'promotion.update';
    req.audit = {
      action,
      entity: 'promotion',
      entityId: id,
      summary: `${action === 'promotion.update' ? 'Updated' : body.enabled ? 'Enabled' : 'Disabled'} promotion ${p.code}`,
      before: Object.fromEntries(keys.map((k) => [k, (before as unknown as Record<string, unknown>)[k]])),
      after: Object.fromEntries(keys.map((k) => [k, (p as unknown as Record<string, unknown>)[k]])),
    };
    return p;
  },
  async remove(req: Request, id: string) {
    const before = await promotionsService.get(id);
    const mode = await promotionsService.remove(id);
    req.audit = { action: 'promotion.delete', entity: 'promotion', entityId: id, summary: `Deleted promotion ${before.code} (${mode})`, before };
    return OK;
  },
  checkCode: (code: string, excludeId?: string) => promotionsService.checkCode(code, excludeId),
  generateCode: (prefix?: string) => promotionsService.generateCode(prefix ?? 'EDU-'),
  async redemptions(id: string, q: { page: number; pageSize: number; sort?: string }) {
    const r = pageOf(await promotionsService.redemptionRows(id, q.sort), q.page, q.pageSize);
    return paged(r.items, r.meta);
  },
  async exportRedemptions(req: Request, res: Response, id: string, body: ExportRequest) {
    const rows = await promotionsService.redemptionRows(id, (body.filters as { sort?: string } | undefined)?.sort);
    await sendTableExport(req, res, { report: 'promotion-redemptions', format: body.format, columns: REDEMPTION_COLUMNS, selected: body.columns, rows: body.ids?.length ? rows.filter((r) => body.ids?.includes(r.id)) : rows, filters: { ...(body.filters ?? {}), promotionId: id } });
  },
  async export(req: Request, res: Response, body: ExportRequest) {
    let rows = await promotionsService.list((body.filters ?? {}) as Partial<PromotionListQuery>);
    if (body.ids?.length) rows = rows.filter((r) => body.ids?.includes(r.id));
    await sendTableExport(req, res, { report: 'promotions', format: body.format, columns: COLUMNS, selected: body.columns, rows, filters: body.filters });
  },
};
