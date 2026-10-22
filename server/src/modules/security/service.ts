import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { adminRef } from '../../common/dto/refs.js';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../common/errors/index.js';
import { hasPermission } from '../../common/middleware/rbac.js';
import { describeDevice } from '../../common/services/audit.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { ADMIN_SESSION_SELECT, sessions, toAdminSessionDto, type AdminSessionRow } from '../auth/sessions.js';
import { adminsService } from '../admins/service.js';
import { studentsService } from '../students/service.js';
import { securityRepo, type AuditFilter } from './repository.js';
import type { AuditLogDto, SecurityAlertDto } from './types.js';

export function toAuditDto(r: Record<string, unknown>): AuditLogDto {
  const kind = r.actor_kind as string | null;
  return {
    id: String(r.id),
    at: (r.created_at as Date).toISOString(),
    actor: String(r.actor_name || (kind ? '' : 'System')),
    actorId: (r.actor_id as string | null) ?? null,
    actorType: kind === 'admin' ? 'admin' : kind === 'student' ? 'student' : 'system',
    actorRole: String(r.actor_role ?? ''),
    action: String(r.action),
    entity: String(r.entity),
    entityId: String(r.entity_id ?? ''),
    summary: String(r.summary ?? ''),
    before: (r.before as Record<string, unknown> | null) ?? null,
    after: (r.after as Record<string, unknown> | null) ?? null,
    ip: String(r.ip ?? ''),
    device: String(r.device || describeDevice(r.user_agent as string | null)),
    platform: kind === 'admin' ? 'admin' : null,
    requestId: (r.request_id as string | null) ?? null,
  };
}

const ALERT_KINDS = new Set(['multiple_devices', 'otp_bruteforce', 'unusual_location', 'payment_fraud', 'admin_login_failure']);

function toAlertDto(r: Record<string, unknown>): SecurityAlertDto {
  const subjectType = (r.subject_type as string | null) ?? (r.u_kind as string | null) ?? null;
  return {
    id: String(r.id),
    kind: (ALERT_KINDS.has(String(r.kind)) ? r.kind : 'multiple_devices') as SecurityAlertDto['kind'],
    severity: r.severity as SecurityAlertDto['severity'],
    subject: String((r.u_name_en as string | null) || r.subject_label || ''),
    subjectId: (r.user_id as string | null) ?? null,
    subjectType: subjectType === 'student' || subjectType === 'admin' ? subjectType : null,
    detail: String(r.detail ?? ''),
    status: r.status as SecurityAlertDto['status'],
    resolvedBy: adminRef(r, 'r_'),
    resolvedAt: r.resolved_at ? (r.resolved_at as Date).toISOString() : null,
    resolutionReason: (r.resolution_note as string | null) ?? null,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

export const securityService = {
  async auditList(f: AuditFilter, order: string, limit: number, offset: number) {
    const [{ total, rows }, kpis] = await Promise.all([securityRepo.auditList(f, order, limit, offset), securityRepo.auditKpis(f)]);
    return { total, items: rows.map(toAuditDto), kpis };
  },
  async auditGet(id: string) {
    const r = await securityRepo.auditGet(id);
    if (!r) throw new NotFoundError('auditLog');
    return toAuditDto(r);
  },
  auditFacets: (from?: string, to?: string) => securityRepo.auditFacets(from, to),

  async adminSessions(f: { adminId?: string; q?: string }, order: string, limit: number, offset: number, current: AdminPrincipal) {
    const p: unknown[] = [];
    let where = '';
    if (f.adminId) {
      p.push(f.adminId);
      where += ` AND s.user_id = $${p.length}`;
    }
    if (f.q) {
      p.push(`%${f.q.toLowerCase()}%`);
      where += ` AND (lower(u.name_en) LIKE $${p.length} OR lower(u.email) LIKE $${p.length} OR coalesce(s.ip,'') LIKE $${p.length} OR lower(coalesce(s.device_name,'')) LIKE $${p.length})`;
    }
    const base = `${ADMIN_SESSION_SELECT}${where}`;
    const [total, rows, kpi] = await Promise.all([
      db.scalar<number>(`SELECT count(*)::int FROM (${base}) x`, p),
      db.many<AdminSessionRow>(`${base} ORDER BY ${order} LIMIT $${p.length + 1} OFFSET $${p.length + 2}`, [...p, limit, offset]),
      db.one<{ active: number; admins: number; mobile: number; abroad: number }>(
        `SELECT count(*)::int AS active, count(DISTINCT user_id)::int AS admins,
                count(*) FILTER (WHERE device_type <> 'desktop')::int AS mobile,
                count(*) FILTER (WHERE country_code IS NOT NULL AND country_code <> 'IQ')::int AS abroad
           FROM (${ADMIN_SESSION_SELECT}) x`,
      ),
    ]);
    return { total: total ?? 0, items: rows.map((r) => toAdminSessionDto(r, current.sessionId)), kpis: kpi };
  },

  async revokeAdminSession(id: string, current: AdminPrincipal) {
    if (id === current.sessionId) throw new BusinessRuleError('SELF_ACTION');
    const s = await sessions.get(id);
    if (!s || s.audience !== 'admin' || s.revoked_at) throw new NotFoundError('session');
    await sessions.revoke(id, 'admin_revoked', current.userId);
    return s;
  },

  async revokeAllAdminSessions(adminId: string | undefined, current: AdminPrincipal) {
    const targets = adminId ? [adminId] : (await db.many<{ id: string }>(`SELECT id FROM ${T.users} WHERE kind = 'admin'`)).map((r) => r.id);
    let revoked = 0;
    for (const id of targets) revoked += await sessions.revokeAll(id, 'admin_revoked_all', { exceptSessionId: current.sessionId, by: current.userId });
    return { revoked };
  },

  async alerts(f: { kind?: string; severity?: string; status?: string; subjectType?: string; q?: string }, order: string, limit: number, offset: number) {
    const r = await securityRepo.alerts(f, order, limit, offset);
    return { total: r.total, items: r.rows.map(toAlertDto), stats: { open: r.stats.open, openCriticalHigh: r.stats.open_critical_high, resolved: r.stats.resolved, blocked: r.stats.blocked } };
  },

  async alertGet(id: string) {
    const r = await securityRepo.alertGet(id);
    if (!r) throw new NotFoundError('securityAlert');
    return toAlertDto(r);
  },

  async resolve(id: string, reason: string, by: AdminPrincipal) {
    const before = await this.alertGet(id);
    await securityRepo.alertSetStatus(id, 'resolved', by.userId, reason);
    return { before, after: await this.alertGet(id) };
  },

  async reopen(id: string) {
    const before = await this.alertGet(id);
    await securityRepo.alertSetStatus(id, 'open', null, null);
    return { before, after: await this.alertGet(id) };
  },

  /** Block the subject: student → lock + revoke sessions; admin → deactivate. */
  async block(id: string, reason: string, by: AdminPrincipal) {
    const before = await this.alertGet(id);
    if (before.subjectId) {
      if (before.subjectType === 'admin') {
        await adminsService.deactivate(before.subjectId, reason, by);
      } else {
        if (!hasPermission(by, 'users.edit')) throw new ForbiddenError(undefined, { permission: 'users.edit' });
        await studentsService.setLocked([before.subjectId], true, reason, by);
      }
    }
    await securityRepo.alertSetStatus(id, 'blocked', by.userId, reason);
    return { before, after: await this.alertGet(id) };
  },
};
