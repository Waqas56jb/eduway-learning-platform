/**
 * ROUTE BUILDER — the one way to declare an endpoint. It wires, in order:
 *   auth → RBAC permission → rate limit → validation (params/query/body) → idempotency → audit → extra
 *   middleware → handler → `{ success, data, meta }` envelope
 * and registers the endpoint in the OpenAPI document (/api/docs).
 *
 *   defineRoute(router, {
 *     method: 'get', path: '/students/:id', tags: ['Students'], summary: 'Get student',
 *     auth: 'admin', permission: 'users.view',
 *     params: idParam, response: StudentDto,
 *   }, async ({ params }) => studentsService.get(params.id));
 *
 * The handler returns the payload (wrapped into the envelope with `status`, default 200),
 * or `paged(items, meta)`, or writes to `res` itself (`raw: true`, e.g. SSE / file download).
 */
import type { Request, RequestHandler, Response, Router } from 'express';
import type { z, ZodTypeAny } from 'zod';
import { API_VERSION_PREFIX, type PermissionKey } from '../../config/constants.js';
import { registry } from '../../docs/openapi.js';
import { audit, type AuditOptions } from '../middleware/audit.js';
import { optionalStudent, requireAdmin, requireAnyUser, requireStudent, requireStudentPartial } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import { requireAnyPermission, requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import type { AdminPrincipal, StudentPrincipal } from '../types/index.js';
import { isPaged, ok } from '../utils/response.js';
import { envelope, errorEnvelope } from '../validation/schemas.js';
import { z as zod } from '../validation/zod.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
export type AuthMode = 'public' | 'student' | 'student*' | 'admin' | 'any' | 'optional';

export interface RouteDef<A extends AuthMode, B extends ZodTypeAny | undefined, Q extends ZodTypeAny | undefined, P extends ZodTypeAny | undefined> {
  method: HttpMethod;
  /** Express path relative to /api/v1, e.g. `/students/:id`. */
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  auth: A;
  /** Admin permission(s) — ALL required (Super Admin bypasses). */
  permission?: PermissionKey | PermissionKey[];
  /** Admin permission(s) — ANY one suffices. */
  anyPermission?: PermissionKey[];
  body?: B;
  query?: Q;
  params?: P;
  /** zod schema of `data` (documentation only). */
  response?: ZodTypeAny;
  status?: 200 | 201 | 202;
  rateLimit?: RequestHandler;
  idempotency?: 'required' | 'optional';
  audit?: AuditOptions;
  /** Extra middleware run right before the handler (uploads, entitlement guards, …). */
  middleware?: RequestHandler[];
  /** Handler writes the response itself. */
  raw?: boolean;
  /** Response content type for docs when raw (e.g. 'text/event-stream', 'text/csv'). */
  rawContentType?: string;
  deprecated?: boolean;
}

type Infer<S> = S extends ZodTypeAny ? z.output<S> : undefined;

export interface HandlerCtx<A extends AuthMode, B, Q, P> {
  req: Request;
  res: Response;
  body: B;
  query: Q;
  params: P;
  student: A extends 'student' | 'student*' ? StudentPrincipal : StudentPrincipal | undefined;
  admin: A extends 'admin' ? AdminPrincipal : AdminPrincipal | undefined;
  locale: 'en' | 'ar';
}

/** Security-relevant summary of every declared route (consumed by the route-coverage security test). */
export interface RouteManifestEntry {
  method: HttpMethod;
  path: string;
  auth: AuthMode;
  permissions: string[];
  anyPermissions: string[];
  hasParams: boolean;
  hasQuery: boolean;
  hasBody: boolean;
  rateLimited: boolean;
}
export const routeManifest: RouteManifestEntry[] = [];

const toOpenApiPath = (p: string) => `${API_VERSION_PREFIX}${p}`.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

const AUTH_MW: Record<AuthMode, RequestHandler | null> = {
  public: null,
  student: requireStudent,
  'student*': requireStudentPartial,
  admin: requireAdmin,
  any: requireAnyUser,
  optional: optionalStudent,
};

function isZodObject(s: ZodTypeAny | undefined): s is zod.AnyZodObject {
  return !!s && (s as { _def?: { typeName?: string } })._def?.typeName === 'ZodObject';
}

export function defineRoute<
  A extends AuthMode,
  B extends ZodTypeAny | undefined = undefined,
  Q extends ZodTypeAny | undefined = undefined,
  P extends ZodTypeAny | undefined = undefined,
>(router: Router, def: RouteDef<A, B, Q, P>, handler: (ctx: HandlerCtx<A, Infer<B>, Infer<Q>, Infer<P>>) => Promise<unknown> | unknown): void {
  const chain: RequestHandler[] = [];
  const authMw = AUTH_MW[def.auth];
  if (authMw) chain.push(authMw);
  if (def.permission) {
    if (def.auth !== 'admin') throw new Error(`${def.method.toUpperCase()} ${def.path}: permission requires auth 'admin'`);
    chain.push(requirePermission(...(Array.isArray(def.permission) ? def.permission : [def.permission])));
  }
  if (def.anyPermission) chain.push(requireAnyPermission(...def.anyPermission));
  if (def.rateLimit) chain.push(def.rateLimit);
  if (def.params || def.query || def.body) chain.push(validate({ params: def.params, query: def.query, body: def.body }));
  if (def.idempotency) chain.push(idempotency(def.idempotency));
  if (def.audit) chain.push(audit(def.audit));
  if (def.middleware) chain.push(...def.middleware);

  const final: RequestHandler = async (req, res) => {
    const result = await handler({
      req,
      res,
      body: req.body as Infer<B>,
      query: req.query as Infer<Q>,
      params: req.params as Infer<P>,
      student: req.student as HandlerCtx<A, unknown, unknown, unknown>['student'],
      admin: req.admin as HandlerCtx<A, unknown, unknown, unknown>['admin'],
      locale: req.locale,
    });
    if (def.raw || res.headersSent) return;
    if (isPaged(result)) ok(res, result.items, result.meta, def.status ?? 200);
    else ok(res, result === undefined ? null : result, undefined, def.status ?? 200);
  };

  router[def.method](def.path, ...chain, final);
  routeManifest.push({
    method: def.method,
    path: def.path,
    auth: def.auth,
    permissions: def.permission ? (Array.isArray(def.permission) ? def.permission : [def.permission]) : [],
    anyPermissions: def.anyPermission ?? [],
    hasParams: !!def.params,
    hasQuery: !!def.query,
    hasBody: !!def.body,
    rateLimited: !!def.rateLimit,
  });
  registerDocs(def);
}

function registerDocs(def: RouteDef<AuthMode, ZodTypeAny | undefined, ZodTypeAny | undefined, ZodTypeAny | undefined>): void {
  const status = String(def.status ?? 200);
  const security: Record<string, string[]>[] =
    def.auth === 'admin' ? [{ adminBearer: [] }] : def.auth === 'student' || def.auth === 'student*' ? [{ studentBearer: [] }] : def.auth === 'any' ? [{ studentBearer: [] }, { adminBearer: [] }] : [];
  const perms = def.permission ? (Array.isArray(def.permission) ? def.permission : [def.permission]) : def.anyPermission;
  const description = [def.description, perms?.length ? `**Permission:** \`${perms.join('`, `')}\`` : null, def.idempotency ? `**Idempotency-Key:** ${def.idempotency}` : null]
    .filter(Boolean)
    .join('\n\n');

  registry.registerPath({
    method: def.method,
    path: toOpenApiPath(def.path),
    tags: def.tags,
    summary: def.summary,
    description: description || undefined,
    deprecated: def.deprecated,
    security,
    request: {
      ...(isZodObject(def.params) ? { params: def.params } : {}),
      ...(isZodObject(def.query) ? { query: def.query } : {}),
      ...(def.body ? { body: { content: { 'application/json': { schema: def.body } } } } : {}),
    },
    responses: {
      [status]: def.raw
        ? { description: 'OK', content: { [def.rawContentType ?? 'application/octet-stream']: { schema: zod.string() } } }
        : { description: 'OK', content: { 'application/json': { schema: envelope(def.response ?? zod.unknown()) } } },
      default: { description: 'Error', content: { 'application/json': { schema: errorEnvelope } } },
    },
  });
}
