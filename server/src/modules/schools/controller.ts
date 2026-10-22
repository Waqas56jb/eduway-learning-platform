import type { Request, Response } from 'express';
import { OK } from '../../common/dto/refs.js';
import type { ExportColumn, ExportRequest } from '../../common/services/exporter.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { paged } from '../../common/utils/response.js';
import { sendTableExport } from '../commerce/lib.js';
import { attributedStudents } from '../commerce/students.js';
import type { SchoolListQuery } from './schemas.js';
import { schoolsService, type SchoolDto, type SchoolWrite } from './service.js';

const COLUMNS: ExportColumn<SchoolDto>[] = [
  { key: 'code', header: 'code', value: (r) => r.code },
  { key: 'name_en', header: 'name_en', value: (r) => r.name.en },
  { key: 'name_ar', header: 'name_ar', value: (r) => r.name.ar },
  { key: 'governorate', header: 'governorate', value: (r) => r.governorate.name.en },
  { key: 'city', header: 'city', value: (r) => r.city.en },
  { key: 'contact', header: 'contact', value: (r) => `${r.contactName} ${r.contactMobile}` },
  { key: 'marketer', header: 'marketer', value: (r) => r.marketer?.name.en },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'tier', header: 'tier', value: (r) => r.tier },
  { key: 'verifiedPaidStudents', header: 'verified_paid_students', value: (r) => r.verifiedPaidStudents },
  { key: 'periodPaidStudents', header: 'period_paid_students', value: (r) => r.periodPaidStudents },
  { key: 'pendingSettlement', header: 'pending_settlement_iqd', value: (r) => r.pendingSettlement },
  { key: 'contractEnd', header: 'contract_end', value: (r) => r.contractEnd.slice(0, 10) },
  { key: 'referralLink', header: 'referral_link', value: (r) => r.referralLink },
];

export const schoolsController = {
  async list(q: SchoolListQuery) {
    const r = await schoolsService.page(q);
    return paged(r.items, r.meta);
  },
  stats: () => schoolsService.stats(),
  get: (id: string) => schoolsService.get(id),
  async create(req: Request, admin: AdminPrincipal, body: SchoolWrite & { marketerId?: string | null }) {
    const s = await schoolsService.create(body, admin);
    req.audit = { action: 'school.create', entity: 'school', entityId: s.id, summary: `Created school ${s.name.en} (${s.code})`, after: s };
    return s;
  },
  async update(req: Request, id: string, body: Partial<SchoolWrite>) {
    const before = await schoolsService.get(id);
    const s = await schoolsService.update(id, body);
    const keys = Object.keys(body);
    req.audit = {
      action: 'school.update',
      entity: 'school',
      entityId: id,
      summary: `Updated ${s.name.en}: ${keys.join(', ')}${body.code && before.code !== s.code ? ` (code ${before.code} → ${s.code}; old code kept as alias for 90 days)` : ''}`,
      before: Object.fromEntries(keys.map((k) => [k, (before as unknown as Record<string, unknown>)[k]])),
      after: Object.fromEntries(keys.map((k) => [k, (s as unknown as Record<string, unknown>)[k]])),
    };
    return s;
  },
  async remove(req: Request, id: string) {
    const before = await schoolsService.remove(id);
    req.audit = { action: 'school.delete', entity: 'school', entityId: id, summary: `Deleted school ${before.name.en} (${before.code})`, before };
    return OK;
  },
  async bulkStatus(req: Request, ids: string[], status: 'active' | 'suspended', reason?: string) {
    const r = await schoolsService.bulkStatus(ids, status);
    req.audit = { action: status === 'active' ? 'school.bulk_activate' : 'school.bulk_suspend', entity: 'school', entityId: null, summary: `${status === 'active' ? 'Activated' : 'Suspended'} ${r.succeeded.length} schools${reason ? `: ${reason}` : ''}`, after: { ...r, reason } };
    return r;
  },
  students: (id: string, q: { q?: string; page: number; pageSize: number; sort?: string }) => schoolsService.get(id).then(() => attributedStudents({ schoolId: id }, q)),
  async setMarketer(req: Request, admin: AdminPrincipal, id: string, body: { marketerId: string | null; overrideReason?: string }) {
    const r = await schoolsService.setMarketer(id, body.marketerId, body.overrideReason, admin);
    req.audit = {
      action: r.action ?? 'school.assign_marketer',
      entity: 'school',
      entityId: id,
      summary: r.action === 'school.attribution_override' ? `Attribution override → ${r.school.marketer?.name.en}: ${body.overrideReason}` : r.action === 'school.unassign_marketer' ? 'Unassigned marketer' : `Assigned marketer ${r.school.marketer?.name.en ?? ''}`,
      before: r.before,
      after: { marketerId: r.school.marketerId, overrideReason: body.overrideReason ?? null },
    };
    return r.school;
  },
  progress: (id: string, period?: string) => schoolsService.incentiveProgress(id, period),
  notes: (id: string) => schoolsService.notes(id),
  async addNote(req: Request, admin: AdminPrincipal, id: string, body: string) {
    const n = await schoolsService.addNote(id, body, admin);
    req.audit = { action: 'school.add_note', entity: 'school', entityId: id, summary: body.slice(0, 120), after: n };
    return n;
  },
  async export(req: Request, res: Response, body: ExportRequest) {
    const rows = await schoolsService.all({ ...((body.filters ?? {}) as Partial<SchoolListQuery>), ids: body.ids });
    await sendTableExport(req, res, { report: 'schools', format: body.format, columns: COLUMNS, selected: body.columns, rows, filters: body.filters });
  },
};
