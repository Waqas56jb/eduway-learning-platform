import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { likeContains, likePrefix } from '../../common/utils/like.js';

/** Actions considered sensitive in the audit KPI / `sensitive=true` filter. */
export const SENSITIVE_ACTION_PATTERNS = ['role.%', 'admin.%', 'settings.%', 'feature_flag.%', 'refund.%', 'student.grant_access', 'student.lock', 'student.block', 'export.%', 'legal_document.%', 'admin_session.%', 'security_alert.%'];

export interface AuditFilter {
  from?: string;
  to?: string;
  actor?: string;
  actorId?: string;
  entity?: string;
  entityId?: string;
  action?: string;
  sensitive?: boolean;
  q?: string;
  since?: string;
}

export function auditWhere(f: AuditFilter): { sql: string; params: unknown[] } {
  const w: string[] = [];
  const p: unknown[] = [];
  const add = (cond: (n: string) => string, v: unknown) => {
    p.push(v);
    w.push(cond(`$${p.length}`));
  };
  if (f.from) add((n) => `l.created_at >= ${n}::timestamptz`, f.from);
  if (f.to) add((n) => `l.created_at <= ${n}::timestamptz`, f.to);
  if (f.since) add((n) => `l.created_at > ${n}::timestamptz`, f.since);
  if (f.actor) add((n) => `l.actor_name = ${n}`, f.actor);
  if (f.actorId) add((n) => `l.actor_id = ${n}::uuid`, f.actorId);
  if (f.entity) add((n) => `l.entity = ${n}`, f.entity);
  if (f.entityId) add((n) => `l.entity_id = ${n}`, f.entityId);
  if (f.action) add((n) => `l.action LIKE ${n}`, likePrefix(f.action));
  if (f.sensitive) add((n) => `l.action LIKE ANY(${n}::text[])`, SENSITIVE_ACTION_PATTERNS);
  if (f.q) {
    add(
      (n) => `(lower(l.actor_name) LIKE ${n} OR lower(l.action) LIKE ${n} OR lower(l.entity) LIKE ${n} OR lower(coalesce(l.entity_id,'')) LIKE ${n} OR lower(l.summary) LIKE ${n} OR coalesce(l.ip,'') LIKE ${n})`,
      likeContains(f.q.toLowerCase()),
    );
  }
  return { sql: w.length ? `WHERE ${w.join(' AND ')}` : '', params: p };
}

export const AUDIT_SELECT = `SELECT l.*, u.kind AS actor_kind FROM ${T.audit_logs} l LEFT JOIN ${T.users} u ON u.id = l.actor_id`;

