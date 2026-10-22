import type { Request, Response } from 'express';
import { OK } from '../../common/dto/refs.js';
import { sendExport, type ExportColumn, type ExportRequest } from '../../common/services/exporter.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { orderBy, toPagination } from '../../common/utils/pagination.js';
import { paged } from '../../common/utils/response.js';
import type { StudentFilter } from './repository.js';
import type { StudentListQuery, TicketListQuery } from './schemas.js';
import { studentsService } from './service.js';
import { supportService } from './support.js';
import type { AdminStudentRow, SupportTicketDto } from './types.js';

const TICKET_COLUMNS: ExportColumn<SupportTicketDto>[] = [
  { key: 'id', header: 'ticket', value: (r) => r.id },
  { key: 'createdAt', header: 'created', value: (r) => r.createdAt },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'priority', header: 'priority', value: (r) => r.priority },
  { key: 'category', header: 'category', value: (r) => r.category },
  { key: 'source', header: 'source', value: (r) => r.source },
  { key: 'subject', header: 'subject', value: (r) => r.subject.en },
  { key: 'requester', header: 'requester', value: (r) => r.student?.name.en ?? r.contact?.name ?? '' },
  { key: 'contact', header: 'contact', value: (r) => r.student?.mobile ?? r.contact?.contact ?? '' },
  { key: 'assignee', header: 'assignee', value: (r) => r.assignee?.name.en ?? '' },
  { key: 'replies', header: 'replies', value: (r) => r.replies },
  { key: 'resolvedAt', header: 'resolved_at', value: (r) => r.resolvedAt },
  { key: 'message', header: 'message', value: (r) => r.message },
];

const SORT = { name: 'u.name_en', mobile: 'u.phone', createdAt: 'u.created_at', lastActive: 'u.last_active_at', subscriptionStatus: 'sub.sub_status' };

const EXPORT_COLUMNS: ExportColumn<AdminStudentRow>[] = [
  { key: 'id', header: 'id', value: (r) => r.id },
  { key: 'name_en', header: 'name_en', value: (r) => r.name.en },
  { key: 'name_ar', header: 'name_ar', value: (r) => r.name.ar },
  { key: 'mobile', header: 'mobile', value: (r) => r.mobile },
  { key: 'governorate', header: 'governorate', value: (r) => r.governorate.name.en },
  { key: 'school', header: 'school', value: (r) => r.school?.name.en ?? r.schoolName },
  { key: 'package', header: 'package', value: (r) => r.package?.name.en },
  { key: 'status', header: 'status', value: (r) => r.subscriptionStatus },
  { key: 'locked', header: 'locked', value: (r) => (r.locked ? 'yes' : 'no') },
  { key: 'source', header: 'source', value: (r) => r.source },
  { key: 'referralCode', header: 'referralCode', value: (r) => r.referralCode },
  { key: 'platforms', header: 'platforms', value: (r) => r.platforms.join('|') },
  { key: 'lastActive', header: 'lastActive', value: (r) => r.lastActive },
  { key: 'created', header: 'created', value: (r) => r.createdAt },
];

const filterOf = (q: Partial<StudentListQuery>): StudentFilter => ({
  q: q.q,
  status: q.status,
  packageId: q.packageId,
  governorateId: q.governorateId,
  schoolId: q.schoolId,
  marketerId: q.marketerId,
  source: q.source,
  platform: q.platform,
  createdFrom: q.createdFrom,
  createdTo: q.createdTo,
  lastActiveBefore: q.lastActiveBefore,
});

