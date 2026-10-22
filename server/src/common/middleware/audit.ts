/**
 * Audit trail for admin mutations.
 *
 * 1. `adminAuditTrail` (global, mounted in app.ts): after ANY successful (<400) POST/PUT/PATCH/DELETE made by an
 *    admin, writes an audit_logs row — using `req.audit` if a route/handler described the change, otherwise a
 *    generic entry (`<METHOD> <route>` with the sanitized request body as `after`).
 * 2. `audit({...})` (per route, via the route builder): describes action/entity/id and captures the BEFORE state
 *    (loader) and the AFTER state (the response `data`).
 * 3. Handlers can enrich: `req.audit = { ...req.audit, summary: 'Granted 30 days' }`, or call
 *    `auditService.fromRequest(req, {...})` themselves (then nothing else is written).
 */
import type { NextFunction, Request, Response } from 'express';
import { auditService } from '../services/audit.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface AuditOptions<Req extends Request = Request> {
  /** e.g. 'student.lock' */
  action: string;
  /** e.g. 'student' */
  entity: string;
  /** Defaults to req.params.id */
  entityId?: (req: Req) => string | undefined | null;
  /** Load the current state before the handler runs (for the diff). */
  before?: (req: Req) => Promise<unknown>;
  summary?: (req: Req, responseData: unknown) => string;
}

export function audit(opts: AuditOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = req.params as Record<string, string | undefined>;
    const entityId = opts.entityId ? opts.entityId(req) : (params.id ?? null);
    const before = opts.before ? await opts.before(req).catch(() => null) : undefined;
    req.audit = { action: opts.action, entity: opts.entity, entityId, before, ...req.audit };

    // Capture the response data as the AFTER snapshot.
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      const data = (body as { data?: unknown } | null)?.data;
      if (req.audit && req.audit.after === undefined) req.audit.after = data ?? null;
      if (req.audit && opts.summary && !req.audit.summary) {
        try {
          req.audit.summary = opts.summary(req, data);
        } catch {
          /* ignore */
        }
      }
      return originalJson(body);
    };
    next();
  };
}

export function adminAuditTrail(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method)) return next();
  res.on('finish', () => {
    if (!req.admin || req.auditWritten || res.statusCode >= 400) return;
    req.auditWritten = true;
    const routePath = (req.route as { path?: string } | undefined)?.path ?? req.path;
    const a = req.audit;
    void auditService.record({
      actorId: req.admin.userId,
      actorName: req.admin.name,
      actorRole: req.admin.roleName,
      action: a?.action ?? `${req.method.toLowerCase()} ${routePath}`,
      entity: a?.entity ?? (routePath.split('/').filter(Boolean)[0] ?? 'unknown'),
      entityId: a?.entityId ?? (req.params as Record<string, string | undefined>).id ?? null,
      summary: a?.summary ?? '',
      before: a?.before ?? null,
      after: a ? (a.after ?? null) : (req.body ?? null),
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0] ?? null,
      statusCode: res.statusCode,
    });
  });
  next();
}
