import type { Request, Response } from 'express';
import { OK } from '../../common/dto/refs.js';
import { sendExport, type ExportColumn, type ExportRequest } from '../../common/services/exporter.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { orderBy, toPagination } from '../../common/utils/pagination.js';
import { paged } from '../../common/utils/response.js';
import type { AdminSessionDto } from '../auth/sessions.js';
import type { AuditListQuery } from './schemas.js';
import { securityService } from './service.js';
import type { AuditLogDto } from './types.js';

const AUDIT_SORT = { at: 'l.created_at', actor: 'l.actor_name', action: 'l.action', entity: 'l.entity', entityId: 'l.entity_id', ip: 'l.ip', device: 'l.device', actorRole: 'l.actor_role' };
const SESSION_SORT = { lastActive: 's.last_seen_at', startedAt: 's.created_at', admin: 'u.name_en', name: 'u.name_en', device: 's.device_name', browser: 's.browser', ip: 's.ip', location: 's.location' };
const ALERT_SORT = { createdAt: 'e.created_at', status: 'e.status', kind: 'e.kind', subject: 'e.subject_label', severity: `array_position(ARRAY['critical','high','medium','low'], e.severity)` };

const AUDIT_COLUMNS: ExportColumn<AuditLogDto>[] = [
  { key: 'at', header: 'at', value: (r) => r.at },
  { key: 'actor', header: 'actor', value: (r) => r.actor },
  { key: 'role', header: 'role', value: (r) => r.actorRole },
  { key: 'action', header: 'action', value: (r) => r.action },
  { key: 'entity', header: 'entity', value: (r) => r.entity },
  { key: 'entity_id', header: 'entity_id', value: (r) => r.entityId },
  { key: 'summary', header: 'summary', value: (r) => r.summary },
  { key: 'ip', header: 'ip', value: (r) => r.ip },
  { key: 'device', header: 'device', value: (r) => r.device },
];

const SESSION_COLUMNS: ExportColumn<AdminSessionDto>[] = [
  { key: 'admin', header: 'admin', value: (r) => r.admin.name.en },
  { key: 'email', header: 'email', value: (r) => r.admin.email },
  { key: 'device', header: 'device', value: (r) => r.device },
  { key: 'browser', header: 'browser', value: (r) => r.browser },
  { key: 'ip', header: 'ip', value: (r) => r.ip },
  { key: 'location', header: 'location', value: (r) => r.location },
  { key: 'startedAt', header: 'started_at', value: (r) => r.startedAt },
  { key: 'lastActive', header: 'last_active', value: (r) => r.lastActive },
];

export const securityController = {
  async auditList(q: AuditListQuery) {
    const p = toPagination(q);
    const order = q.since ? 'l.created_at DESC' : orderBy(q.sort, AUDIT_SORT, '-at');
    const r = await securityService.auditList(q, order, p.limit, p.offset);
    return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null, kpis: r.kpis });
  },
  auditGet: (id: string) => securityService.auditGet(id),
  auditFacets: (from?: string, to?: string) => securityService.auditFacets(from, to),
  async auditExport(req: Request, res: Response, body: ExportRequest) {
    const f = (body.filters ?? {}) as Partial<AuditListQuery>;
    const r = await securityService.auditList(f, orderBy(f.sort, AUDIT_SORT, '-at'), 50_000, 0);
    const rows = body.ids?.length ? r.items.filter((x) => body.ids?.includes(x.id)) : r.items;
    await sendExport(req, res, { report: 'audit', format: body.format, columns: AUDIT_COLUMNS, selected: body.columns, rows, filters: body.filters, from: f.from, to: f.to });
  },

  async adminSessions(q: { adminId?: string; q?: string; sort?: string; page: number; pageSize: number }, admin: AdminPrincipal) {
    const p = toPagination(q);
    const r = await securityService.adminSessions(q, orderBy(q.sort, SESSION_SORT, '-lastActive'), p.limit, p.offset, admin);
    return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null, kpis: r.kpis });
  },
  async revokeAdminSession(req: Request, admin: AdminPrincipal, id: string) {
    const s = await securityService.revokeAdminSession(id, admin);
    req.audit = { action: 'admin_session.revoke', entity: 'admin_session', entityId: id, summary: `Revoked admin session (${s.device_name ?? 'device'})`, before: { sessionId: id, userId: s.user_id }, after: null };
    return OK;
  },
  async revokeAll(req: Request, admin: AdminPrincipal, adminId?: string) {
    const r = await securityService.revokeAllAdminSessions(adminId, admin);
    req.audit = { action: 'admin_session.revoke_all', entity: 'admin_session', entityId: adminId ?? null, summary: `Revoked ${r.revoked} admin sessions`, before: null, after: r };
    return r;
  },
  async sessionsExport(req: Request, res: Response, admin: AdminPrincipal, body: ExportRequest) {
    const f = (body.filters ?? {}) as { adminId?: string; q?: string; sort?: string };
    const r = await securityService.adminSessions(f, orderBy(f.sort, SESSION_SORT, '-lastActive'), 10_000, 0, admin);
    const rows = body.ids?.length ? r.items.filter((x) => body.ids?.includes(x.id)) : r.items;
    await sendExport(req, res, { report: 'admin-sessions', format: body.format, columns: SESSION_COLUMNS, selected: body.columns, rows, filters: body.filters });
  },

  async alerts(q: { kind?: string; severity?: string; status?: string; subjectType?: string; q?: string; sort?: string; page: number; pageSize: number }) {
    const p = toPagination(q);
    const order = q.sort ? orderBy(q.sort, ALERT_SORT, '-createdAt') : `${ALERT_SORT.severity} ASC, e.created_at DESC`;
    const r = await securityService.alerts(q, order, p.limit, p.offset);
    return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null, stats: r.stats });
  },
  async resolve(req: Request, admin: AdminPrincipal, id: string, reason: string) {
    const r = await securityService.resolve(id, reason, admin);
    req.audit = { action: 'security_alert.resolve', entity: 'security_alert', entityId: id, summary: `Resolved alert: ${reason}`, before: { status: r.before.status }, after: { status: r.after.status, reason } };
    return r.after;
  },
  async block(req: Request, admin: AdminPrincipal, id: string, reason: string) {
    const r = await securityService.block(id, reason, admin);
    req.audit = { action: 'security_alert.block', entity: 'security_alert', entityId: id, summary: `Blocked ${r.after.subject}: ${reason}`, before: { status: r.before.status }, after: { status: r.after.status, reason } };
    return r.after;
  },
  async reopen(req: Request, id: string) {
    const r = await securityService.reopen(id);
    req.audit = { action: 'security_alert.reopen', entity: 'security_alert', entityId: id, summary: 'Reopened alert', before: { status: r.before.status }, after: { status: r.after.status } };
    return r.after;
  },
};