export const studentsController = {
  async list(q: StudentListQuery) {
    const p = toPagination(q);
    const r = await studentsService.list(filterOf(q), orderBy(q.sort, SORT, '-createdAt'), p.limit, p.offset);
    return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null });
  },
  stats: () => studentsService.stats(),

  async export(req: Request, res: Response, body: ExportRequest) {
    const f = filterOf((body.filters ?? {}) as Partial<StudentListQuery>);
    if (body.ids?.length) f.ids = body.ids;
    const r = await studentsService.list(f, orderBy((body.filters as { sort?: string } | undefined)?.sort, SORT, '-createdAt'), 50_000, 0);
    await sendExport(req, res, { report: 'students', format: body.format, columns: EXPORT_COLUMNS, selected: body.columns, rows: r.items, filters: body.filters });
  },

  async bulkLock(req: Request, admin: AdminPrincipal, ids: string[], reason: string) {
    const r = await studentsService.setLocked(ids, true, reason, admin);
    req.audit = { action: 'student.bulk_lock', entity: 'student', entityId: null, summary: `Locked ${r.succeeded.length} students: ${reason}`, before: null, after: { ids: r.succeeded, reason } };
    return r;
  },
  async bulkUnlock(req: Request, admin: AdminPrincipal, ids: string[], reason?: string) {
    const r = await studentsService.setLocked(ids, false, null, admin);
    req.audit = { action: 'student.bulk_unlock', entity: 'student', entityId: null, summary: `Unlocked ${r.succeeded.length} students`, before: null, after: { ids: r.succeeded, reason } };
    return r;
  },

  detail: (id: string) => studentsService.detail(id),

  async lock(req: Request, admin: AdminPrincipal, id: string, reason: string) {
    await studentsService.setLocked([id], true, reason, admin);
    const after = await studentsService.detail(id);
    req.audit = { action: req.get('x-audit-action') === 'student.block' ? 'student.block' : 'student.lock', entity: 'student', entityId: id, summary: `Locked ${after.name.en}: ${reason}`, before: { locked: false }, after: { locked: true, reason } };
    return after;
  },
  async unlock(req: Request, admin: AdminPrincipal, id: string, reason?: string) {
    await studentsService.setLocked([id], false, null, admin);
    const after = await studentsService.detail(id);
    req.audit = { action: 'student.unlock', entity: 'student', entityId: id, summary: `Unlocked ${after.name.en}${reason ? `: ${reason}` : ''}`, before: { locked: true }, after: { locked: false } };
    return after;
  },

  sessions: (id: string) => studentsService.sessions(id),
  async revokeSession(req: Request, admin: AdminPrincipal, id: string, sessionId: string) {
    await studentsService.revokeSession(id, sessionId, admin);
    req.audit = { action: 'student.force_logout', entity: 'student', entityId: id, summary: 'Forced logout of one session', before: { sessionId }, after: null };
    return OK;
  },
  async revokeAll(req: Request, admin: AdminPrincipal, id: string, reason?: string) {
    const r = await studentsService.revokeAll(id, admin);
    req.audit = { action: 'student.logout_all', entity: 'student', entityId: id, summary: `Forced logout on all devices${reason ? `: ${reason}` : ''}`, before: { sessions: r.revoked }, after: { sessions: 0 } };
    return r;
  },

  notes: (id: string) => studentsService.notes(id),
  async addNote(req: Request, admin: AdminPrincipal, id: string, body: string) {
    const note = await studentsService.addNote(id, body, admin);
    req.audit = { action: 'student.add_note', entity: 'student', entityId: id, summary: 'Added support note', before: null, after: { noteId: note.id } };
    return note;
  },

  async grant(req: Request, admin: AdminPrincipal, id: string, body: { subjectId: string; days: number; reason: string }) {
    const r = await studentsService.grantAccess(id, body, admin);
    req.audit = { action: 'student.grant_access', entity: 'student', entityId: id, summary: `Manual access for ${body.days} days — ${body.reason}`, before: null, after: body };
    return r;
  },
  async revokeGrant(req: Request, admin: AdminPrincipal, id: string, entitlementId: string, reason?: string) {
    const r = await studentsService.revokeAccess(id, entitlementId, reason, admin);
    req.audit = { action: 'student.revoke_access', entity: 'student', entityId: id, summary: `Revoked manual access${reason ? `: ${reason}` : ''}`, before: { entitlementId }, after: null };
    return r;
  },
  entitlementLogs: (id: string) => studentsService.entitlementLogs(id),

  async attribution(req: Request, id: string, body: { schoolId: string | null; referralCode: string | null; reason: string }) {
    const before = await studentsService.detail(id);
    const after = await studentsService.changeAttribution(id, body);
    req.audit = {
      action: 'student.change_attribution',
      entity: 'student',
      entityId: id,
      summary: `Changed attribution: ${body.reason}`,
      before: { schoolId: before.schoolId, referralCode: before.referralCode, source: before.source, marketerId: before.marketerId },
      after: { schoolId: after.schoolId, referralCode: after.referralCode, source: after.source, marketerId: after.marketerId },
    };
    return after;
  },
  async resetOtp(req: Request, id: string) {
    const r = await studentsService.resetOtp(id);
    req.audit = { action: 'student.reset_otp', entity: 'student', entityId: id, summary: 'Reset OTP failures / lockout' };
    return r;
  },
  activity: (id: string, limit: number, days: number) => studentsService.activity(id, limit, days),
  async transactions(id: string, q: { page: number; pageSize: number; sort?: string }) {
    const p = toPagination(q);
    const r = await studentsService.transactions(id, orderBy(q.sort, { createdAt: 'pay.created_at', amount: 'pay.total', status: 'pay.status' }, '-createdAt'), p.limit, p.offset);
    return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null });
  },
  async update(req: Request, id: string, body: Parameters<typeof studentsService.update>[1]) {
    const before = await studentsService.detail(id);
    const after = await studentsService.update(id, body);
    req.audit = { action: 'student.update', entity: 'student', entityId: id, summary: 'Updated student profile', before: { name: before.name, email: before.email, gender: before.gender, governorateId: before.governorateId, schoolName: before.schoolName }, after: { name: after.name, email: after.email, gender: after.gender, governorateId: after.governorateId, schoolName: after.schoolName } };
    return after;
  },

  // ── support tickets (ADM-SUP-*) ──
  async tickets(q: TicketListQuery) {
    const p = toPagination(q);
    const r = await supportService.list({ ...q, limit: p.limit, offset: p.offset });
    return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null, counts: r.counts });
  },
  ticket: (id: string) => supportService.detail(id),
  async updateTicket(req: Request, id: string, body: { status?: string; priority?: string; assigneeId?: string | null }) {
    const r = await supportService.update(id, body);
    req.audit = { action: 'support_ticket.update', entity: 'support_ticket', entityId: r.after.id, summary: `Updated ticket ${r.after.id}`, before: { status: r.before.status, priority: r.before.priority, assignee: r.before.assignee?.id ?? null }, after: { status: r.after.status, priority: r.after.priority, assignee: r.after.assignee?.id ?? null } };
    return r.after;
  },
  async replyTicket(req: Request, admin: AdminPrincipal, id: string, body: { body: string; status?: 'open' | 'pending' | 'resolved' }) {
    const r = await supportService.reply(id, admin, body);
    req.audit = { action: 'support_ticket.reply', entity: 'support_ticket', entityId: r.after.id, summary: `Replied to ticket ${r.after.id}${r.notified ? ' (student notified)' : ''}`, before: { status: r.before.status }, after: { status: r.after.status, reply: body.body.slice(0, 500), notified: r.notified } };
    return r.after;
  },
  async removeTicket(req: Request, id: string) {
    const before = await supportService.remove(id);
    req.audit = { action: 'support_ticket.delete', entity: 'support_ticket', entityId: before.id, summary: `Deleted ticket ${before.id}`, before: { subject: before.subject.en, status: before.status, source: before.source }, after: null };
    return OK;
  },
  async exportTickets(req: Request, res: Response, body: ExportRequest) {
    const f = (body.filters ?? {}) as Partial<TicketListQuery> & { sort?: string };
    const rows = await supportService.exportRows({ ...f, ids: body.ids?.length ? body.ids : undefined });
    await sendExport(req, res, { report: 'support_tickets', format: body.format, columns: TICKET_COLUMNS, selected: body.columns, rows, filters: body.filters });
  },
};
