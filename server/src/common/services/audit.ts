/**
 * Audit trail writer (eduway_platform_audit_logs). The audit middleware calls it automatically for every
 * successful admin mutation; services may call `auditService.record()` directly for richer entries
 * (it then marks the request so the middleware does not write a duplicate).
 */
import type { Request } from 'express';
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import type { AdminPrincipal } from '../types/index.js';

export interface AuditEntry {
  actorId?: string | null;
  actorName?: string;
  actorRole?: string;
  action: string;
  entity: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  device?: string | null;
  requestId?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
}

const SECRET_KEYS = /pass(word)?|secret|token|otp|totp|code_hash|mfa|authorization|refresh/i;
const MAX_JSON = 20_000;

/** Remove secrets and cap size before persisting before/after snapshots. */
export function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > 6) return '[depth]';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => sanitizeForAudit(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? '[REDACTED]' : sanitizeForAudit(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`;
  return value;
}

function toJson(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = JSON.stringify(sanitizeForAudit(v));
  return s.length > MAX_JSON ? JSON.stringify({ truncated: true, preview: s.slice(0, 2000) }) : s;
}

export function describeDevice(userAgent: string | undefined | null): string {
  if (!userAgent) return '';
  const ua = userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /okhttp|Expo|ReactNative/i.test(ua) ? 'EDUWAY App' : 'Client';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua) ? 'macOS' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

export const auditService = {
  async record(entry: AuditEntry, ex?: Executor): Promise<void> {
    try {
      await db.query(
        `INSERT INTO ${T.audit_logs}
           (actor_id, actor_name, actor_role, action, entity, entity_id, summary, before, after, ip, user_agent, device,
            request_id, method, path, status_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15,$16)`,
        [
          entry.actorId ?? null,
          entry.actorName ?? '',
          entry.actorRole ?? '',
          entry.action,
          entry.entity,
          entry.entityId ?? null,
          entry.summary ?? '',
          toJson(entry.before),
          toJson(entry.after),
          entry.ip ?? null,
          entry.userAgent ?? null,
          entry.device ?? describeDevice(entry.userAgent),
          entry.requestId ?? null,
          entry.method ?? null,
          entry.path ?? null,
          entry.statusCode ?? null,
        ],
        ex,
      );
    } catch (err) {
      // Audit failures must never break the user-facing action — but they are logged loudly.
      logger.error({ err: (err as Error).message, action: entry.action }, 'audit log write failed');
    }
  },

  /** Convenience: entry pre-filled from the request + admin principal. Marks the request as audited. */
  async fromRequest(req: Request, e: Omit<AuditEntry, 'actorId' | 'actorName' | 'actorRole' | 'ip' | 'userAgent' | 'requestId' | 'method' | 'path'>, ex?: Executor): Promise<void> {
    const admin: AdminPrincipal | undefined = req.admin;
    req.auditWritten = true;
    await this.record(
      {
        ...e,
        actorId: admin?.userId ?? req.student?.userId ?? null,
        actorName: admin?.name ?? '',
        actorRole: admin?.roleName ?? (req.student ? 'Student' : ''),
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0] ?? null,
      },
      ex,
    );
  },
};
