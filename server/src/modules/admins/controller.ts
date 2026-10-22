import type { Request, Response } from 'express';
import type { AdminPrincipal } from '../../common/types/index.js';
import { OK } from '../../common/dto/refs.js';
import { sendExport, type ExportColumn, type ExportRequest } from '../../common/services/exporter.js';
import { orderBy, toPagination } from '../../common/utils/pagination.js';
import { paged } from '../../common/utils/response.js';
import type { z } from '../../common/validation/zod.js';
import { adminLookups } from './lookups.js';
import type { adminListQuery } from './schemas.js';
import { adminsService } from './service.js';
import type { AdminUserDto } from './types.js';

const SORT = { name: 'u.name_en', email: 'u.email', lastLogin: 'au.last_login_at', createdAt: 'u.created_at', status: 'u.status', role: 'r.name_en', mfa: 'au.mfa_enabled' };

const EXPORT_COLUMNS: ExportColumn<AdminUserDto>[] = [
  { key: 'id', header: 'id', value: (r) => r.id },
  { key: 'name_en', header: 'name_en', value: (r) => r.name.en },
  { key: 'name_ar', header: 'name_ar', value: (r) => r.name.ar },
  { key: 'email', header: 'email', value: (r) => r.email },
  { key: 'mobile', header: 'mobile', value: (r) => r.mobile },
  { key: 'role', header: 'role', value: (r) => r.role.name.en },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'mfa', header: 'mfa', value: (r) => (r.mfaEnabled ? 'yes' : 'no') },
  { key: 'lastLogin', header: 'last_login', value: (r) => r.lastLogin },
  { key: 'created', header: 'created', value: (r) => r.createdAt },
];

type ListQuery = z.infer<typeof adminListQuery>;

export const adminsController = {
  me: (admin: AdminPrincipal) => adminsService.me(admin.userId),

  async updateMe(req: Request, admin: AdminPrincipal, body: Parameters<typeof adminsService.updateMe>[1]) {
    const before = await adminsService.get(admin.userId);
    const after = await adminsService.updateMe(admin.userId, body);
    req.audit = { action: 'admin.update_profile', entity: 'admin_user', entityId: admin.userId, summary: 'Updated own profile', before: { name: before.name, email: before.email, mobile: before.mobile }, after: { name: after.name, email: after.email, mobile: after.mobile } };
    return after;
  },

  async changePassword(req: Request, admin: AdminPrincipal, body: { currentPassword: string; newPassword: string }) {
    await adminsService.changePassword(admin, body.currentPassword, body.newPassword, req.ip ?? null);
    req.audit = { action: 'admin.change_password', entity: 'admin_user', entityId: admin.userId, summary: 'Changed own password', before: null, after: null };
    return OK;
  },

  setPreferences: (admin: AdminPrincipal, body: { language?: 'en' | 'ar'; theme?: 'light' | 'dark' | 'system'; emailAlerts?: boolean }) => adminsService.setPreferences(admin.userId, body),
  mySessions: (admin: AdminPrincipal) => adminsService.mySessions(admin),

  async inbox(admin: AdminPrincipal, q: { unread?: boolean; limit: number; cursor?: string }) {
    const r = await adminsService.inbox(admin.userId, q);
    return paged(r.items, { page: 1, pageSize: q.limit, total: r.items.length, nextCursor: r.nextCursor, unreadCount: r.unreadCount });
  },
  markRead: (admin: AdminPrincipal, id: string) => adminsService.markRead(admin.userId, id),
  markAllRead: (admin: AdminPrincipal) => adminsService.markAllRead(admin.userId),
  lookups: () => adminLookups(),

  async list(q: ListQuery) {
    const p = toPagination(q);
    const r = await adminsService.list({ roleId: q.roleId, status: q.status, q: q.q, sort: `${orderBy(q.sort, SORT, '-lastLogin')}, u.id`, limit: p.limit, offset: p.offset });
    return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null, stats: r.stats });
  },

  async invite(req: Request, admin: AdminPrincipal, body: Parameters<typeof adminsService.invite>[0]) {
    const dto = await adminsService.invite(body, admin);
    req.audit = { action: 'admin.invite', entity: 'admin_user', entityId: dto.id, summary: `Invited ${dto.email} as ${dto.role.name.en}`, before: null, after: { email: dto.email, role: dto.role.key } };
    return dto;
  },

  async resendInvite(req: Request, admin: AdminPrincipal, id: string) {
    await adminsService.resendInvite(id, admin);
    req.audit = { action: 'admin.resend_invite', entity: 'admin_user', entityId: id, summary: 'Resent invitation' };
    return OK;
  },

  async changeRole(req: Request, admin: AdminPrincipal, id: string, roleId: string) {
    const before = await adminsService.get(id);
    const after = await adminsService.changeRole(id, roleId, admin);
    req.audit = { action: 'admin.change_role', entity: 'admin_user', entityId: id, summary: `Changed role of ${after.email} to ${after.role.name.en}`, before: { role: before.role.key }, after: { role: after.role.key } };
    return after;
  },

  async resetMfa(req: Request, id: string) {
    const after = await adminsService.resetMfa(id, req.admin);
    req.audit = { action: 'admin.reset_mfa', entity: 'admin_user', entityId: id, summary: `Reset 2FA for ${after.email}`, before: { mfaEnabled: true }, after: { mfaEnabled: false } };
    return after;
  },

  async deactivate(req: Request, admin: AdminPrincipal, id: string, reason: string) {
    const after = await adminsService.deactivate(id, reason, admin);
    req.audit = { action: 'admin.deactivate', entity: 'admin_user', entityId: id, summary: `Deactivated ${after.email}: ${reason}`, before: { status: 'active' }, after: { status: 'deactivated', reason } };
    return after;
  },

  async activate(req: Request, id: string) {
    const after = await adminsService.activate(id);
    req.audit = { action: 'admin.reactivate', entity: 'admin_user', entityId: id, summary: `Reactivated ${after.email}`, before: { status: 'deactivated' }, after: { status: after.status } };
    return after;
  },

  async export(req: Request, res: Response, body: ExportRequest) {
    const f = (body.filters ?? {}) as Partial<ListQuery>;
    const r = await adminsService.list({ roleId: f.roleId, status: f.status, q: f.q, sort: `${orderBy(f.sort, SORT, '-lastLogin')}, u.id`, limit: 10_000, offset: 0 });
    const rows = body.ids?.length ? r.items.filter((a) => body.ids?.includes(a.id)) : r.items;
    await sendExport(req, res, { report: 'admins', format: body.format, columns: EXPORT_COLUMNS, selected: body.columns, rows, filters: body.filters });
  },
};
