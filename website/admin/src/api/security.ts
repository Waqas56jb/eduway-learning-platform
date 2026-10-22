/* Security module (contract §32): roles + permission catalog, admin users, audit logs, admin sessions,
 * suspicious-activity alerts. DTO → flat UI adapters keep the existing pages' shapes. */
import type { AdminSession, AdminUser, AuditLog, ModuleKey, PermAction, PermissionMatrix, Role, SecurityAlert } from '@/types';
import { roleFromDto } from '@/store/auth';
import { api, type Query } from './client';
import { useApiQuery } from './hooks';
import { qk } from './keys';
import type { AdminRef, AdminUserDto, ClientPlatform, ID, ISODate, Localized, OkDto, PageMeta, RoleDto } from './types';

// ─── DTOs (§32) ──────────────────────────────────────────────────────────────
export interface AuditLogDto {
  id: ID;
  at: ISODate;
  actor: string;
  actorId: ID | null;
  actorType: 'admin' | 'student' | 'system';
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string;
  device: string;
  platform: ClientPlatform | null;
  requestId: string | null;
}

export interface AdminSessionRowDto {
  id: ID;
  admin: AdminRef & { email: string };
  device: string;
  browser: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  ip: string;
  location: string;
  countryCode: string | null;
  abroad: boolean;
  startedAt: ISODate;
  lastActive: ISODate;
  current: boolean;
}

export interface SecurityAlertDto {
  id: ID;
  kind: SecurityAlert['kind'];
  severity: SecurityAlert['severity'];
  subject: string;
  subjectId: ID | null;
  subjectType: 'student' | 'admin' | null;
  detail: string;
  status: SecurityAlert['status'];
  resolvedBy: AdminRef | null;
  resolvedAt: ISODate | null;
  resolutionReason: string | null;
  createdAt: ISODate;
}

export interface PermissionCatalogDto {
  modules: ModuleKey[];
  actions: PermAction[];
  labels: Record<ModuleKey, Localized>;
}

export interface RoleWrite {
  key: string;
  name: Localized;
  description?: Localized;
  permissions: PermissionMatrix;
}

// ─── UI view models ──────────────────────────────────────────────────────────
export interface RoleVM extends Role {
  updatedAt: string;
  assignedAdmins: { id: ID; name: string; name_ar: string; avatar: string }[];
  assignedCount: number;
  grantedCount: number;
}
export interface AdminUserVM extends AdminUser {
  roleKey: string;
  roleName_en: string;
  roleName_ar: string;
}
export interface AuditLogVM extends AuditLog {
  actorId: ID | null;
  actorType: AuditLogDto['actorType'];
  platform: ClientPlatform | null;
  requestId: string | null;
}
export interface AdminSessionVM extends AdminSession {
  adminName: string;
  adminName_ar: string;
  adminEmail: string;
  adminAvatar: string;
  deviceType: AdminSessionRowDto['deviceType'];
  abroad: boolean;
  countryCode: string | null;
}
export interface SecurityAlertVM extends SecurityAlert {
  subjectType: SecurityAlertDto['subjectType'];
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
}

// ─── adapters ────────────────────────────────────────────────────────────────
export const toRoleVM = (r: RoleDto): RoleVM => ({
  ...roleFromDto(r),
  updatedAt: r.updatedAt,
  assignedAdmins: (r.assignedAdmins ?? []).map((a) => ({ id: a.id, name: a.name.en, name_ar: a.name.ar, avatar: a.avatarUrl ?? '' })),
  assignedCount: r.assignedCount ?? 0,
  grantedCount: r.grantedCount ?? 0,
});

export const toAdminUserVM = (a: AdminUserDto): AdminUserVM => ({
  id: a.id,
  name: a.name.en,
  name_ar: a.name.ar,
  email: a.email,
  mobile: a.mobile ?? '',
  roleId: a.roleId,
  avatar: a.avatarUrl ?? '',
  mfaEnabled: a.mfaEnabled,
  status: a.status,
  lastLogin: a.lastLogin,
  createdAt: a.createdAt,
  roleKey: a.role?.key ?? '',
  roleName_en: a.role?.name.en ?? '',
  roleName_ar: a.role?.name.ar ?? '',
});

export const toAuditLogVM = (l: AuditLogDto): AuditLogVM => ({
  id: l.id,
  at: l.at,
  actor: l.actor,
  actorRole: l.actorRole,
  action: l.action,
  entity: l.entity,
  entityId: l.entityId,
  summary: l.summary,
  before: l.before,
  after: l.after,
  ip: l.ip,
  device: l.device,
  actorId: l.actorId,
  actorType: l.actorType,
  platform: l.platform,
  requestId: l.requestId,
});

export const toSessionVM = (s: AdminSessionRowDto): AdminSessionVM => ({
  id: s.id,
  adminId: s.admin.id,
  device: s.device,
  browser: s.browser,
  ip: s.ip,
  location: s.location,
  startedAt: s.startedAt,
  lastActive: s.lastActive,
  current: s.current,
  adminName: s.admin.name.en,
  adminName_ar: s.admin.name.ar,
  adminEmail: s.admin.email,
  adminAvatar: s.admin.avatarUrl ?? '',
  deviceType: s.deviceType,
  abroad: s.abroad,
  countryCode: s.countryCode,
});