export const securityRepo = {
  async auditList(f: AuditFilter, order: string, limit: number, offset: number) {
    const { sql, params } = auditWhere(f);
    const [total, rows] = await Promise.all([
      db.scalar<number>(`SELECT count(*)::int FROM ${T.audit_logs} l ${sql}`, params),
      db.many<Record<string, unknown>>(`${AUDIT_SELECT} ${sql} ORDER BY ${order}, l.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]),
    ]);
    return { total: total ?? 0, rows };
  },
  async auditKpis(f: AuditFilter) {
    const { sql, params } = auditWhere({ ...f, since: undefined });
    params.push(SENSITIVE_ACTION_PATTERNS);
    return db.one<{ total: number; last24h: number; actors: number; sensitive: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE l.created_at > now() - interval '24 hours')::int AS last24h,
              count(DISTINCT coalesce(l.actor_id::text, l.actor_name))::int AS actors,
              count(*) FILTER (WHERE l.action LIKE ANY($${params.length}::text[]))::int AS sensitive
         FROM ${T.audit_logs} l ${sql}`,
      params,
    );
  },
  auditGet(id: string) {
    return db.maybeOne<Record<string, unknown>>(`${AUDIT_SELECT} WHERE l.id = $1`, [id]);
  },
  async auditFacets(from?: string, to?: string) {
    const { sql, params } = auditWhere({ from, to });
    const [actors, entities, actions] = await Promise.all([
      db.many<{ id: string | null; name: string }>(`SELECT DISTINCT l.actor_id AS id, l.actor_name AS name FROM ${T.audit_logs} l ${sql} ORDER BY 2 LIMIT 500`, params),
      db.many<{ entity: string }>(`SELECT DISTINCT l.entity FROM ${T.audit_logs} l ${sql} ORDER BY 1`, params),
      db.many<{ action: string }>(`SELECT DISTINCT l.action FROM ${T.audit_logs} l ${sql} ORDER BY 1`, params),
    ]);
    return { actors: actors.filter((a) => a.name), entities: entities.map((e) => e.entity), actions: actions.map((a) => a.action) };
  },

  // ── alerts ──
  async alerts(f: { kind?: string; severity?: string; status?: string; subjectType?: string; q?: string }, order: string, limit: number, offset: number) {
    const w: string[] = [`e.kind IN ('multiple_devices', 'otp_bruteforce', 'unusual_location', 'payment_fraud', 'admin_login_failure')`];
    const p: unknown[] = [];
    for (const k of ['kind', 'severity', 'status'] as const) {
      if (f[k]) {
        p.push(f[k]);
        w.push(`e.${k} = $${p.length}`);
      }
    }
    if (f.subjectType) {
      p.push(f.subjectType);
      w.push(`COALESCE(e.subject_type, u.kind::text) = $${p.length}`);
    }
    if (f.q) {
      p.push(likeContains(f.q.toLowerCase()));
      w.push(`(lower(e.subject_label) LIKE $${p.length} OR lower(e.detail) LIKE $${p.length})`);
    }
    const where = `WHERE ${w.join(' AND ')}`;
    const from = `FROM ${T.suspicious_events} e LEFT JOIN ${T.users} u ON u.id = e.user_id LEFT JOIN ${T.users} r ON r.id = e.resolved_by`;
    const [total, rows, stats] = await Promise.all([
      db.scalar<number>(`SELECT count(*)::int ${from} ${where}`, p),
      db.many<Record<string, unknown>>(
        `SELECT e.*, u.kind AS u_kind, u.name_en AS u_name_en, r.id AS r_id, r.name_en AS r_name_en, r.name_ar AS r_name_ar, r.avatar_url AS r_avatar_url
           ${from} ${where} ORDER BY ${order} LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
        [...p, limit, offset],
      ),
      db.one<{ open: number; open_critical_high: number; resolved: number; blocked: number }>(
        `SELECT count(*) FILTER (WHERE status = 'open')::int AS open,
                count(*) FILTER (WHERE status = 'open' AND severity IN ('critical', 'high'))::int AS open_critical_high,
                count(*) FILTER (WHERE status = 'resolved')::int AS resolved,
                count(*) FILTER (WHERE status = 'blocked')::int AS blocked
           FROM ${T.suspicious_events}`,
      ),
    ]);
    return { total: total ?? 0, rows, stats };
  },
  alertGet(id: string) {
    return db.maybeOne<Record<string, unknown>>(
      `SELECT e.*, u.kind AS u_kind, u.name_en AS u_name_en, r.id AS r_id, r.name_en AS r_name_en, r.name_ar AS r_name_ar, r.avatar_url AS r_avatar_url
         FROM ${T.suspicious_events} e LEFT JOIN ${T.users} u ON u.id = e.user_id LEFT JOIN ${T.users} r ON r.id = e.resolved_by
        WHERE e.id = $1`,
      [id],
    );
  },
  alertSetStatus(id: string, status: 'open' | 'resolved' | 'blocked', by: string | null, note: string | null) {
    return db.exec(
      `UPDATE ${T.suspicious_events} SET status = $2, resolved_by = $3, resolved_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() END, resolution_note = $4 WHERE id = $1`,
      [id, status, status === 'open' ? null : by, status === 'open' ? null : note],
    );
  },
};