export const toAlertVM = (a: SecurityAlertDto): SecurityAlertVM => ({
  id: a.id,
  kind: a.kind,
  severity: a.severity,
  subject: a.subject,
  subjectId: a.subjectId,
  detail: a.detail,
  status: a.status,
  createdAt: a.createdAt,
  subjectType: a.subjectType,
  resolvedBy: a.resolvedBy?.name.en ?? null,
  resolvedAt: a.resolvedAt,
  resolutionReason: a.resolutionReason,
});

// ─── endpoints ───────────────────────────────────────────────────────────────
export type RolesMeta = PageMeta & { customCount?: number; assignedAdmins?: number };
export type AdminsMeta = PageMeta & { stats?: { total: number; active: number; mfaPct: number; invited: number } };
export type AuditMeta = PageMeta & { kpis?: { total: number; last24h: number; actors: number; sensitive: number } };
export type SessionsMeta = PageMeta & { kpis?: { active: number; admins: number; mobile: number; abroad: number } };
export type AlertsMeta = PageMeta & { stats?: { open: number; openCriticalHigh: number; resolved: number; blocked: number } };

export const securityApi = {
  // roles
  roles: async () => {
    const r = await api.list<RoleDto>('/admin/roles', { pageSize: 100 });
    return { items: r.items.map(toRoleVM), meta: r.meta as RolesMeta };
  },
  role: async (id: ID) => toRoleVM(await api.get<RoleDto>(`/admin/roles/${id}`)),
  createRole: async (body: RoleWrite) => toRoleVM(await api.post<RoleDto>('/admin/roles', body)),
  updateRole: async (id: ID, body: RoleWrite) => toRoleVM(await api.put<RoleDto>(`/admin/roles/${id}`, body)),
  cloneRole: async (id: ID) => toRoleVM(await api.post<RoleDto>(`/admin/roles/${id}/clone`)),
  deleteRole: (id: ID, confirmKey: string) => api.delete<OkDto>(`/admin/roles/${id}`, { data: { confirmKey } }),
  catalog: () => api.get<PermissionCatalogDto>('/admin/permissions/catalog'),

  // admins
  admins: async (p: Query) => {
    const r = await api.list<AdminUserDto>('/admin/admins', p);
    return { items: r.items.map(toAdminUserVM), meta: r.meta as AdminsMeta };
  },
  invite: async (body: { name: Localized; email: string; roleId: ID; mobile?: string | null }) =>
    toAdminUserVM(await api.post<AdminUserDto>('/admin/admins/invite', body)),
  resendInvite: (id: ID) => api.post<OkDto>(`/admin/admins/${id}/resend-invite`),
  changeRole: async (id: ID, roleId: ID) => toAdminUserVM(await api.patch<AdminUserDto>(`/admin/admins/${id}/role`, { roleId })),
  resetMfa: async (id: ID) => toAdminUserVM(await api.post<AdminUserDto>(`/admin/admins/${id}/reset-mfa`)),
  deactivate: async (id: ID, reason: string) => toAdminUserVM(await api.post<AdminUserDto>(`/admin/admins/${id}/deactivate`, { reason })),
  activate: async (id: ID) => toAdminUserVM(await api.post<AdminUserDto>(`/admin/admins/${id}/activate`)),

  // audit
  auditLogs: async (p: Query) => {
    const r = await api.list<AuditLogDto>('/admin/audit-logs', p);
    return { items: r.items.map(toAuditLogVM), meta: r.meta as AuditMeta };
  },
  auditLog: async (id: ID) => toAuditLogVM(await api.get<AuditLogDto>(`/admin/audit-logs/${id}`)),
  auditFacets: (p: Query) => api.get<{ actors: { id: ID | null; name: string }[]; entities: string[]; actions: string[] }>('/admin/audit-logs/facets', p),

  // admin sessions
  sessions: async (p: Query) => {
    const r = await api.list<AdminSessionRowDto>('/admin/admin-sessions', p);
    return { items: r.items.map(toSessionVM), meta: r.meta as SessionsMeta };
  },
  revokeSession: (id: ID) => api.delete<OkDto>(`/admin/admin-sessions/${id}`),
  revokeAllSessions: (adminId?: ID) => api.post<{ revoked: number }>('/admin/admin-sessions/revoke-all', { adminId, exceptCurrent: true }),

  // alerts
  alerts: async (p: Query) => {
    const r = await api.list<SecurityAlertDto>('/admin/security-alerts', p);
    return { items: r.items.map(toAlertVM), meta: r.meta as AlertsMeta };
  },
  resolveAlert: async (id: ID, reason: string) => toAlertVM(await api.post<SecurityAlertDto>(`/admin/security-alerts/${id}/resolve`, { reason })),
  blockAlert: async (id: ID, reason: string) => toAlertVM(await api.post<SecurityAlertDto>(`/admin/security-alerts/${id}/block`, { reason })),
  reopenAlert: async (id: ID) => toAlertVM(await api.post<SecurityAlertDto>(`/admin/security-alerts/${id}/reopen`)),
};

// ─── hooks ───────────────────────────────────────────────────────────────────
export const useRolesQuery = () => useApiQuery(qk.roles.list({ all: true }), securityApi.roles);
export const useRoleQuery = (id?: ID) => useApiQuery(qk.roles.detail(id), () => securityApi.role(id as ID), { enabled: !!id });
export const usePermissionCatalog = () => useApiQuery(qk.roles.sub('catalog'), securityApi.catalog, { staleTime: 10 * 60_000 });
export const useAuditFacets = (p: Query) => useApiQuery(qk.audit.sub('facets', p), () => securityApi.auditFacets(p), { staleTime: 60_000 });
